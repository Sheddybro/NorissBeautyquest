"""Dependency-free authorization contract tests; run with python -m unittest discover -s tests -p '*.test.py'."""
import unittest
from types import SimpleNamespace
from shop.permissions import OPERATION_KINDS, can_operate, permitted_operations

class PermissionContractTests(unittest.TestCase):
    def member(self, role, permissions=None):
        return SimpleNamespace(role=role, permissions=permissions if permissions is not None else [])

    def test_owner_can_perform_every_known_operation(self):
        self.assertEqual(set(permitted_operations(self.member('owner'))), OPERATION_KINDS)

    def test_staff_is_least_privileged_by_default(self):
        self.assertEqual(permitted_operations(self.member('staff')), ['checkout', 'sale'])

    def test_staff_explicit_grants(self):
        m=self.member('staff', ['purchase','refund','unknown'])
        self.assertTrue(can_operate(m,'purchase'))
        self.assertTrue(can_operate(m,'refund'))
        self.assertFalse(can_operate(m,'expense'))
        self.assertFalse(can_operate(m,'unknown'))

    def test_legacy_roles_do_not_gain_grants(self):
        for role in ('cashier','viewer'):
            m=self.member(role, ['refund','product'])
            self.assertFalse(can_operate(m,'refund'))
            self.assertFalse(can_operate(m,'product'))

    def test_malformed_grants_fail_closed(self):
        for grants in (None, {}, 'refund', 1, [None, {'refund':True}], [['refund']]):
            m=self.member('staff', grants)
            self.assertFalse(can_operate(m,'refund'), repr(grants))
            self.assertEqual(permitted_operations(m), ['checkout','sale'])

    def test_unknown_role_fails_closed(self):
        self.assertEqual(permitted_operations(self.member('superuser', ['refund'])), [])

if __name__ == '__main__':
    unittest.main()
