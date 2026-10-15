"""Atomic retail ledger. Money is integer kobo; rejected writes leave no stock changes."""
import base64,hashlib,io,json,uuid
from datetime import timedelta,date
from PIL import Image,UnidentifiedImageError
from django.db import transaction,IntegrityError,OperationalError
from django.db.models import Sum
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from .models import (Membership,Store,Product,Movement,Operation,Receipt,Batch,Allocation,Refund,Expense,Reconciliation,AuditLog,SyncConflict)
from .permissions import can_operate, permitted_operations
class ShopError(Exception):
 def __init__(self,message,status=400):self.message,self.status=message,status

def member_for(user):
 if not user.is_authenticated:raise ShopError('Sign in online before syncing.',401)
 try:return Membership.objects.select_related('store').get(user=user)
 except Membership.DoesNotExist:raise ShopError('Ask the owner to assign you to the shop in Django admin.',403)
def integer(data,key,maximum=1_000_000_000,minimum=1):
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
def timestamp(raw):
 if not isinstance(raw,str):raise ShopError('Invalid transaction date.')
 try:value=parse_datetime(raw)
 except ValueError:value=None
 if not value or timezone.is_naive(value) or value>timezone.now()+timedelta(minutes=10):raise ShopError('Check your device clock. The transaction date is invalid or in the future.')
 return value.isoformat()
def valid_day(raw):
 try:return date.fromisoformat(raw).isoformat()
 except (ValueError,TypeError):raise ShopError('Enter a valid date.')
def photo(raw):
 if not raw:return ''
 if not isinstance(raw,str) or len(raw)>300_000 or not raw.startswith(('data:image/jpeg;base64,','data:image/png;base64,','data:image/webp;base64,')):raise ShopError('Use a small JPEG, PNG or WebP product photo.')
 try:
  data=base64.b64decode(raw.split(',',1)[1],validate=True)
  im=Image.open(io.BytesIO(data));w,h=im.size
  if w*h>4_000_000 or w>2048 or h>2048:raise ShopError('Resize the photo before upload.')
  im.verify()
 except (ValueError,UnidentifiedImageError,OSError):raise ShopError('Invalid product photo.')
 return raw
def validate(data):
 if not isinstance(data,dict):raise ShopError('Invalid operation.')
 p={'request_id':str(uid(data.get('request_id'))),'kind':data.get('kind')};kind=p['kind']
 if kind in ('product','product_update'):
  p.update(name=text(data,'name',100),category=text(data,'category',60),price=integer(data,'price'),reorder=integer(data,'reorder',1_000_000,0),barcode=text(data,'barcode',80,True),photo=photo(data.get('photo','')))
  if kind=='product_update':
   if type(data.get('active')) is not bool:raise ShopError('Invalid active status.')
   p.update(product_id=str(uid(data.get('product_id'))),version=integer(data,'version'),active=data['active'])
 elif kind in ('sale','purchase','checkout'):
  if data.get('payment') not in ['Cash','Transfer','POS card']:raise ShopError('Select Cash, Transfer or POS card.')
  p.update(payment=data['payment'],party=text(data,'party',100,kind!='purchase') or 'Walk-in customer',created=timestamp(data.get('created')))
  if kind=='checkout':
   lines=data.get('lines')
   if not isinstance(lines,list) or not 1<=len(lines)<=100:raise ShopError('Add between 1 and 100 cart lines.')
   p['lines']=[];seen=set()
   for line in lines:
    if not isinstance(line,dict):raise ShopError('Invalid cart line.')
    item={'product_id':str(uid(line.get('product_id'))),'quantity':integer(line,'quantity',1_000_000),'unit_amount':integer(line,'unit_amount')}
    if item['product_id'] in seen:raise ShopError('Combine duplicate products into one cart line.')
    seen.add(item['product_id']);p['lines'].append(item)
  else:p.update(product_id=str(uid(data.get('product_id'))),quantity=integer(data,'quantity',1_000_000),unit_amount=integer(data,'unit_amount'))
  if kind=='purchase':p.update(batch_code=text(data,'batch_code',60,True),expires=valid_day(data['expires']) if data.get('expires') else None)
 elif kind=='refund':
  if type(data.get('restock')) is not bool:raise ShopError('Choose whether returned goods are restocked.')
  if data.get('payment') not in ['Cash','Transfer','POS card']:raise ShopError('Select the refund payment method.')
  p.update(movement_id=str(uid(data.get('movement_id'))),quantity=integer(data,'quantity',1_000_000),restock=data['restock'],reason=text(data,'reason',200),payment=data['payment'],created=timestamp(data.get('created')))
 elif kind=='expense':
  if data.get('payment') not in ['Cash','Transfer','POS card']:raise ShopError('Select an expense payment method.')
  p.update(description=text(data,'description',150),amount=integer(data,'amount'),payment=data['payment'],created=timestamp(data.get('created')))
 elif kind=='reconcile':
  p.update(day=valid_day(data.get('day')),opening_cash=integer(data,'opening_cash',minimum=0),actual_cash=integer(data,'actual_cash',minimum=0),actual_transfer=integer(data,'actual_transfer',minimum=0),actual_pos=integer(data,'actual_pos',minimum=0),note=text(data,'note',200,True))
 else:raise ShopError('Unknown operation type.')
 return p

