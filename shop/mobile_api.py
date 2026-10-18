"""Versioned native-client API; no changes to legacy browser endpoints."""
import json
import secrets
import hashlib
from datetime import date, timedelta
from django.contrib.auth import authenticate
from django.core.cache import cache
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db.models import BigIntegerField, ExpressionWrapper, F, Sum
from django.db.models.functions import TruncDate
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from .models import Expense, MobileToken, Movement, Receipt, Refund
from .services import snapshot, member_for, ShopError, apply_operation
from .permissions import can_operate

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

@csrf_exempt
@require_http_methods(['GET', 'POST'])
def products(request):
    user,_=auth_user(request)
    if not user:return reply_error('Authentication required.',401)
    try:
        if request.method == 'POST':
            data=parse(request)
            if data.get('kind') not in {'product', 'product_update'}:
                return reply_error('Expected product operation.')
            return JsonResponse(apply_operation(user, data))
        data=snapshot(user)
        return JsonResponse({'products':data['products'],'updated':data['updated']})
    except ValueError as e:return reply_error(str(e))
    except ShopError as e:return reply_error(e.message,e.status)

@require_http_methods(['GET'])
def dashboard(request):
    user,_=auth_user(request)
    if not user:return reply_error('Authentication required.',401)
    try:
        data=snapshot(user)
        store_id=data['account']['store_id']
        today=timezone.localdate()
        first_day=today-timedelta(days=6)
        line_amount=ExpressionWrapper(F('quantity')*F('unit_amount'),output_field=BigIntegerField())
        sales=Movement.objects.filter(store_id=store_id,kind='sale')
        purchases=Movement.objects.filter(store_id=store_id,kind='purchase')
        sales_today=sales.filter(created__date=today).aggregate(total=Sum(line_amount))['total'] or 0
        purchases_today=purchases.filter(created__date=today).aggregate(total=Sum(line_amount))['total'] or 0
        refunds_today=Refund.objects.filter(movement__store_id=store_id,created__date=today).aggregate(total=Sum('amount'))['total'] or 0
        trend_rows=(sales.filter(created__date__gte=first_day,created__date__lte=today)
            .annotate(day=TruncDate('created',tzinfo=timezone.get_current_timezone()))
            .values('day').annotate(total=Sum(line_amount)).order_by('day'))
        trend_totals={row['day'].isoformat():row['total'] or 0 for row in trend_rows}
        sales_trend=[{'day':(first_day+timedelta(days=index)).isoformat(),'amount':trend_totals.get((first_day+timedelta(days=index)).isoformat(),0)} for index in range(7)]
        metrics={
            'sales_today':sales_today,
            'purchases_today':purchases_today,
            'refunds_today':refunds_today,
            'net_sales_today':sales_today-refunds_today,
            'transactions_today':Receipt.objects.filter(store_id=store_id,created__date=today).count(),
            'sales_trend':sales_trend,
        }
        return JsonResponse({'account':data['account'],'products':data['products'],'receipts':data['receipts'][-10:],'metrics':metrics,'updated':data['updated']})
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

@csrf_exempt
@require_http_methods(['GET', 'POST'])
def expenses_mobile(request):
    """Bearer-token expense workflow using the shared permission-checked ledger."""
    user,_=auth_user(request)
    if not user:return reply_error('Authentication required.',401)
    try:
        member=member_for(user)
        if not can_operate(member,'expense'):return reply_error('Expense access required.',403)
        if request.method=='POST':
            data=parse(request)
            if data.get('kind')!='expense':return reply_error('Expected expense operation.')
            return JsonResponse(apply_operation(user,data))
        expenses=[{
            'id':str(row.id),
            'description':row.description,
            'amount':row.amount,
            'payment':row.payment,
            'created':row.created.isoformat(),
        } for row in Expense.objects.filter(store=member.store).order_by('-created')[:100]]
        return JsonResponse({'expenses':expenses})
    except ValueError as e:return reply_error(str(e))
    except ShopError as e:return reply_error(e.message,e.status)

@require_http_methods(['GET'])
def reports_mobile(request):
    """Owner-only confirmed profit summary, calculated from the authoritative ledger."""
    user,_=auth_user(request)
    if not user:return reply_error('Authentication required.',401)
    try:
        member=member_for(user)
        if member.role!='owner':return reply_error('Profit reports are restricted to the owner.',403)
        start_raw=request.GET.get('from','').strip()
        end_raw=request.GET.get('to','').strip()
        try:
            start=date.fromisoformat(start_raw) if start_raw else None
            end=date.fromisoformat(end_raw) if end_raw else None
        except ValueError:return reply_error('Report dates must use YYYY-MM-DD.',400)
        if start and end and start>end:return reply_error('The report start date must not follow its end date.',400)

        def in_range(queryset, field):
            if start:queryset=queryset.filter(**{field+'__date__gte':start})
            if end:queryset=queryset.filter(**{field+'__date__lte':end})
            return queryset

        sales=in_range(Movement.objects.filter(store=member.store,kind='sale'),'created')
        refunds=in_range(Refund.objects.filter(movement__store=member.store),'created')
        expenses=in_range(Expense.objects.filter(store=member.store),'created')
        sales_amount=ExpressionWrapper(F('quantity')*F('unit_amount'),output_field=BigIntegerField())
        gross_sales=sales.aggregate(total=Sum(sales_amount))['total'] or 0
        known_sales=sales.filter(cost_known=True)
        known_sales_amount=ExpressionWrapper(F('quantity')*F('unit_amount'),output_field=BigIntegerField())
        known_revenue=known_sales.aggregate(total=Sum(known_sales_amount))['total'] or 0
        known_count=sales.filter(cost_known=False).count()
        refunds_total=refunds.aggregate(total=Sum('amount'))['total'] or 0
        known_refunds=refunds.filter(movement__cost_known=True)
        known_refund_amount=known_refunds.aggregate(total=Sum('amount'))['total'] or 0
        restocked_known_cost=known_refunds.filter(restock=True).aggregate(total=Sum('cost_total'))['total'] or 0
        cost_of_goods_sold=(known_sales.aggregate(total=Sum('cost_total'))['total'] or 0)-restocked_known_cost
        expense_total=expenses.aggregate(total=Sum('amount'))['total'] or 0
        net_sales=gross_sales-refunds_total
        known_net=known_revenue-known_refund_amount
        rows=[{
            'id':str(row.id),
            'description':row.description,
            'amount':row.amount,
            'payment':row.payment,
            'created':row.created.isoformat(),
        } for row in expenses.order_by('-created')[:200]]
        return JsonResponse({'from':start.isoformat() if start else '', 'to':end.isoformat() if end else '', 'metrics':{
            'gross_sales':gross_sales,
            'refunds':refunds_total,
            'net_sales':net_sales,
            'cost_of_goods_sold':cost_of_goods_sold,
            'known_cost_gross_profit':known_net-cost_of_goods_sold,
            'expenses':expense_total,
            'estimated_operating_profit':known_net-cost_of_goods_sold-expense_total,
            'unknown_cost_sales':known_count,
        },'expenses_list':rows})
    except ShopError as e:return reply_error(e.message,e.status)
