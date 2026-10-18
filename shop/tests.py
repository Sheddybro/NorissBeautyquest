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
  app=self.client.get('/');self.assertContains(app,'Sync centre');self.assertContains(app,'entry-dialog');self.assertContains(app,'class="page-hero"');self.assertContains(app,'id="page-eyebrow"');self.assertContains(app,'aria-labelledby="page-title"');self.assertContains(app,'class="logout-label">Sign out</span>');self.assertContains(self.client.get('/accounts/login/'),'Good to see you again.');offline=self.client.get('/offline-shell/');self.assertNotIn('csrfmiddlewaretoken',offline.content.decode());self.assertContains(offline,'app.js');self.assertContains(offline,'class="page-hero"')
 def test_pwa_endpoints(self):
  manifest=self.client.get('/manifest.webmanifest');self.assertEqual(manifest.status_code,200);self.assertEqual(manifest.json()['display'],'standalone');self.assertEqual(len(manifest.json()['icons']),3)
  response=self.client.get('/sw.js');self.assertContains(response,'noriss-shell-v10');self.assertEqual(response['Service-Worker-Allowed'],'/');self.assertIn('no-cache',response['Cache-Control'])
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

from .models import Receipt,Batch,Allocation,Refund,Expense,Reconciliation,AuditLog,SyncConflict
class AdvancedRetailTests(RetailTests):
 def checkout(self,lines=None,**extra):
  payload={'request_id':str(uuid.uuid4()),'kind':'checkout','lines':lines or [{'product_id':self.product['request_id'],'quantity':2,'unit_amount':850000}],'party':'Customer','payment':'Cash','created':timezone.now().isoformat()};payload.update(extra);return payload
 def stocked(self,quantity=10,**extra):
  self.create_product();self.assertEqual(self.post(self.move(quantity=quantity,**extra)).status_code,200)
 def refund_payload(self,m,quantity=1,**extra):
  payload={'request_id':str(uuid.uuid4()),'kind':'refund','movement_id':str(m.id),'quantity':quantity,'restock':True,'reason':'Customer return','payment':'Cash','created':timezone.now().isoformat()};payload.update(extra);return payload
 def test_multi_product_checkout(self):
  self.stocked();second={**self.product,'request_id':str(uuid.uuid4()),'name':'Lotion'};self.post(second);self.post(self.move(product_id=second['request_id'],quantity=5));payload=self.checkout([{'product_id':self.product['request_id'],'quantity':2,'unit_amount':850000},{'product_id':second['request_id'],'quantity':3,'unit_amount':500000}]);response=self.post(payload);self.assertEqual(response.status_code,200);self.assertEqual(Receipt.objects.count(),1);self.assertEqual(Movement.objects.filter(kind='sale').count(),2);self.assertEqual(Product.objects.get(pk=self.product['request_id']).stock,8);self.assertEqual(Product.objects.get(pk=second['request_id']).stock,2);self.assertEqual(self.post(payload).status_code,200);self.assertEqual(Receipt.objects.count(),1)
 def test_checkout_all_or_nothing(self):
  self.stocked();second={**self.product,'request_id':str(uuid.uuid4()),'name':'No stock'};self.post(second);payload=self.checkout([{'product_id':self.product['request_id'],'quantity':2,'unit_amount':850000},{'product_id':second['request_id'],'quantity':1,'unit_amount':500000}]);self.assertEqual(self.post(payload).status_code,409);self.assertEqual(Product.objects.get(pk=self.product['request_id']).stock,10);self.assertEqual(Receipt.objects.count(),0);self.assertEqual(Movement.objects.filter(kind='sale').count(),0);self.assertFalse(Operation.objects.filter(pk=payload['request_id']).exists());self.assertEqual(SyncConflict.objects.count(),1)
 def test_cart_duplicate_product_rejected(self):
  self.stocked();line={'product_id':self.product['request_id'],'quantity':1,'unit_amount':850000};self.assertEqual(self.post(self.checkout([line,line])).status_code,400)
 def test_receipt_sequence_rollback(self):
  self.stocked(quantity=2);self.assertEqual(self.post(self.checkout(quantity=3,lines=[{'product_id':self.product['request_id'],'quantity':3,'unit_amount':850000}])).status_code,409);r=self.post(self.checkout());self.assertEqual(r.status_code,200);self.assertEqual(Receipt.objects.get().number,1)
 def test_weighted_cost_capture(self):
  self.stocked(quantity=10,unit_amount=400000);self.post(self.move(quantity=10,unit_amount=600000));self.post(self.checkout());m=Movement.objects.get(kind='sale');self.assertEqual(m.cost_total,1000000);self.assertTrue(m.cost_known);self.assertEqual(Product.objects.get().inventory_cost,9000000)
 def test_legacy_unknown_cost(self):
  p=self.create_product();p.stock=4;p.cost_known=False;p.save();self.post(self.checkout());self.assertFalse(Movement.objects.get(kind='sale').cost_known)
 def test_refund_and_retry(self):
  self.stocked();self.post(self.checkout());m=Movement.objects.get(kind='sale');refund=self.refund_payload(m);self.assertEqual(self.post(refund).status_code,200);self.assertEqual(self.post(refund).status_code,200);self.assertEqual(Product.objects.get().stock,9);self.assertEqual(Refund.objects.count(),1);self.assertEqual(Refund.objects.get().amount,850000);self.assertEqual(Refund.objects.get().cost_total,400000)
 def test_over_refund_rejected(self):
  self.stocked();self.post(self.checkout());m=Movement.objects.get(kind='sale');self.post(self.refund_payload(m,2));self.assertEqual(self.post(self.refund_payload(m,1)).status_code,409);self.assertEqual(Product.objects.get().stock,10)
 def test_damaged_refund_no_stock_increase(self):
  self.stocked();self.post(self.checkout());m=Movement.objects.get(kind='sale');self.assertEqual(self.post(self.refund_payload(m,restock=False)).status_code,200);self.assertEqual(Product.objects.get().stock,8);self.assertEqual(Allocation.objects.get().returned,1)
 def test_fefo_and_expired_batches(self):
  self.stocked(quantity=3,expires=(timezone.localdate()-timedelta(days=1)).isoformat(),batch_code='expired');self.post(self.move(quantity=2,expires=(timezone.localdate()+timedelta(days=10)).isoformat(),batch_code='later'));self.post(self.move(quantity=2,expires=(timezone.localdate()+timedelta(days=2)).isoformat(),batch_code='sooner'));self.assertEqual(self.post(self.checkout(lines=[{'product_id':self.product['request_id'],'quantity':2,'unit_amount':850000}])).status_code,200);self.assertEqual(Batch.objects.get(code='sooner').quantity,0);self.assertEqual(Batch.objects.get(code='later').quantity,2);self.assertEqual(self.post(self.checkout(lines=[{'product_id':self.product['request_id'],'quantity':3,'unit_amount':850000}])).status_code,409)
 def test_expiry_day_valid(self):
  self.stocked(quantity=2,expires=timezone.localdate().isoformat());self.assertEqual(self.post(self.checkout()).status_code,200)
 def test_refund_restores_original_batch(self):
  self.stocked(quantity=2,batch_code='original');self.post(self.checkout());m=Movement.objects.get(kind='sale');self.post(self.refund_payload(m));self.assertEqual(Batch.objects.get().quantity,1)
 def test_product_edit_version_and_archive(self):
  self.stocked();p=Product.objects.get();edit={**self.product,'request_id':str(uuid.uuid4()),'kind':'product_update','product_id':str(p.id),'version':1,'active':True,'price':999000,'barcode':'SKU-123'};self.assertEqual(self.post(edit).status_code,200);p.refresh_from_db();self.assertEqual(p.version,2);self.assertEqual(p.price,999000);self.assertEqual(self.post({**edit,'request_id':str(uuid.uuid4())}).status_code,409);self.assertEqual(self.post({**edit,'request_id':str(uuid.uuid4()),'version':2,'active':False}).status_code,200);self.assertEqual(self.post(self.checkout()).status_code,409)
 def test_barcode_uniqueness(self):
  self.post({**self.product,'barcode':'same'});self.assertEqual(self.post({**self.product,'request_id':str(uuid.uuid4()),'barcode':'same'}).status_code,409)
 def test_photo_validation(self):
  self.assertEqual(self.post({**self.product,'photo':'data:image/svg+xml;base64,PHN2Zz4='}).status_code,400)
  self.assertEqual(self.post({**self.product,'photo':'data:image/png;base64,bm90YW5pbWFnZQ=='}).status_code,400)
 def test_valid_photo(self):
  import io,base64
  from PIL import Image
  b=io.BytesIO();Image.new('RGB',(8,8),'blue').save(b,format='PNG');raw='data:image/png;base64,'+base64.b64encode(b.getvalue()).decode();self.assertEqual(self.post({**self.product,'photo':raw}).status_code,200);self.assertEqual(Product.objects.get().photo,raw)
 def test_expense_and_reconciliation(self):
  self.stocked(quantity=1,unit_amount=400000,payment='Transfer');self.post(self.checkout(lines=[{'product_id':self.product['request_id'],'quantity':1,'unit_amount':850000}]));self.post({'request_id':str(uuid.uuid4()),'kind':'expense','description':'Transport','amount':50000,'payment':'Cash','created':timezone.now().isoformat()});p={'request_id':str(uuid.uuid4()),'kind':'reconcile','day':timezone.localdate().isoformat(),'opening_cash':100000,'actual_cash':900000,'actual_transfer':0,'actual_pos':0,'note':'Closing'};self.assertEqual(self.post(p).status_code,200);r=Reconciliation.objects.get();self.assertEqual(r.expected['Cash'],900000);self.assertEqual(r.expected['Transfer'],-400000);self.assertEqual(self.post({**p,'request_id':str(uuid.uuid4())}).status_code,409)
 def test_audit_and_acknowledgement(self):
  self.stocked();self.post(self.checkout());data=self.client.get('/api/bootstrap/').json();self.assertEqual(len(data['audits']),3);self.assertEqual(len(data['acknowledged_ids']),3);self.assertTrue(data['receipts'][0]['reference'].startswith('NB-'));self.assertEqual(data['products'][0]['sellable'],8)
 def test_cashier_cannot_refund(self):
  self.stocked();self.post(self.checkout());m=Movement.objects.get(kind='sale');u=get_user_model().objects.create_user('advancedcashier');Membership.objects.create(user=u,store=self.store,role='cashier');self.client.force_login(u);self.assertEqual(self.post(self.refund_payload(m)).status_code,403);self.assertEqual(self.post(self.checkout()).status_code,200);self.assertEqual(self.client.get('/api/bootstrap/').json()['audits'],[])
 def test_invalid_refund_boolean(self):
  self.stocked();self.post(self.checkout());self.assertEqual(self.post(self.refund_payload(Movement.objects.get(kind='sale'),restock='false')).status_code,400)
 def test_snapshot_history_name_immutable(self):
  self.stocked();self.post(self.checkout());p=Product.objects.get();p.name='New name';p.save();data=self.client.get('/api/bootstrap/').json();self.assertEqual([m['name'] for m in data['movements'] if m['kind']=='sale'],['Glow serum'])
 def test_refund_cross_store_forbidden(self):
  self.stocked();self.post(self.checkout());m=Movement.objects.get(kind='sale');u=get_user_model().objects.create_user('otheradv');Membership.objects.create(user=u,store=Store.objects.create(),role='owner');self.client.force_login(u);self.assertEqual(self.post(self.refund_payload(m)).status_code,409)

