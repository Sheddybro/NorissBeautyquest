import uuid
from django.conf import settings
from django.db import models
from django.db.models import Q
class Store(models.Model):
 name=models.CharField(max_length=100,default='Noriss Beautyquest')
 next_receipt=models.PositiveBigIntegerField(default=1)
 def __str__(self):return self.name
class Membership(models.Model):
 ROLES=[('owner','Owner'),('staff','Staff'),('cashier','Cashier (legacy)'),('viewer','Viewer (legacy)')]
 user=models.OneToOneField(settings.AUTH_USER_MODEL,on_delete=models.CASCADE)
 store=models.ForeignKey(Store,on_delete=models.CASCADE)
 role=models.CharField(max_length=10,choices=ROLES,default='cashier')
 permissions=models.JSONField(default=list,blank=True,help_text='Additional staff operation permissions; owner always has full access.')
 def __str__(self):return f'{self.user} · {self.store} · {self.role}'
class Product(models.Model):
 id=models.UUIDField(primary_key=True,default=uuid.uuid4,editable=False)
 store=models.ForeignKey(Store,on_delete=models.CASCADE)
 name=models.CharField(max_length=100)
 category=models.CharField(max_length=60)
 price=models.PositiveBigIntegerField(help_text='Selling price in kobo (100 kobo = ₦1).')
 reorder=models.PositiveIntegerField(default=5)
 stock=models.PositiveBigIntegerField(default=0,editable=False)
 barcode=models.CharField(max_length=80,blank=True)
 photo=models.TextField(blank=True)
 active=models.BooleanField(default=True)
 inventory_cost=models.PositiveBigIntegerField(default=0)
 cost_known=models.BooleanField(default=False)
 version=models.PositiveIntegerField(default=1)
 created=models.DateTimeField(auto_now_add=True)
 class Meta:
  ordering=['name']
  constraints=[models.UniqueConstraint(fields=['store','barcode'],condition=~Q(barcode=''),name='unique_store_barcode'),models.CheckConstraint(condition=Q(price__gt=0),name='product_positive_price'),models.CheckConstraint(condition=Q(stock__gte=0),name='product_nonnegative_stock')]
 def __str__(self):return self.name
class Movement(models.Model):
 id=models.UUIDField(primary_key=True,editable=False)
 store=models.ForeignKey(Store,on_delete=models.CASCADE)
 product=models.ForeignKey(Product,on_delete=models.PROTECT)
 kind=models.CharField(max_length=10,choices=[('sale','Sale'),('purchase','Purchase')])
 quantity=models.PositiveIntegerField()
 unit_amount=models.PositiveBigIntegerField()
 party=models.CharField(max_length=100)
 payment=models.CharField(max_length=12,choices=[('Cash','Cash'),('Transfer','Transfer'),('POS card','POS card')])
 created=models.DateTimeField(help_text='When recorded on the device.')
 receipt=models.ForeignKey('Receipt',null=True,blank=True,on_delete=models.PROTECT,related_name='items')
 product_name=models.CharField(max_length=100,blank=True)
 cost_total=models.PositiveBigIntegerField(default=0)
 cost_known=models.BooleanField(default=False)
 received=models.DateTimeField(auto_now_add=True)
 recorded_by=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.PROTECT)
 class Meta:
  ordering=['-created','-received']
  constraints=[models.CheckConstraint(condition=Q(quantity__gt=0),name='movement_positive_quantity'),models.CheckConstraint(condition=Q(unit_amount__gt=0),name='movement_positive_amount')]
class Operation(models.Model):
 """Immutable idempotency receipt: a lost response cannot duplicate a sale."""
 id=models.UUIDField(primary_key=True,editable=False)
 store=models.ForeignKey(Store,on_delete=models.CASCADE)
 user=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.PROTECT)
 fingerprint=models.CharField(max_length=64)
 created=models.DateTimeField(auto_now_add=True)

class Receipt(models.Model):
 id=models.UUIDField(primary_key=True,editable=False)
 store=models.ForeignKey(Store,on_delete=models.CASCADE)
 number=models.PositiveBigIntegerField()
 party=models.CharField(max_length=100)
 payment=models.CharField(max_length=12)
 created=models.DateTimeField()
 recorded_by=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.PROTECT)
 class Meta:
  ordering=['-created']
  constraints=[models.UniqueConstraint(fields=['store','number'],name='unique_store_receipt_number')]
 @property
 def reference(self):return f'NB-{self.store_id}-{self.number:06d}'