def available(product,on_date):
 expired=Batch.objects.filter(product=product,expires__lt=on_date).aggregate(n=Sum('quantity'))['n'] or 0
 return product.stock-expired

def sale_line(user,store,line,record_id,receipt,details):
 try:p=Product.objects.select_for_update().get(pk=line['product_id'],store=store)
 except Product.DoesNotExist:raise ShopError('Product is unavailable. Sync its product record first.',409)
 if not p.active:raise ShopError(f'{p.name} is archived. Choose an active product.',409)
 qty=line['quantity'];sale_date=timezone.localtime(parse_datetime(details['created'])).date();sellable=available(p,sale_date)
 if qty>sellable:raise ShopError(f'Only {sellable} sellable units of {p.name} remain on the server. Review this offline sale.',409)
 cost=p.inventory_cost*qty//p.stock if p.stock else 0
 m=Movement.objects.create(id=record_id,store=store,product=p,kind='sale',quantity=qty,unit_amount=line['unit_amount'],party=details['party'],payment=details['payment'],created=parse_datetime(details['created']),recorded_by=user,receipt=receipt,product_name=p.name,cost_total=cost,cost_known=p.cost_known)
 remaining=qty
 # FEFO: earliest expiry first, then undated stock. Expiry day itself is valid.
 batches=list(Batch.objects.filter(product=p,quantity__gt=0).order_by('received'))
 batches.sort(key=lambda b:(b.expires or date.max,b.received))
 for b in batches:
  if b.expires and b.expires<sale_date:continue
  take=min(remaining,b.quantity)
  if take:Allocation.objects.create(movement=m,batch=b,quantity=take);b.quantity-=take;b.save(update_fields=['quantity']);remaining-=take
  if not remaining:break
 p.stock-=qty;p.inventory_cost-=cost
 if not p.stock:p.inventory_cost=0;p.cost_known=True
 p.save(update_fields=['stock','inventory_cost','cost_known'])
 return m

def expected_payments(store,day_value,opening_cash=0):
 result={'Cash':opening_cash,'Transfer':0,'POS card':0}
 for m in Movement.objects.filter(store=store,kind='sale',created__date=day_value):result[m.payment]+=m.quantity*m.unit_amount
 for r in Refund.objects.filter(movement__store=store,created__date=day_value):result[r.payment]-=r.amount
 for e in Expense.objects.filter(store=store,created__date=day_value):result[e.payment]-=e.amount
 # Stock purchases are shop outflows and must be included in reconciliation.
 for m in Movement.objects.filter(store=store,kind='purchase',created__date=day_value):result[m.payment]-=m.quantity*m.unit_amount
 return result