class BackupTests(TestCase):
 def test_backup_verify_and_restore(self):
  import sqlite3,tempfile,io
  from pathlib import Path
  from django.test import override_settings
  from django.core.management import call_command
  from django.core.management.base import CommandError
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory);source=root/'source.sqlite3';c=sqlite3.connect(source);c.execute('CREATE TABLE shop_operation (id TEXT)');c.execute("INSERT INTO shop_operation VALUES ('test-record')");c.commit();c.close()
   with override_settings(DATABASES={'default':{'ENGINE':'django.db.backends.sqlite3','NAME':source}}):
    out=root/'copy.backup';log=io.StringIO();call_command('backup_shop',output=str(out),stdout=log);call_command('verify_backup',str(out),stdout=log);restored=root/'restored.sqlite3';call_command('restore_sqlite',str(out),output=str(restored),stdout=log);conn=sqlite3.connect(restored);self.assertEqual(conn.execute('SELECT id FROM shop_operation').fetchone()[0],'test-record');conn.close()
    with self.assertRaises(CommandError):call_command('restore_sqlite',str(out),output=str(restored),stdout=log)
    call_command('backup_watch',directory=str(root/'scheduled'),once=True,keep=1,interval=60,stdout=log);self.assertEqual(len(list((root/'scheduled').glob('*.backup'))),1)
    out.write_bytes(b'corrupted')
    with self.assertRaises(CommandError):call_command('verify_backup',str(out),stdout=log)

