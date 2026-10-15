"""V4 architecture regression tests; run with python manage.py test shop."""
from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.test import TestCase
from .models import Branch, Membership, PaymentAttempt, Store
from .permissions import can_operate

class BranchAndPaymentsTests(TestCase):
    def setUp(self):
        self.store = Store.objects.create(name='Test retail business')
        self.user = get_user_model().objects.create_user(username='v4_test_staff', password='example-test-only')
        self.member = Membership.objects.create(store=self.store, user=self.user, role='staff')

    def test_branch_is_business_scoped(self):
        Branch.objects.create(store=self.store, name='Main', code='main')
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Branch.objects.create(store=self.store, name='Duplicate', code='main')

    def test_payment_reference_is_idempotent_across_businesses(self):
        PaymentAttempt.objects.create(store=self.store, provider='paystack', reference='test-ref-1', amount=50000)
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                PaymentAttempt.objects.create(store=self.store, provider='paystack', reference='test-ref-1', amount=50000)

    def test_staff_default_and_extra_permissions(self):
        self.assertTrue(can_operate(self.member, 'checkout'))
        self.assertFalse(can_operate(self.member, 'refund'))
        self.member.permissions = ['refund', {'invalid': 'permission'}]
        self.assertTrue(can_operate(self.member, 'refund'))
        self.assertFalse(can_operate(self.member, 'reconcile'))

    def test_viewer_cannot_operate(self):
        self.member.role = 'viewer'
        self.member.permissions = ['refund']
        self.assertFalse(can_operate(self.member, 'refund'))

class PaymentLifecycleTests(TestCase):
    def setUp(self):
        self.store = Store.objects.create(name='Lifecycle test')
        self.payment = PaymentAttempt.objects.create(
            store=self.store, provider='manual', reference='lifecycle-001', amount=2500)

    def test_cannot_verify_without_provider_evidence(self):
        from .payment_services import PaymentTransitionError, transition_payment
        with self.assertRaises(PaymentTransitionError):
            transition_payment(payment_id=self.payment.pk, target='verified')
        self.payment.refresh_from_db()
        self.assertEqual(self.payment.status, 'pending')

    def test_verified_payment_is_idempotent_and_timestamped(self):
        from .payment_services import transition_payment
        first = transition_payment(payment_id=self.payment.pk, target='verified', verified=True)
        second = transition_payment(payment_id=self.payment.pk, target='verified', verified=True)
        self.assertEqual(first.verified_at, second.verified_at)
        self.assertIsNotNone(first.verified_at)

    def test_rejects_invalid_terminal_state_transition(self):
        from .payment_services import PaymentTransitionError, transition_payment
        transition_payment(payment_id=self.payment.pk, target='failed')
        with self.assertRaises(PaymentTransitionError):
            transition_payment(payment_id=self.payment.pk, target='verified', verified=True)
