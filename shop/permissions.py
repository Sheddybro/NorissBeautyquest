"""Server-enforced permissions. Legacy cashier/viewer behavior is preserved."""
OPERATION_KINDS = frozenset({'product','product_update','sale','checkout','purchase','refund','expense','reconcile'})
STAFF_DEFAULT = frozenset({'sale','checkout'})

def can_operate(member, kind):
    if kind not in OPERATION_KINDS:
        return False
    if member.role == 'owner':
        return True
    if member.role == 'viewer':
        return False
    if member.role == 'cashier':
        return kind in STAFF_DEFAULT
    if member.role == 'staff':
        extras = member.permissions if isinstance(member.permissions, list) else []
        grants = {value for value in extras if isinstance(value, str) and value in OPERATION_KINDS}
        return kind in STAFF_DEFAULT or kind in grants
    return False

def permitted_operations(member):
    return sorted(kind for kind in OPERATION_KINDS if can_operate(member, kind))
