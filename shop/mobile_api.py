"""Versioned native-client API; no changes to legacy browser endpoints."""
import json
import secrets
import hashlib
from datetime import timedelta
from django.contrib.auth import authenticate
from django.core.cache import cache
from django.conf import settings
from django.contrib.auth import get_user_model
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from .models import MobileToken
from .services import snapshot, member_for, ShopError, apply_operation

def reply_error(message, status=400):
    return JsonResponse({'error': message}, status=status)

def auth_user(request):
    header=request.headers.get('Authorization','')
    if not header.startswith('Bearer '):return None,None
    raw=header[7:].strip()
    if len(raw)!=64:return None,None
    record=MobileToken.objects.select_related('user').filter(token_hash=hashlib.sha256(raw.encode()).hexdigest(),expires_at__gt=timezone.now()).first()
    if not record or not record.user.is_active:return None,None
    return record.user,record

def parse(request):
    if len(request.body)>100000:raise ValueError('Request too large.')
    try:
        value=json.loads(request.body)
        if not isinstance(value,dict):raise ValueError()
        return value
    except (ValueError,UnicodeDecodeError):raise ValueError('Invalid JSON object.')

@csrf_exempt
@require_http_methods(['POST'])
def login(request):
    try:data=parse(request)
    except ValueError as e:return reply_error(str(e))
    username=data.get('username');password=data.get('password')
    if not isinstance(username,str) or not isinstance(password,str):return reply_error('Invalid credentials.',401)
    # Rate-limit failed logins. For multi-worker deployments configure a SHARED
    # Django cache (e.g. Redis); LocMemCache limits only per process.
    ip=request.META.get('REMOTE_ADDR','unknown')
    identity=hashlib.sha256((ip+'|'+username.casefold()).encode()).hexdigest()
    key='noriss:mobile:failed:'+identity
    if cache.get(key,0)>=5:return reply_error('Too many login attempts. Try again in 15 minutes.',429)
    user=authenticate(request,username=username,password=password)
    if user is None or not user.is_active:
        try:cache.incr(key)
        except ValueError:cache.set(key,1,900)
        return reply_error('Invalid credentials.',401)
    cache.delete(key)
    try:member=member_for(user)
    except ShopError:return reply_error('No authorized business membership.',403)
    raw=secrets.token_hex(32)
    expires=timezone.now()+timedelta(hours=12)
    MobileToken.objects.filter(expires_at__lte=timezone.now()).delete()
    MobileToken.objects.create(user=user,token_hash=hashlib.sha256(raw.encode()).hexdigest(),expires_at=expires)
    return JsonResponse({'access_token':raw,'token_type':'Bearer','expires_at':expires.isoformat(),'user':{'username':user.get_username(),'role':member.role,'store':member.store.name}})

@csrf_exempt
@require_http_methods(['POST'])
def logout(request):
    user,record=auth_user(request)
    if not user:return reply_error('Authentication required.',401)
    record.delete()
    return JsonResponse({'success':True})

@require_http_methods(['GET'])
def me(request):
    user,_=auth_user(request)
    if not user:return reply_error('Authentication required.',401)
    try:
        data=snapshot(user)
        return JsonResponse({'account':data['account']})
    except ShopError as e:return reply_error(e.message,e.status)

@require_http_methods(['GET'])
def products(request):
    user,_=auth_user(request)
    if not user:return reply_error('Authentication required.',401)
    try:
        data=snapshot(user)
        return JsonResponse({'products':data['products'],'updated':data['updated']})
    except ShopError as e:return reply_error(e.message,e.status)

@require_http_methods(['GET'])
def dashboard(request):
    user,_=auth_user(request)
    if not user:return reply_error('Authentication required.',401)
    try:
        data=snapshot(user)
        return JsonResponse({'account':data['account'],'products':data['products'],'receipts':data['receipts'][-10:],'updated':data['updated']})
    except ShopError as e:return reply_error(e.message,e.status)


@csrf_exempt
@require_http_methods(['POST'])
def checkout(request):
    """Online-only native checkout, using the existing atomic, idempotent ledger."""
    user,_ = auth_user(request)
    if not user:return reply_error('Authentication required.',401)
    try:
        data=parse(request)
        if data.get('kind')!='checkout':return reply_error('Expected checkout operation.')
        result=apply_operation(user,data)
        return JsonResponse(result)
    except ValueError as e:return reply_error(str(e))
    except ShopError as e:return reply_error(e.message,e.status)