def _apply(user,member,p,fingerprint):
 with transaction.atomic():
  store=Store.objects.select_for_update().get(pk=member.store_id)
  old=Operation.objects.filter(pk=p['request_id']).first()
  if old:
   if old.store_id!=store.id or old.user_id!=user.id or old.fingerprint!=fingerprint:raise ShopError('This request identifier already belongs to another record.',409)
   return {'ok':True,'duplicate':True,'request_id':p['request_id']}
  Operation.objects.create(id=p['request_id'],store=store,user=user,fingerprint=fingerprint)
  kind=p['kind'];result={'ok':True,'duplicate':False,'request_id':p['request_id']}
  if kind=='product':Product.objects.create(id=p['request_id'],store=store,name=p['name'],category=p['category'],price=p['price'],reorder=p['reorder'],barcode=p['barcode'],photo=p['photo'],cost_known=True)
  elif kind=='product_update':
   try:product=Product.objects.select_for_update().get(pk=p['product_id'],store=store)
   except Product.DoesNotExist:raise ShopError('Product is unavailable.',409)
   if product.version!=p['version']:raise ShopError('Product changed on another device. Refresh and review the latest version.',409)
   for field in ['name','category','price','reorder','barcode','photo','active']:setattr(product,field,p[field])
   product.version+=1;product.save()
  elif kind=='purchase':
   try:product=Product.objects.select_for_update().get(pk=p['product_id'],store=store)
   except Product.DoesNotExist:raise ShopError('Product is unavailable. Sync its product record first.',409)
   if not product.active:raise ShopError('Reactivate the archived product before purchasing stock.',409)
   Movement.objects.create(id=p['request_id'],store=store,product=product,kind=kind,quantity=p['quantity'],unit_amount=p['unit_amount'],party=p['party'],payment=p['payment'],created=parse_datetime(p['created']),recorded_by=user,product_name=product.name,cost_total=p['quantity']*p['unit_amount'],cost_known=True)
   Batch.objects.create(id=uuid.uuid5(uid(p['request_id']),'batch'),product=product,code=p['batch_code'] or 'LOT-'+p['request_id'][:8],expires=p['expires'],quantity=p['quantity'])
   if product.stock==0:product.cost_known=True
   product.stock+=p['quantity'];product.inventory_cost+=p['quantity']*p['unit_amount'];product.save(update_fields=['stock','inventory_cost','cost_known'])
  elif kind in ('sale','checkout'):
   receipt=Receipt.objects.create(id=p['request_id'],store=store,number=store.next_receipt,party=p['party'],payment=p['payment'],created=parse_datetime(p['created']),recorded_by=user)
   store.next_receipt+=1;store.save(update_fields=['next_receipt'])
   lines=p['lines'] if kind=='checkout' else [p]
   for i,line in enumerate(lines):sale_line(user,store,line,p['request_id'] if kind=='sale' else uuid.uuid5(uid(p['request_id']),str(i)),receipt,p)
   result['receipt']=receipt.reference
  elif kind=='refund':
   try:m=Movement.objects.select_for_update().get(pk=p['movement_id'],store=store,kind='sale')
   except Movement.DoesNotExist:raise ShopError('Choose a confirmed sale from this shop.',409)
   if parse_datetime(p['created'])<m.created:raise ShopError('A refund cannot predate its original sale.')
   prior=list(m.refunds.all());returned=sum(r.quantity for r in prior)
   if returned+p['quantity']>m.quantity:raise ShopError('Refund quantity exceeds the unreturned sale quantity.',409)
   cost=m.cost_total*(returned+p['quantity'])//m.quantity-sum(r.cost_total for r in prior)
   Refund.objects.create(id=p['request_id'],movement=m,quantity=p['quantity'],amount=p['quantity']*m.unit_amount,cost_total=cost,restock=p['restock'],reason=p['reason'],payment=p['payment'],created=parse_datetime(p['created']),recorded_by=user)
   if p['restock']:
    product=Product.objects.select_for_update().get(pk=m.product_id);empty=product.stock==0
    product.stock+=p['quantity'];product.inventory_cost+=cost;product.cost_known=(m.cost_known if empty else product.cost_known and m.cost_known);product.save(update_fields=['stock','inventory_cost','cost_known'])
   remaining=p['quantity']
   for allocation in m.allocations.select_for_update().select_related('batch'):
    take=min(remaining,allocation.quantity-allocation.returned)
    if take:
     allocation.returned+=take;allocation.save(update_fields=['returned'])
     if p['restock']:
      batch=allocation.batch;batch.quantity+=take;batch.save(update_fields=['quantity'])
     remaining-=take
    if not remaining:break
  elif kind=='expense':Expense.objects.create(id=p['request_id'],store=store,description=p['description'],amount=p['amount'],payment=p['payment'],created=parse_datetime(p['created']),recorded_by=user)
  elif kind=='reconcile':
   if Reconciliation.objects.filter(store=store,day=p['day']).exists():raise ShopError('This day is already reconciled. Review the existing record.',409)
   Reconciliation.objects.create(id=p['request_id'],store=store,day=p['day'],opening_cash=p['opening_cash'],actual_cash=p['actual_cash'],actual_transfer=p['actual_transfer'],actual_pos=p['actual_pos'],expected=expected_payments(store,p['day'],p['opening_cash']),note=p['note'],recorded_by=user)
  audit_payload={k:v for k,v in p.items() if k!='photo'}
  if kind=='product_update':audit_payload['photo_changed']=bool(p['photo'])
  AuditLog.objects.create(store=store,user=user,action=kind,reference=p['request_id'],details=audit_payload)
  SyncConflict.objects.filter(pk=p['request_id'],store=store).update(resolved=True)
  return result

