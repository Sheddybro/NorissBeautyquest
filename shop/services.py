"""Business rules. All values are integer kobo; stock changes are transactional."""
import hashlib,json,uuid
from datetime import timedelta
from django.db import transaction,IntegrityError,OperationalError
from django.db.models import F
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from .models import Membership,Product,Movement,Operation,Store
class ShopError(Exception):
 def __init__(self,message,status=400):self.message,self.status=message,status

def member_for(user):
 if not user.is_authenticated:raise ShopError('Sign in online before syncing.',401)
 try:return Membership.objects.select_related('store').get(user=user)
 except Membership.DoesNotExist:raise ShopError('Ask the owner to assign you to the shop in Django admin.',403)

def integer(data,key,maximum,minimum=1):
 value=data.get(key)
 if type(value) is not int or not minimum<=value<=maximum:raise ShopError(f'Enter a valid {key.replace("_"," ")}.')
 return value

def text(data,key,maximum,optional=False):
 value=data.get(key,'')
 if not isinstance(value,str) or len(value)>maximum or (not optional and not value.strip()):raise ShopError(f'Enter a valid {key}.')
 return value.strip()

def uid(value):
 try:return uuid.UUID(str(value))
 except (ValueError,TypeError,AttributeError):raise ShopError('Invalid record identifier.')

def validate(data):
 if not isinstance(data,dict):raise ShopError('Invalid operation.')
 result={'request_id':str(uid(data.get('request_id'))),'kind':data.get('kind')}
 if result['kind']=='product':
  result.update(name=text(data,'name',100),category=text(data,'category',60),price=integer(data,'price',1_000_000_000),reorder=integer(data,'reorder',1_000_000,0))
 elif result['kind'] in ('sale','purchase'):
  amount=integer(data,'unit_amount',1_000_000_000);qty=integer(data,'quantity',1_000_000)
  party=text(data,'party',100,optional=result['kind']=='sale') or 'Walk-in customer'
  if data.get('payment') not in ['Cash','Transfer','POS card']:raise ShopError('Select Cash, Transfer or POS card.')
  raw=data.get('created')
  if not isinstance(raw,str):raise ShopError('Invalid transaction date.')
  try:created=parse_datetime(raw)
  except ValueError:created=None
  if not created or timezone.is_naive(created) or created>timezone.now()+timedelta(minutes=10):raise ShopError('Check your device clock. The transaction date is invalid or in the future.')
  result.update(product_id=str(uid(data.get('product_id'))),quantity=qty,unit_amount=amount,party=party,payment=data['payment'],created=created.isoformat())
 else:raise ShopError('Unknown operation type.')
 return result

def apply_operation(user,data):
 member=member_for(user);payload=validate(data)
 if member.role=='viewer':raise ShopError('Viewer accounts cannot record transactions.',403)
 if member.role=='cashier' and payload['kind']!='sale':raise ShopError('Only the owner can add products and record purchases.',403)
 fingerprint=hashlib.sha256(json.dumps(payload,sort_keys=True).encode()).hexdigest()
 try:
  with transaction.atomic():
   Store.objects.select_for_update().get(pk=member.store_id)
   old=Operation.objects.filter(pk=payload['request_id']).first()
   if old:
    if old.store_id!=member.store_id or old.user_id!=user.id or old.fingerprint!=fingerprint:raise ShopError('This request identifier already belongs to another record.',409)
    return {'ok':True,'duplicate':True,'request_id':payload['request_id']}
   Operation.objects.create(id=payload['request_id'],store=member.store,user=user,fingerprint=fingerprint)
   if payload['kind']=='product':
    Product.objects.create(id=payload['request_id'],store=member.store,name=payload['name'],category=payload['category'],price=payload['price'],reorder=payload['reorder'])
   else:
    try:p=Product.objects.select_for_update().get(pk=payload['product_id'],store=member.store)
    except Product.DoesNotExist:raise ShopError('Product is unavailable. Sync its product record first.',409)
    if payload['kind']=='sale':
     changed=Product.objects.filter(pk=p.id,stock__gte=payload['quantity']).update(stock=F('stock')-payload['quantity'])
     if not changed:raise ShopError(f'Only {p.stock} units of {p.name} remain on the server. Review this offline sale.',409)
    else:Product.objects.filter(pk=p.id).update(stock=F('stock')+payload['quantity'])
    Movement.objects.create(id=payload['request_id'],store=member.store,product=p,kind=payload['kind'],quantity=payload['quantity'],unit_amount=payload['unit_amount'],party=payload['party'],payment=payload['payment'],created=parse_datetime(payload['created']),recorded_by=user)
  return {'ok':True,'duplicate':False,'request_id':payload['request_id']}
 except IntegrityError:
  old=Operation.objects.filter(pk=payload['request_id'],store=member.store,user=user,fingerprint=fingerprint).first()
  if old:return {'ok':True,'duplicate':True,'request_id':payload['request_id']}
  raise ShopError('Record conflict. Refresh your shop and retry.',409)
 except OperationalError:raise ShopError('The database is busy. Your local record is safe; retry syncing.',503)

def snapshot(user):
 member=member_for(user)
 # Consistent snapshot: an operation cannot appear without its stock update.
 with transaction.atomic():
  Store.objects.select_for_update().get(pk=member.store_id)
  products=list(Product.objects.filter(store=member.store).values('id','name','category','price','reorder','stock'))
  movements=list(Movement.objects.filter(store=member.store).values('id','product_id','product__name','kind','quantity','unit_amount','party','payment','created','recorded_by__username'))
  for p in products:p['id']=str(p['id'])
  for m in movements:
   m['id']=str(m['id']);m['product_id']=str(m['product_id']);m['name']=m.pop('product__name');m['created']=m['created'].isoformat();m['recorded_by']=m.pop('recorded_by__username');m['status']='synced'
 return {'account':{'key':f'{member.store_id}:{user.id}','user_id':user.id,'username':user.get_username(),'store_id':member.store_id,'store':member.store.name,'role':member.role},'products':products,'movements':movements,'updated':timezone.now().isoformat()}