class Batch(models.Model):
 id=models.UUIDField(primary_key=True,default=uuid.uuid4,editable=False)
 product=models.ForeignKey(Product,on_delete=models.PROTECT)
 code=models.CharField(max_length=60)
 expires=models.DateField(null=True,blank=True)
 quantity=models.PositiveIntegerField()
 received=models.DateTimeField(auto_now_add=True)
class Allocation(models.Model):
 movement=models.ForeignKey(Movement,on_delete=models.CASCADE,related_name='allocations')
 batch=models.ForeignKey(Batch,on_delete=models.PROTECT)
 quantity=models.PositiveIntegerField()
 returned=models.PositiveIntegerField(default=0)
class Refund(models.Model):
 id=models.UUIDField(primary_key=True,editable=False)
 movement=models.ForeignKey(Movement,on_delete=models.PROTECT,related_name='refunds')
 quantity=models.PositiveIntegerField()
 amount=models.PositiveBigIntegerField()
 cost_total=models.PositiveBigIntegerField()
 restock=models.BooleanField(default=True)
 reason=models.CharField(max_length=200)
 payment=models.CharField(max_length=12)
 created=models.DateTimeField()
 recorded_by=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.PROTECT)
class Expense(models.Model):
 id=models.UUIDField(primary_key=True,editable=False)
 store=models.ForeignKey(Store,on_delete=models.CASCADE)
 description=models.CharField(max_length=150)
 amount=models.PositiveBigIntegerField()
 payment=models.CharField(max_length=12)
 created=models.DateTimeField()
 recorded_by=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.PROTECT)
class Reconciliation(models.Model):
 id=models.UUIDField(primary_key=True,editable=False)
 store=models.ForeignKey(Store,on_delete=models.CASCADE)
 day=models.DateField()
 opening_cash=models.PositiveBigIntegerField(default=0)
 actual_cash=models.PositiveBigIntegerField()
 actual_transfer=models.PositiveBigIntegerField()
 actual_pos=models.PositiveBigIntegerField()
 expected=models.JSONField()
 note=models.CharField(max_length=200,blank=True)
 recorded_by=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.PROTECT)
 created=models.DateTimeField(auto_now_add=True)
 class Meta:
  constraints=[models.UniqueConstraint(fields=['store','day'],name='unique_day_reconciliation')]
class AuditLog(models.Model):
 store=models.ForeignKey(Store,on_delete=models.CASCADE)
 user=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.PROTECT)
 action=models.CharField(max_length=40)
 reference=models.CharField(max_length=100)
 details=models.JSONField(default=dict)
 created=models.DateTimeField(auto_now_add=True)
class SyncConflict(models.Model):
 id=models.UUIDField(primary_key=True,editable=False)
 store=models.ForeignKey(Store,on_delete=models.CASCADE)
 user=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.PROTECT)
 payload=models.JSONField()
 message=models.CharField(max_length=400)
 resolved=models.BooleanField(default=False)
 updated=models.DateTimeField(auto_now=True)


class Branch(models.Model):
    """Future physical locations; existing Store remains the business boundary."""
    store = models.ForeignKey(Store, on_delete=models.CASCADE, related_name='branches')
    name = models.CharField(max_length=120)
    code = models.SlugField(max_length=32)
    active = models.BooleanField(default=True)
    created = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['store', 'code'], name='unique_branch_code_per_store')]
        ordering = ['name']

    def __str__(self):
        return f'{self.store.name} / {self.name}'


class PaymentAttempt(models.Model):
    """Provider-neutral payment record; never stores card credentials."""
    STATUSES = [('pending', 'Pending'), ('verified', 'Verified'), ('failed', 'Failed'),
                ('cancelled', 'Cancelled'), ('refunded', 'Refunded')]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    store = models.ForeignKey(Store, on_delete=models.PROTECT, related_name='payment_attempts')
    receipt = models.ForeignKey(Receipt, null=True, blank=True, on_delete=models.PROTECT, related_name='payment_attempts')
    provider = models.CharField(max_length=32, default='manual')
    reference = models.CharField(max_length=120)
    amount = models.PositiveBigIntegerField(help_text='Amount in kobo')
    currency = models.CharField(max_length=3, default='NGN')
    status = models.CharField(max_length=12, choices=STATUSES, default='pending')
    provider_metadata = models.JSONField(default=dict, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    verified_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['provider', 'reference'], name='unique_provider_payment_reference'),
                       models.CheckConstraint(condition=Q(amount__gt=0), name='payment_attempt_positive_amount')]
        indexes = [models.Index(fields=['store', 'status'], name='payment_store_status_idx')]

    def __str__(self):
        return f'{self.provider}:{self.reference} ({self.status})'
