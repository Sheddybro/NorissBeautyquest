"""Native API regression tests. Run: python manage.py test shop.test_mobile_api"""
import json
import uuid
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from .models import Expense, Membership, MobileToken, Movement, Product, Receipt, Refund, Store
from .services import apply_operation


class MobileApiTests(TestCase):
    def setUp(self):
        self.store = Store.objects.create(name='Native Test Store')
        User = get_user_model()
        self.owner = User.objects.create_user('native_owner', password='Secure-test-password-2026!')
        self.cashier = User.objects.create_user('native_cashier', password='Secure-test-password-2026!')
        self.viewer = User.objects.create_user('native_viewer', password='Secure-test-password-2026!')
        Membership.objects.create(user=self.owner, store=self.store, role='owner')
        Membership.objects.create(user=self.cashier, store=self.store, role='cashier')
        Membership.objects.create(user=self.viewer, store=self.store, role='viewer')

    def post(self, url, payload, token=None):
        headers = {'HTTP_AUTHORIZATION': f'Bearer {token}'} if token else {}
        return self.client.post(url, json.dumps(payload), content_type='application/json', **headers)

    def get(self, url, token=None):
        headers = {'HTTP_AUTHORIZATION': f'Bearer {token}'} if token else {}
        return self.client.get(url, **headers)

    def login(self, username='native_owner', password='Secure-test-password-2026!'):
        response = self.post('/api/v1/auth/login/', {'username': username, 'password': password})
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()['access_token']

    def product(self):
        data = {'request_id': str(uuid.uuid4()), 'kind': 'product', 'name': 'Test cream', 'category': 'Beauty', 'price': 250000, 'reorder': 3}
        apply_operation(self.owner, data)
        return Product.objects.get(pk=data['request_id'])

    def purchase(self, product, qty=5):
        return {'request_id': str(uuid.uuid4()), 'kind': 'purchase', 'product_id': str(product.id), 'quantity': qty, 'unit_amount': 150000, 'party': 'Supplier', 'payment': 'Cash', 'created': timezone.now().isoformat()}

    def checkout(self, product, qty=2):
        return {'request_id': str(uuid.uuid4()), 'kind': 'checkout', 'lines': [{'product_id': str(product.id), 'quantity': qty, 'unit_amount': product.price}], 'party': 'Walk-in customer', 'payment': 'Cash', 'created': timezone.now().isoformat()}

    def test_login_and_logout_revoke_token(self):
        self.assertEqual(self.post('/api/v1/auth/login/', {'username': 'native_owner', 'password': 'wrong'}).status_code, 401)
        self.assertEqual(self.get('/api/v1/me/').status_code, 401)
        token = self.login()
        self.assertEqual(self.get('/api/v1/me/', token).status_code, 200)
        self.assertEqual(self.post('/api/v1/auth/logout/', {}, token).status_code, 200)
        self.assertEqual(self.get('/api/v1/me/', token).status_code, 401)
        self.assertEqual(MobileToken.objects.count(), 0)

    def test_login_preflight_is_allowed_for_mobile_clients(self):
        response = self.client.options(
            '/api/v1/auth/login/',
            content_type='application/json',
            HTTP_ORIGIN='http://localhost:8081',
            HTTP_ACCESS_CONTROL_REQUEST_METHOD='POST',
            HTTP_ACCESS_CONTROL_REQUEST_HEADERS='Authorization, Content-Type',
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response['Access-Control-Allow-Origin'], 'http://localhost:8081')
        self.assertIn('POST', response['Access-Control-Allow-Methods'])
        self.assertIn('Authorization', response['Access-Control-Allow-Headers'])

    def test_mobile_checkout_idempotency_and_shared_stock(self):
        product = self.product()
        token = self.login()
        self.assertEqual(self.post('/api/v1/purchases/', {'kind': 'purchase', **self.purchase(product)}, token).status_code, 200)
        sale = self.checkout(product)
        response = self.post('/api/v1/checkout/', sale, token)
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(self.post('/api/v1/checkout/', sale, token).status_code, 200)
        product.refresh_from_db()
        self.assertEqual(product.stock, 3)
        self.assertEqual(Receipt.objects.count(), 1)
        self.assertEqual(Movement.objects.filter(kind='sale').count(), 1)
        self.assertEqual(len(self.get('/api/v1/receipts/', token).json()['receipts']), 1)

    def test_dashboard_metrics_aggregate_all_today_sales_and_local_trend(self):
        product = self.product()
        token = self.login()
        self.assertEqual(self.post('/api/v1/purchases/', self.purchase(product, qty=20), token).status_code, 200)
        created = timezone.now().isoformat()
        for _ in range(12):
            sale = self.checkout(product, qty=1)
            sale['created'] = created
            self.assertEqual(self.post('/api/v1/checkout/', sale, token).status_code, 200)
        sale_movement = Movement.objects.filter(store=self.store, kind='sale').first()
        refund = {
            'request_id': str(uuid.uuid4()),
            'kind': 'refund',
            'movement_id': str(sale_movement.id),
            'quantity': 1,
            'restock': False,
            'reason': 'Dashboard metric test',
            'payment': 'Cash',
            'created': created,
        }
        self.assertEqual(self.post('/api/v1/refunds/', refund, token).status_code, 200)

        response = self.get('/api/v1/dashboard/', token)
        self.assertEqual(response.status_code, 200, response.content)
        data = response.json()
        metrics = data['metrics']
        self.assertEqual(metrics['sales_today'], product.price * 12)
        self.assertEqual(metrics['purchases_today'], 150000 * 20)
        self.assertEqual(metrics['refunds_today'], product.price)
        self.assertEqual(metrics['net_sales_today'], product.price * 11)
        self.assertEqual(metrics['transactions_today'], 12)
        self.assertEqual(len(data['receipts']), 10)
        today = timezone.localdate().isoformat()
        today_bucket = next(item for item in metrics['sales_trend'] if item['day'] == today)
        self.assertEqual(today_bucket['amount'], product.price * 12)

    def test_mobile_expenses_are_permission_gated_and_idempotent(self):
        token = self.login()
        payload = {
            'kind': 'expense',
            'request_id': str(uuid.uuid4()),
            'description': 'Store supplies',
            'amount': 125050,
            'payment': 'Transfer',
            'created': timezone.now().isoformat(),
        }
        response = self.post('/api/v1/expenses/', payload, token)
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(self.post('/api/v1/expenses/', payload, token).status_code, 200)
        self.assertEqual(Expense.objects.count(), 1)
        expense = self.get('/api/v1/expenses/', token).json()['expenses'][0]
        self.assertEqual(expense['description'], 'Store supplies')
        self.assertEqual(expense['amount'], 125050)
        self.assertEqual(expense['payment'], 'Transfer')

        staff_membership = Membership.objects.get(user=self.cashier)
        staff_membership.role = 'staff'
        staff_membership.permissions = ['expense']
        staff_membership.save(update_fields=['role', 'permissions'])
        staff_token = self.login('native_cashier')
        self.assertEqual(self.get('/api/v1/expenses/', staff_token).status_code, 200)
        self.assertEqual(self.post('/api/v1/expenses/', {**payload, 'request_id': str(uuid.uuid4())}, staff_token).status_code, 200)

        viewer_token = self.login('native_viewer')
        self.assertEqual(self.get('/api/v1/expenses/', viewer_token).status_code, 403)
        self.assertEqual(self.post('/api/v1/expenses/', {**payload, 'request_id': str(uuid.uuid4())}, viewer_token).status_code, 403)

    def test_mobile_profit_report_matches_confirmed_ledger_calculations(self):
        product = self.product()
        token = self.login()
        self.assertEqual(self.post('/api/v1/purchases/', self.purchase(product, qty=5), token).status_code, 200)
        sale_payload = self.checkout(product, qty=2)
        self.assertEqual(self.post('/api/v1/checkout/', sale_payload, token).status_code, 200)
        movement = Movement.objects.get(kind='sale')
        refund = {
            'kind': 'refund',
            'request_id': str(uuid.uuid4()),
            'movement_id': str(movement.id),
            'quantity': 1,
            'restock': True,
            'reason': 'Report test return',
            'payment': 'Cash',
            'created': timezone.now().isoformat(),
        }
        self.assertEqual(self.post('/api/v1/refunds/', refund, token).status_code, 200)
        expense = {
            'kind': 'expense',
            'request_id': str(uuid.uuid4()),
            'description': 'Shop transport',
            'amount': 30000,
            'payment': 'Cash',
            'created': timezone.now().isoformat(),
        }
        self.assertEqual(self.post('/api/v1/expenses/', expense, token).status_code, 200)

        today = timezone.localdate().isoformat()
        response = self.get(f'/api/v1/reports/?from={today}&to={today}', token)
        self.assertEqual(response.status_code, 200, response.content)
        metrics = response.json()['metrics']
        self.assertEqual(metrics['gross_sales'], product.price * 2)
        self.assertEqual(metrics['refunds'], product.price)
        self.assertEqual(metrics['net_sales'], product.price)
        self.assertEqual(metrics['cost_of_goods_sold'], 150000)
        self.assertEqual(metrics['known_cost_gross_profit'], 100000)
        self.assertEqual(metrics['expenses'], 30000)
        self.assertEqual(metrics['estimated_operating_profit'], 70000)
        self.assertEqual(metrics['unknown_cost_sales'], 0)
        self.assertEqual(len(response.json()['expenses_list']), 1)

        self.assertEqual(self.get('/api/v1/reports/?from=invalid', token).status_code, 400)
        self.assertEqual(self.get(f'/api/v1/reports/?from={today}&to=2020-01-01', token).status_code, 400)
        self.assertEqual(self.get('/api/v1/reports/', self.login('native_viewer')).status_code, 403)

    def test_mobile_refund_idempotency_and_receipt_lines(self):
        product = self.product()
        token = self.login()
        self.assertEqual(self.post('/api/v1/purchases/', self.purchase(product), token).status_code, 200)
        sale = self.checkout(product)
        self.assertEqual(self.post('/api/v1/checkout/', sale, token).status_code, 200)
        receipt = self.get('/api/v1/receipts/', token).json()['receipts'][0]
        self.assertEqual(receipt['lines'][0]['remaining'], 2)
        refund = {'kind': 'refund', 'request_id': str(uuid.uuid4()), 'movement_id': str(Movement.objects.get(kind='sale').id), 'quantity': 1, 'restock': True, 'reason': 'Customer return', 'payment': 'Cash', 'created': timezone.now().isoformat()}
        self.assertEqual(self.post('/api/v1/refunds/', refund, token).status_code, 200)
        self.assertEqual(self.post('/api/v1/refunds/', refund, token).status_code, 200)
        product.refresh_from_db()
        self.assertEqual(product.stock, 4)
        self.assertEqual(Refund.objects.count(), 1)
        receipt = self.get('/api/v1/receipts/', token).json()['receipts'][0]
        self.assertEqual(receipt['lines'][0]['remaining'], 1)

    def test_viewer_cannot_refund(self):
        product = self.product()
        owner_token = self.login()
        self.assertEqual(self.post('/api/v1/purchases/', self.purchase(product), owner_token).status_code, 200)
        self.assertEqual(self.post('/api/v1/checkout/', self.checkout(product), owner_token).status_code, 200)
        sale = Movement.objects.get(kind='sale')
        refund = {'kind': 'refund', 'request_id': str(uuid.uuid4()), 'movement_id': str(sale.id), 'quantity': 1, 'restock': True, 'reason': 'Customer return', 'payment': 'Cash', 'created': timezone.now().isoformat()}
        self.assertEqual(self.post('/api/v1/refunds/', refund, self.login('native_viewer')).status_code, 403)

    def test_viewer_cannot_checkout_or_purchase(self):
        product = self.product()
        token = self.login('native_viewer')
        self.assertEqual(self.post('/api/v1/checkout/', self.checkout(product), token).status_code, 403)
        self.assertEqual(self.post('/api/v1/purchases/', self.purchase(product), token).status_code, 403)
        self.assertEqual(self.get('/api/v1/owner/staff/', token).status_code, 403)

    def test_owner_can_manage_staff_but_cannot_edit_owner(self):
        token = self.login()
        self.assertEqual(self.get('/api/v1/owner/staff/', token).status_code, 200)
        self.assertEqual(self.post('/api/v1/owner/staff/', {'action': 'update', 'user_id': self.owner.pk, 'role': 'viewer'}, token).status_code, 403)
        response = self.post('/api/v1/owner/staff/', {'action': 'create', 'username': 'native_new_staff', 'password': 'Another-safe-password!', 'role': 'staff', 'permissions': ['purchase']}, token)
        self.assertEqual(response.status_code, 200, response.content)
        new_member = Membership.objects.get(user__username='native_new_staff')
        self.assertEqual(new_member.store_id, self.store.id)
        self.assertEqual(new_member.permissions, ['purchase'])

    def test_owner_can_create_and_edit_products_via_native_api(self):
        token = self.login()
        product_payload = {'request_id': str(uuid.uuid4()), 'kind': 'product', 'name': 'Native Glow', 'category': 'Skincare', 'price': 850000, 'reorder': 5}
        create_response = self.post('/api/v1/products/', product_payload, token)
        self.assertEqual(create_response.status_code, 200, create_response.content)
        product = Product.objects.get(pk=product_payload['request_id'])
        self.assertEqual(product.name, 'Native Glow')

        edit_payload = {'request_id': str(uuid.uuid4()), 'kind': 'product_update', 'product_id': str(product.id), 'version': 1, 'name': 'Native Glow Renew', 'category': 'Skincare', 'price': 920000, 'reorder': 7, 'active': True, 'barcode': 'NG-100', 'photo': ''}
        edit_response = self.post('/api/v1/products/', edit_payload, token)
        self.assertEqual(edit_response.status_code, 200, edit_response.content)
        product.refresh_from_db()
        self.assertEqual(product.name, 'Native Glow Renew')
        self.assertEqual(product.price, 920000)
        self.assertEqual(product.version, 2)

    def test_business_isolation(self):
        product = self.product()
        other = Store.objects.create(name='Other Store')
        User = get_user_model()
        other_owner = User.objects.create_user('other_native_owner', password='Secure-test-password-2026!')
        Membership.objects.create(user=other_owner, store=other, role='owner')
        token = self.login('other_native_owner')
        self.assertEqual(self.get('/api/v1/products/', token).json()['products'], [])
        self.assertEqual(self.post('/api/v1/checkout/', self.checkout(product), token).status_code, 409)

    def test_mobile_login_throttling(self):
        from django.core.cache import cache
        cache.clear()
        for _ in range(5):
            self.assertEqual(self.post('/api/v1/auth/login/', {'username': 'native_owner', 'password': 'bad'}).status_code, 401)
        self.assertEqual(self.post('/api/v1/auth/login/', {'username': 'native_owner', 'password': 'bad'}).status_code, 429)
        cache.clear()
        self.assertEqual(self.post('/api/v1/auth/login/', {'username': 'native_owner', 'password': 'Secure-test-password-2026!'}).status_code, 200)