class ReceiptViewTests(RetailTests):
 def test_server_receipt_download_and_isolation(self):
  self.create_product();self.post(self.move(quantity=5));sale=self.move('sale',2);self.post(sale);url=f'/receipts/{sale["request_id"]}/';self.assertContains(self.client.get(url),'Sales receipt');self.assertContains(self.client.get(url),'Glow serum');self.assertIn('attachment',self.client.get(url+'?download=1')['Content-Disposition'])
  other=get_user_model().objects.create_user('receiptother');Membership.objects.create(user=other,store=Store.objects.create(),role='viewer');self.client.force_login(other);self.assertEqual(self.client.get(url).status_code,404)

class DemoSeedTests(TestCase):
 def test_seed_demo_populates_full_dataset_idempotently(self):
  import io
  from django.core.management import call_command
  from .models import Branch,Expense,Operation,PaymentAttempt,Reconciliation,Refund
  store=Store.objects.create();owner=get_user_model().objects.create_user('demoowner');Membership.objects.create(user=owner,store=store,role='owner')
  call_command('seed_demo',owner='demoowner',scale=1,stdout=io.StringIO())
  counts=(Product.objects.count(),Movement.objects.count(),Operation.objects.count(),Receipt.objects.count(),Batch.objects.count(),Refund.objects.count(),Expense.objects.count(),Reconciliation.objects.count())
  self.assertEqual(counts[0],9);self.assertGreater(counts[1],20);self.assertGreaterEqual(counts[2],40);self.assertEqual(counts[3],14);self.assertGreaterEqual(counts[4],9);self.assertEqual(counts[5],2);self.assertEqual(counts[6],5);self.assertGreater(counts[7],1)
  self.assertTrue(all(p.name.startswith('Demo ·') for p in Product.objects.all()))
  self.assertTrue(all(m.party.startswith('Demo ') for m in Movement.objects.filter(kind='sale')))
  today_purchases=Movement.objects.filter(store=store,kind='purchase',created__date=timezone.localdate())
  self.assertEqual(today_purchases.count(),3)
  self.assertTrue(Product.objects.get(name='Demo · Glow serum').photo.startswith('data:image/png;base64,'))
  self.assertTrue(Product.objects.get(name='Demo · Glow serum').barcode.startswith(f'DEMO{store.id}-'))
  self.assertTrue(Product.objects.filter(active=False).exists())
  self.assertTrue(Batch.objects.filter(expires__lt=timezone.localdate()).exists())
  self.assertTrue(Refund.objects.filter(restock=False).exists())
  self.assertEqual(Membership.objects.filter(store=store).count(),4)
  self.assertEqual(Branch.objects.filter(store=store).count(),3)
  self.assertEqual(set(PaymentAttempt.objects.filter(store=store).values_list('status',flat=True)),{'pending','verified','failed','cancelled','refunded'})
  self.assertGreater(AuditLog.objects.filter(store=store).count(),0)
  call_command('seed_demo',owner='demoowner',scale=1,stdout=io.StringIO())
  self.assertEqual((Product.objects.count(),Movement.objects.count(),Operation.objects.count(),Receipt.objects.count(),Batch.objects.count(),Refund.objects.count(),Expense.objects.count(),Reconciliation.objects.count()),counts)
  self.assertEqual(today_purchases.count(),3)
  Product.objects.create(store=store,name='Keep this product',category='Other',price=1000)
  call_command('clear_demo',owner='demoowner',yes=True,stdout=io.StringIO())
  self.assertEqual(list(Product.objects.values_list('name',flat=True)),['Keep this product'])
  self.assertEqual((Movement.objects.count(),Operation.objects.count(),Receipt.objects.count(),Batch.objects.count(),Refund.objects.count(),Expense.objects.count(),Reconciliation.objects.count()),(0,0,0,0,0,0,0))
  self.assertEqual(list(Branch.objects.filter(store=store).values_list('code',flat=True)),['main'])
  self.assertEqual(Membership.objects.filter(store=store).count(),1)

