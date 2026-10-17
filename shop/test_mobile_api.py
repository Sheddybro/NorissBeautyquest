"""Native API regression tests. Run: python manage.py test shop.test_mobile_api"""
import json
import uuid
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from .models import Membership, MobileToken, Movement, Product, Receipt, Refund, Store
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
