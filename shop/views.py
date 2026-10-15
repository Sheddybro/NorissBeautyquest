import json
from pathlib import Path
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse,HttpResponse
from django.middleware.csrf import get_token
from django.shortcuts import render
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_GET,require_POST
from .models import Membership,Store
from .services import snapshot,apply_operation,ShopError,text,member_for
@login_required
@never_cache
def dashboard(request):
 return render(request,'shop/app.html',{'offline_shell':False})
@require_GET
def offline_shell(request):
 response=render(request,'shop/app.html',{'offline_shell':True})
 response['Cache-Control']='public,max-age=0,must-revalidate'
 return response
@require_GET
@never_cache
def bootstrap(request):
 try:
  data=snapshot(request.user);data['csrf_token']=get_token(request)
  return JsonResponse(data)
 except ShopError as e:return JsonResponse({'error':e.message},status=e.status)
@require_POST
@never_cache
def operation(request):
 try:
  if len(request.body)>350000:raise ShopError('Operation is too large.')
  try:data=json.loads(request.body)
  except (json.JSONDecodeError,UnicodeDecodeError):raise ShopError('Invalid JSON operation.')
  return JsonResponse(apply_operation(request.user,data))
 except ShopError as e:return JsonResponse({'error':e.message},status=e.status)
@login_required
@never_cache
def owner_staff(request):
 try:
  member=member_for(request.user)
  if member.role!='owner':raise ShopError('Only the owner can manage staff and shop access.',403)
  if request.method=='GET':
   members=[]
   for membership in Membership.objects.select_related('user').filter(store=member.store).order_by('user__username'):
    members.append({'id':membership.user_id,'username':membership.user.username,'role':membership.role,'permissions':list(membership.permissions or []),'is_owner':membership.role=='owner'})
   return JsonResponse({'store':member.store.name,'members':members})
  try:data=json.loads(request.body or '{}')
  except (json.JSONDecodeError,UnicodeDecodeError):raise ShopError('Invalid JSON for staff management.',400)
  username=text(data,'username',50)
  role=data.get('role','staff')
  if role not in ['staff','cashier','viewer']:raise ShopError('Only staff roles can be assigned here.',400)
  permissions=[]
  if not isinstance(data.get('permissions',[]),list):raise ShopError('Permissions must be a list.',400)
  for value in data.get('permissions',[]):
   if isinstance(value,str) and value in {'product','product_update','sale','checkout','purchase','refund','expense','reconcile'} and value not in permissions:
    permissions.append(value)
  create_user=(data.get('action','create')!='update')
  if create_user:
   password=data.get('password','')
   if not isinstance(password,str) or len(password)<8:raise ShopError('Password must contain at least 8 characters.',400)
   if get_user_model().objects.filter(username=username).exists():
    raise ShopError('That username is already in use. Choose another username.',409)
   user=get_user_model().objects.create_user(username=username,password=password)
   membership=Membership.objects.create(user=user,store=member.store,role=role,permissions=permissions)
   return JsonResponse({'success':True,'username':username,'role':role,'permissions':permissions,'created':True})
  try:user_id=int(data.get('user_id'))
  except (TypeError,ValueError):raise ShopError('Choose a valid staff account.',400)
  membership=Membership.objects.filter(user_id=user_id,store=member.store).select_related('user').first()
  if membership is None:raise ShopError('Staff account not found.',404)
  if membership.role=='owner':raise ShopError('Owner accounts cannot be edited through staff management.',403)
  if membership.user_id==request.user.id and role!='owner':
   raise ShopError('The owner account cannot remove its own owner access from this shop.',403)
  membership.role=role;membership.permissions=permissions;membership.save(update_fields=['role','permissions'])
  return JsonResponse({'success':True,'username':membership.user.username,'role':role,'permissions':permissions})
 except ShopError as e:return JsonResponse({'error':e.message},status=e.status)
@login_required
@never_cache
def owner_settings(request):
 try:
  member=member_for(request.user)
  if member.role!='owner':raise ShopError('Only the owner can edit the shop settings.',403)
  if request.method=='GET':return JsonResponse({'store_name':member.store.name})
  try:data=json.loads(request.body or '{}')
  except (json.JSONDecodeError,UnicodeDecodeError):raise ShopError('Invalid JSON for business settings.',400)
  member.store.name=text(data,'name',100)
  member.store.save(update_fields=['name'])
  return JsonResponse({'success':True,'store_name':member.store.name})
 except ShopError as e:return JsonResponse({'error':e.message},status=e.status)
@require_GET
def manifest(request):
 return JsonResponse({'id':'/','name':'Noriss Beautyquest Retail Manager','short_name':'Noriss','description':'Sales, purchases and inventory. Online and offline.','start_url':'/','scope':'/','display':'standalone','background_color':'#f4f6fb','theme_color':'#090d18','icons':[{'src':'/static/shop/icons/icon-192.png','sizes':'192x192','type':'image/png','purpose':'any'},{'src':'/static/shop/icons/icon-512.png','sizes':'512x512','type':'image/png','purpose':'any'},{'src':'/static/shop/icons/maskable-512.png','sizes':'512x512','type':'image/png','purpose':'maskable'}]},content_type='application/manifest+json')
@require_GET
def service_worker(request):
 response=HttpResponse((Path(settings.BASE_DIR)/'static/shop/sw.js').read_text(),content_type='application/javascript')
 response['Cache-Control']='no-cache';response['Service-Worker-Allowed']='/'
 return response
@require_GET
def health(request):return JsonResponse({'status':'ok'})

@login_required
@never_cache
@require_GET
def receipt_view(request,receipt_id):
 from django.shortcuts import get_object_or_404
 from .models import Receipt
 from .services import member_for
 try:member=member_for(request.user)
 except ShopError as e:return JsonResponse({'error':e.message},status=e.status)
 receipt=get_object_or_404(Receipt.objects.select_related('store'),id=receipt_id,store=member.store)
 items=list(receipt.items.select_related('product'))
 for item in items:item.line_total=item.quantity*item.unit_amount
 total=sum(item.line_total for item in items);refunded=sum(r.amount for item in items for r in item.refunds.all())
 response=render(request,'shop/receipt.html',{'receipt':receipt,'items':items,'total':total,'refunded':refunded,'net':total-refunded})
 if request.GET.get('download')=='1':response['Content-Disposition']=f'attachment; filename="{receipt.reference}.html"'
 return response
