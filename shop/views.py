import json
from pathlib import Path
from django.conf import settings
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse,HttpResponse
from django.middleware.csrf import get_token
from django.shortcuts import render
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_GET,require_POST
from .services import snapshot,apply_operation,ShopError
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