def apply_operation(user,data):
 member=member_for(user);p=validate(data)
 if not can_operate(member,p['kind']):raise ShopError('You do not have permission to perform this operation.',403)
 fp=hashlib.sha256(json.dumps(p,sort_keys=True).encode()).hexdigest()
 try:return _apply(user,member,p,fp)
 except IntegrityError:
  old=Operation.objects.filter(pk=p['request_id'],store=member.store,user=user,fingerprint=fp).first()
  if old:return {'ok':True,'duplicate':True,'request_id':p['request_id']}
  raise ShopError('Record conflict: the barcode or reference already exists.',409)
 except OperationalError:raise ShopError('The database is busy. Your local record is safe; retry syncing.',503)
 except ShopError as e:
  if e.status==409 and not Operation.objects.filter(pk=p['request_id']).exists():
   SyncConflict.objects.update_or_create(id=p['request_id'],defaults={'store':member.store,'user':user,'payload':{k:v for k,v in p.items() if k!='photo'},'message':e.message,'resolved':False})
  raise

def snapshot(user):
 member=member_for(user)
 with transaction.atomic():
  Store.objects.select_for_update().get(pk=member.store_id)
  products=list(Product.objects.filter(store=member.store).values('id','name','category','price','reorder','stock','barcode','photo','active','version'))
  # Compute expired inventory in one grouped query rather than one query per product.
  expired_by_product = dict(Batch.objects.filter(
   product__store=member.store,expires__lt=timezone.localdate()
  ).values('product_id').annotate(total=Sum('quantity')).values_list('product_id','total'))
  for p in products:
   p['id']=str(p['id'])
   p['sellable']=p['stock']-expired_by_product.get(p['id'],0)
  movements=list(Movement.objects.filter(store=member.store).values('id','product_id','product__name','product_name','kind','quantity','unit_amount','party','payment','created','recorded_by__username','receipt_id','cost_total','cost_known'))
  refunds=list(Refund.objects.filter(movement__store=member.store).values('id','movement_id','movement__product_id','quantity','amount','cost_total','restock','reason','payment','created'))
  receipts=[]
  # Prefetch receipt lines once to avoid a query for every receipt.
  for r in Receipt.objects.filter(store=member.store).prefetch_related('items'):
   receipts.append({'id':str(r.id),'reference':r.reference,'party':r.party,'payment':r.payment,'created':r.created.isoformat(),'total':sum(m.quantity*m.unit_amount for m in r.items.all())})
  batches=list(Batch.objects.filter(product__store=member.store,quantity__gt=0).values('id','product_id','product__name','code','expires','quantity'))
  allocations=list(Allocation.objects.filter(movement__store=member.store).values('movement_id','batch_id','batch__expires','quantity','returned'))
  expenses=list(Expense.objects.filter(store=member.store).values('id','description','amount','payment','created'))
  reconciliations=list(Reconciliation.objects.filter(store=member.store).order_by('-day').values('id','day','opening_cash','actual_cash','actual_transfer','actual_pos','expected','note'))
  for close in reconciliations:close['current_expected']=expected_payments(member.store,close['day'],close['opening_cash'])
  audits=list(AuditLog.objects.filter(store=member.store).order_by('-created').values('action','reference','details','created','user__username')[:200]) if member.role=='owner' else []
  for m in movements:
   m['name']=m.pop('product_name') or m.pop('product__name');m.pop('product__name',None);m['recorded_by']=m.pop('recorded_by__username');m['status']='synced';m['returned']=sum(r['quantity'] for r in refunds if r['movement_id']==m['id'])
  for r in refunds:r['product_id']=r.pop('movement__product_id')
  if member.role!='owner':
   expenses=[];reconciliations=[]
   for m in movements:m['cost_total']=0;m['cost_known']=False
   for r in refunds:r['cost_total']=0
  def serialise(rows):return json.loads(json.dumps(rows,default=lambda v:v.isoformat() if hasattr(v,'isoformat') else str(v)))
  staff_members=[]
  if member.role=='owner':
   for row in Membership.objects.select_related('user').filter(store=member.store).order_by('user__username'):
    staff_members.append({'id':row.user_id,'username':row.user.username,'role':row.role,'permissions':list(row.permissions or [])})
  result={'account':{'key':f'{member.store_id}:{user.id}','user_id':user.id,'username':user.get_username(),'store_id':member.store_id,'store':member.store.name,'store_name':member.store.name,'role':member.role,'allowed_operations':permitted_operations(member),'staff_members':staff_members},'products':products,'movements':serialise(movements),'refunds':serialise(refunds),'receipts':receipts,'batches':serialise(batches),'allocations':serialise(allocations),'expenses':serialise(expenses),'reconciliations':serialise(reconciliations),'audits':serialise(audits),'acknowledged_ids':[str(x) for x in Operation.objects.filter(store=member.store,user=user).values_list('id',flat=True)],'updated':timezone.now().isoformat()}
  return result
