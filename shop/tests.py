import json,uuid
from datetime import timedelta
from django.contrib.auth import get_user_model
from django.test import TestCase,Client
from django.urls import reverse
from django.utils import timezone
from .models import Store,Membership,Product,Movement,Operation
from .services import apply_operation,ShopError
class RetailTests(TestCase):
 def setUp(self):
  self.store=Store.objects.create();self.owner=get_user_model().objects.create_user('owner',password='Testing-only-strong-pass!')
  Membership.objects.create(user=self.owner,store=self.store,role='owner');self.client.force_login(self.owner)
  self.product={'request_id':str(uuid.uuid4()),'kind':'product','name':'Glow serum','category':'Skincare','price':850000,'reorder':5}
 def post(self,payload):return self.client.post('/api/operations/',json.dumps(payload),content_type='application/json')
 def create_product(self):self.assertEqual(self.post(self.product).status_code,200);return Product.objects.get(pk=self.product['request_id'])
 def move(self,kind='purchase',quantity=10,**extra):
  data={'request_id':str(uuid.uuid4()),'kind':kind,'product_id':self.product['request_id'],'quantity':quantity,'unit_amount':400000,'party':'Supplier' if kind=='purchase' else '', 'payment':'Transfer','created':timezone.now().isoformat()};data.update(extra);return data
 def test_login_required(self):
  self.client.logout();self.assertEqual(self.client.get('/').status_code,302);self.assertEqual(self.client.get('/api/bootstrap/').status_code,401);self.assertEqual(self.post(self.product).status_code,401)
 def test_missing_membership(self):
  user=get_user_model().objects.create_user('unassigned');self.client.force_login(user);self.assertEqual(self.client.get('/api/bootstrap/').status_code,403)
 def test_templates(self):
  self.assertContains(self.client.get('/'),'Sync centre');self.assertContains(self.client.get('/'),'entry-dialog');self.assertContains(self.client.get('/accounts/login/'),'Good to see you again.');self.assertNotIn('csrfmiddlewaretoken',self.client.get('/offline-shell/').content.decode());self.assertContains(self.client.get('/offline-shell/'),'app.js')
 def test_pwa_endpoints(self):
  manifest=self.client.get('/manifest.webmanifest');self.assertEqual(manifest.status_code,200);self.assertEqual(manifest.json()['display'],'standalone');self.assertEqual(len(manifest.json()['icons']),3)
  response=self.client.get('/sw.js');self.assertContains(response,'noriss-shell-v1');self.assertEqual(response['Service-Worker-Allowed'],'/');self.assertIn('no-cache',response['Cache-Control'])
 def test_health(self):self.assertEqual(self.client.get('/health/').json(),{'status':'ok'})
 def test_product_validation(self):
  for fields in [{'name':' '},{'name':'x'*101},{'price':0},{'price':True},{'price':1.5},{'reorder':-1},{'category':''},{'request_id':'not-uuid'}]:
   with self.subTest(fields=fields):self.assertEqual(self.post({**self.product,**fields}).status_code,400)
  self.assertEqual(Product.objects.count(),0)
 def test_product_retry_is_idempotent(self):
  self.create_product();self.assertEqual(self.post(self.product).status_code,200);self.assertTrue(self.post(self.product).json()['duplicate']);self.assertEqual(Product.objects.count(),1);self.assertEqual(Operation.objects.count(),1)
 def test_idempotency_payload_conflict(self):
  self.create_product();self.assertEqual(self.post({**self.product,'price':100}).status_code,409);self.assertEqual(Product.objects.get().price,850000)
 def test_purchase_and_sale(self):
  p=self.create_product();self.assertEqual(self.post(self.move()).status_code,200);p.refresh_from_db();self.assertEqual(p.stock,10)
  sale=self.move('sale',3);self.assertEqual(self.post(sale).status_code,200);p.refresh_from_db();self.assertEqual(p.stock,7)
  self.assertEqual(self.post(sale).status_code,200);p.refresh_from_db();self.assertEqual(p.stock,7);self.assertEqual(Movement.objects.count(),2);self.assertEqual(Movement.objects.get(kind='sale').party,'Walk-in customer')
 def test_oversell_rolls_back_everything(self):
  p=self.create_product();payload=self.move('sale',1);self.assertEqual(self.post(payload).status_code,409);p.refresh_from_db();self.assertEqual(p.stock,0);self.assertEqual(Movement.objects.count(),0);self.assertFalse(Operation.objects.filter(id=payload['request_id']).exists())
 def test_conflict_can_retry_after_restock(self):
  self.create_product();sale=self.move('sale',3);self.assertEqual(self.post(sale).status_code,409);self.post(self.move(quantity=5));self.assertEqual(self.post(sale).status_code,200);self.assertEqual(Product.objects.get().stock,2)
 def test_deplete_stock(self):
  self.create_product();self.post(self.move(quantity=5));self.assertEqual(self.post(self.move('sale',5)).status_code,200);self.assertEqual(self.post(self.move('sale',1)).status_code,409)
 def test_movement_validation(self):
  self.create_product()
  for fields in [{'quantity':0},{'quantity':1.5},{'quantity':True},{'unit_amount':0},{'unit_amount':-1},{'payment':'Unknown'},{'created':'yesterday'},{'created':'2026-01-01T10:00:00'},{'created':(timezone.now()+timedelta(days=1)).isoformat()},{'party':''},{'product_id':'bad'},{'kind':'refund'}]:
   with self.subTest(fields=fields):self.assertEqual(self.post(self.move(**fields)).status_code,400)
  self.assertEqual(Movement.objects.count(),0)
 def test_unknown_product(self):self.assertEqual(self.post(self.move(product_id=str(uuid.uuid4()))).status_code,409)
 def test_snapshot(self):
  self.create_product();self.post(self.move(quantity=4));data=self.client.get('/api/bootstrap/').json();self.assertEqual(data['products'][0]['stock'],4);self.assertEqual(data['account']['role'],'owner');self.assertEqual(data['movements'][0]['name'],'Glow serum');self.assertIn('csrf_token',data);self.assertIn('no-store',self.client.get('/api/bootstrap/')['Cache-Control'])
 def test_cashier_permissions(self):
  self.create_product();self.post(self.move(quantity=10));u=get_user_model().objects.create_user('cashier');Membership.objects.create(user=u,store=self.store,role='cashier');self.client.force_login(u)
  self.assertEqual(self.post({**self.product,'request_id':str(uuid.uuid4())}).status_code,403);self.assertEqual(self.post(self.move()).status_code,403);self.assertEqual(self.post(self.move('sale',2)).status_code,200)
 def test_viewer_permissions(self):
  u=get_user_model().objects.create_user('viewer');Membership.objects.create(user=u,store=self.store,role='viewer');self.client.force_login(u);self.assertEqual(self.client.get('/api/bootstrap/').status_code,200);self.assertEqual(self.post(self.product).status_code,403)
 def test_other_shop_isolation(self):
  p=self.create_product();s=Store.objects.create(name='Other shop');u=get_user_model().objects.create_user('otherowner');Membership.objects.create(user=u,store=s,role='owner');self.client.force_login(u);self.assertEqual(self.client.get('/api/bootstrap/').json()['products'],[]);self.assertEqual(self.post(self.move()).status_code,409);self.assertEqual(self.post(self.product).status_code,409)
 def test_csrf_enforced(self):
  c=Client(enforce_csrf_checks=True);c.force_login(self.owner);self.assertEqual(c.post('/api/operations/',json.dumps(self.product),content_type='application/json').status_code,403);token=c.get('/api/bootstrap/').json()['csrf_token'];self.assertEqual(c.post('/api/operations/',json.dumps(self.product),content_type='application/json',HTTP_X_CSRFTOKEN=token).status_code,200)
 def test_wrong_http_methods(self):self.assertEqual(self.client.get('/api/operations/').status_code,405);self.assertEqual(self.client.post('/api/bootstrap/').status_code,405)
 def test_bad_json(self):self.assertEqual(self.client.post('/api/operations/','{',content_type='application/json').status_code,400);self.assertEqual(self.post([]).status_code,400)
 def test_old_offline_time_preserved(self):
  self.create_product();old=(timezone.now()-timedelta(days=4)).isoformat();self.post(self.move(created=old));self.assertEqual(Movement.objects.get().created.isoformat(),old)