class StaffPermissionTests(RetailTests):
 def test_staff_defaults_and_owner_access(self):
  from .permissions import can_operate
  owner=Membership.objects.get(user=self.owner)
  self.assertTrue(can_operate(owner,'refund'))
  user=get_user_model().objects.create_user('staff-default')
  member=Membership.objects.create(user=user,store=self.store,role='staff')
  self.assertTrue(can_operate(member,'sale'))
  self.assertFalse(can_operate(member,'refund'))
  self.client.force_login(user)
  account=self.client.get('/api/bootstrap/').json()['account']
  self.assertEqual(account['allowed_operations'],['checkout','sale'])
  self.assertEqual(self.post(self.product).status_code,403)
 def test_owner_staff_management_api_and_metadata(self):
  user=get_user_model().objects.create_user('existing-staff',password='StrongPass!2026')
  Membership.objects.create(user=user,store=self.store,role='staff',permissions=['sale'])
  self.client.force_login(self.owner)
  boot=self.client.get('/api/bootstrap/').json()['account']
  self.assertEqual(boot['store'],self.store.name)
  self.assertTrue(any(member['username']=='existing-staff' for member in boot['staff_members']))
  response=self.client.post('/api/owner/staff/',json.dumps({'username':'newcashier','password':'StrongPass!2026','role':'staff','permissions':['sale','checkout']}),content_type='application/json')
  self.assertEqual(response.status_code,200)
  new_user=get_user_model().objects.get(username='newcashier')
  self.assertTrue(Membership.objects.filter(user=new_user,store=self.store,role='staff').exists())
  self.assertIn('checkout',Membership.objects.get(user=new_user,store=self.store).permissions)
 def test_staff_extra_permission_is_enforced_server_side(self):
  user=get_user_model().objects.create_user('staff-inventory')
  member=Membership.objects.create(user=user,store=self.store,role='staff',permissions=['product','purchase'])
  self.client.force_login(user)
  self.assertEqual(self.post(self.product).status_code,200)
  self.assertEqual(self.post(self.move()).status_code,200)
  self.assertEqual(self.post(self.move('sale',1)).status_code,200)
  self.assertNotIn('refund',self.client.get('/api/bootstrap/').json()['account']['allowed_operations'])
 def test_legacy_cashier_cannot_gain_extra_permissions(self):
  from .permissions import can_operate
  user=get_user_model().objects.create_user('legacy-limited')
  member=Membership.objects.create(user=user,store=self.store,role='cashier',permissions=['product'])
  self.assertFalse(can_operate(member,'product'))
