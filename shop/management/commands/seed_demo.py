"""Opt-in demo products. Never run automatically against a real shop."""
import uuid
from django.core.management.base import BaseCommand,CommandError
from django.contrib.auth import get_user_model
from django.utils import timezone
from shop.models import Membership
from shop.services import apply_operation
class Command(BaseCommand):
 help='Add clearly labelled demo inventory to an existing owner account.'
 def add_arguments(self,p):p.add_argument('--owner',required=True)
 def handle(self,*a,**o):
  try:user=get_user_model().objects.get(username=o['owner']);member=Membership.objects.get(user=user,role='owner')
  except (get_user_model().DoesNotExist,Membership.DoesNotExist):raise CommandError('Create the owner with setup_shop first.')
  for name,category,price,quantity in [('Demo · Glow serum','Skincare',850000,24),('Demo · Shea body lotion','Skincare',450000,18),('Demo · Velvet lipstick','Makeup',350000,32),('Demo · Signature fragrance','Fragrance',1200000,12),('Demo · Curl defining cream','Haircare',550000,4)]:
   if member.store.product_set.filter(name=name).exists():continue
   product_id=str(uuid.uuid4());apply_operation(user,{'request_id':product_id,'kind':'product','name':name,'category':category,'price':price,'reorder':5})
   apply_operation(user,{'request_id':str(uuid.uuid4()),'kind':'purchase','product_id':product_id,'quantity':quantity,'unit_amount':price//2,'party':'Demo supplier','payment':'Transfer','created':timezone.now().isoformat()})
  self.stdout.write(self.style.SUCCESS('Demo stock added. No fictitious sales were created.'))
