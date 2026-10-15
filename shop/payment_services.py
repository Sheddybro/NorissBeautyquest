"""Provider-neutral payment lifecycle. No gateway credentials or network calls.

All transitions are server-side and serialized; callers must independently verify
provider events before passing verified=True.
"""
from django.db import transaction
from django.utils import timezone
from .models import PaymentAttempt

class PaymentTransitionError(ValueError):
    pass

ALLOWED_TRANSITIONS = {
    'pending': {'verified', 'failed', 'cancelled'},
    'verified': {'refunded'},
    'failed': set(), 'cancelled': set(), 'refunded': set(),
}

@transaction.atomic
def transition_payment(*, payment_id, target, verified=False):
    """Change a payment state with a row lock and explicit verification gate.

    This service deliberately does not contact Paystack or assert that any
    provider has confirmed a transaction. Only a trusted backend integration
    should call it with verified=True after independently checking evidence.
    """
    attempt = PaymentAttempt.objects.select_for_update().get(pk=payment_id)
    if attempt.status == target:
        return attempt  # safe repeated callback
    if target not in ALLOWED_TRANSITIONS.get(attempt.status, set()):
        raise PaymentTransitionError(f'Invalid transition: {attempt.status} -> {target}')
    if target in {'verified', 'refunded'} and not verified:
        raise PaymentTransitionError('Verified provider evidence is required')
    attempt.status = target
    if target == 'verified':
        attempt.verified_at = timezone.now()
    attempt.save(update_fields=['status', 'verified_at'] if target == 'verified' else ['status'])
    return attempt