@require_http_methods(['GET'])
def receipts(request):
    user,_=auth_user(request)
    if not user:return reply_error('Authentication required.',401)
    try:
        data=snapshot(user)
        sales=[m for m in data['movements'] if m['kind']=='sale']
        for receipt in data['receipts'][-100:]:
            receipt['lines']=[{'id':m['id'],'name':m['name'],'quantity':m['quantity'],'returned':m['returned'],'remaining':m['quantity']-m['returned'],'unit_amount':m['unit_amount']} for m in sales if m['receipt_id']==receipt['id']]
        return JsonResponse({'receipts':data['receipts'][-100:]})
    except ShopError as e:return reply_error(e.message,e.status)


@csrf_exempt
@require_http_methods(['POST'])
def refund_mobile(request):
    """Record a native refund through the shared permission-checked ledger."""
    user,_=auth_user(request)
    if not user:return reply_error('Authentication required.',401)
    try:
        data=parse(request)
        if data.get('kind')!='refund':return reply_error('Expected refund operation.')
        return JsonResponse(apply_operation(user,data))
    except ValueError as e:return reply_error(str(e))
    except ShopError as e:return reply_error(e.message,e.status)


@csrf_exempt
@require_http_methods(['GET', 'POST'])
def owner_settings_mobile(request):
    """Native owner settings; existing browser endpoint is unchanged."""
    user,_=auth_user(request)
    if not user:return reply_error('Authentication required.',401)
    try:
        from .services import text
        member=member_for(user)
        if member.role!='owner':return reply_error('Owner access required.',403)
        if request.method=='GET':return JsonResponse({'store_name':member.store.name})
        data=parse(request)
        member.store.name=text(data,'name',100)
        member.store.save(update_fields=['name'])
        return JsonResponse({'success':True,'store_name':member.store.name})
    except ValueError as e:return reply_error(str(e))
    except ShopError as e:return reply_error(e.message,e.status)

@csrf_exempt
@require_http_methods(['GET', 'POST'])
def owner_staff_mobile(request):
    """Mobile staff management with server-side owner restrictions."""
    user,_=auth_user(request)
    if not user:return reply_error('Authentication required.',401)
    try:
        from django.db import transaction
        from .models import Membership
        from .services import text
        member=member_for(user)
        if member.role!='owner':return reply_error('Owner access required.',403)
        if request.method=='GET':
            members=[{'id':m.user_id,'username':m.user.username,'role':m.role,'permissions':m.permissions or [],'is_owner':m.role=='owner'} for m in Membership.objects.select_related('user').filter(store=member.store).order_by('user__username')]
            return JsonResponse({'store':member.store.name,'members':members})
        data=parse(request)
        role=data.get('role','staff')
        if role not in ('staff','cashier','viewer'):return reply_error('Only staff roles can be assigned.',400)
        grants=data.get('permissions',[])
        if not isinstance(grants,list):return reply_error('Permissions must be a list.',400)
        valid={'product','product_update','sale','checkout','purchase','refund','expense','reconcile'}
        permissions=list(dict.fromkeys(v for v in grants if isinstance(v,str) and v in valid))
        if data.get('action')=='update':
            try:uid=int(data.get('user_id'))
            except (ValueError,TypeError):return reply_error('Invalid staff ID.',400)
            m=Membership.objects.filter(store=member.store,user_id=uid).first()
            if m is None:return reply_error('Staff member not found.',404)
            if m.role=='owner':return reply_error('Owner accounts cannot be edited.',403)
            m.role=role;m.permissions=permissions;m.save(update_fields=['role','permissions'])
            return JsonResponse({'success':True,'username':m.user.username,'role':role,'permissions':permissions})
        if data.get('action','create')!='create':return reply_error('Invalid action.',400)
        username=text(data,'username',50)
        password=data.get('password','')
        if not isinstance(password,str) or len(password)<8:return reply_error('Password must have at least 8 characters.',400)
        with transaction.atomic():
            User=get_user_model()
            if User.objects.filter(username=username).exists():return reply_error('Username already exists.',409)
            new_user=User.objects.create_user(username=username,password=password)
            Membership.objects.create(user=new_user,store=member.store,role=role,permissions=permissions)
        return JsonResponse({'success':True,'username':username,'role':role,'permissions':permissions,'created':True})
    except ValueError as e:return reply_error(str(e))
    except ShopError as e:return reply_error(e.message,e.status)

@csrf_exempt
@require_http_methods(['POST'])
def purchase_mobile(request):
    """Native stock purchase through the same operation ledger as the browser."""
    user,_=auth_user(request)
    if not user:return reply_error('Authentication required.',401)
    try:
        data=parse(request)
        if data.get('kind')!='purchase':return reply_error('Expected purchase operation.')
        return JsonResponse(apply_operation(user,data))
    except ValueError as e:return reply_error(str(e))
    except ShopError as e:return reply_error(e.message,e.status)
