import uuid
from django.conf import settings
from django.db import models
from django.db.models import Q
class Store(models.Model):
 name=models.CharField(max_length=100,default='Noriss Beautyquest')
 def __str__(self):return self.name
class Membership(models.Model):
 ROLES=[('owner','Owner'),('cashier','Cashier'),('viewer','Viewer')]
 user=models.OneToOneField(settings.AUTH_USER_MODEL,on_delete=models.CASCADE)
 store=models.ForeignKey(Store,on_delete=models.CASCADE)
 role=models.CharField(max_length=10,choices=ROLES,default='cashier')
 def __str__(self):return f'{self.user} · {self.store} · {self.role}'
class Product(models.Model):
 id=models.UUIDField(primary_key=True,default=uuid.uuid4,editable=False)
 store=models.ForeignKey(Store,on_delete=models.CASCADE)
 name=models.CharField(max_length=100)
 category=models.CharField(max_length=60)
 price=models.PositiveBigIntegerField(help_text='Selling price in kobo (100 kobo = ₦1).')
 reorder=models.PositiveIntegerField(default=5)
 stock=models.PositiveBigIntegerField(default=0,editable=False)
 created=models.DateTimeField(auto_now_add=True)
 class Meta:
  ordering=['name']
  constraints=[models.CheckConstraint(condition=Q(price__gt=0),name='product_positive_price'),models.CheckConstraint(condition=Q(stock__gte=0),name='product_nonnegative_stock')]
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
