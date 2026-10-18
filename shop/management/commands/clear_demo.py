"""Remove records created by seed_demo without touching normal shop data."""
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from shop.models import (
    Allocation,
    AuditLog,
    Batch,
    Branch,
    Expense,
    Membership,
    MobileToken,
    Movement,
    Operation,
    PaymentAttempt,
    Product,
    Receipt,
    Reconciliation,
    Refund,
)


class Command(BaseCommand):
    help = "Remove the clearly labeled demo dataset from an owner shop."

    def add_arguments(self, parser):
        parser.add_argument("--owner", required=True)
        parser.add_argument(
            "--yes",
            action="store_true",
            help="Skip the interactive confirmation prompt.",
        )

    def handle(self, *args, **options):
        user_model = get_user_model()
        try:
            owner = user_model.objects.get(username=options["owner"])
            membership = Membership.objects.select_related("store").get(
                user=owner, role="owner"
            )
        except (user_model.DoesNotExist, Membership.DoesNotExist):
            raise CommandError("The named owner does not have an owner shop membership.")

        store = membership.store
        products = Product.objects.filter(store=store, name__startswith="Demo ·")
        product_ids = {str(value) for value in products.values_list("id", flat=True)}
        movements = Movement.objects.filter(store=store, product__in=products)
        movement_ids = {str(value) for value in movements.values_list("id", flat=True)}
        receipts = Receipt.objects.filter(store=store, items__in=movements).distinct()
        receipt_ids = {str(value) for value in receipts.values_list("id", flat=True)}
        refunds = Refund.objects.filter(movement__in=movements)
        refund_ids = {str(value) for value in refunds.values_list("id", flat=True)}
        expenses = Expense.objects.filter(store=store, description__startswith="Demo")
        expense_ids = {str(value) for value in expenses.values_list("id", flat=True)}
        reconciliations = Reconciliation.objects.filter(
            store=store, note__startswith="Demo"
        )
        reconciliation_ids = {
            str(value) for value in reconciliations.values_list("id", flat=True)
        }
        direct_references = (
            product_ids
            | movement_ids
            | receipt_ids
            | refund_ids
            | expense_ids
            | reconciliation_ids
        )

        demo_audits = []
        for audit in AuditLog.objects.filter(store=store):
            details = audit.details if isinstance(audit.details, dict) else {}
            lines = details.get("lines", [])
            has_demo_line = isinstance(lines, list) and any(
                isinstance(line, dict) and str(line.get("product_id")) in product_ids
                for line in lines
            )
            product_id = str(details.get("product_id", ""))
            demo_label = any(
                isinstance(details.get(field), str)
                and details[field].startswith("Demo")
                for field in ("name", "description", "party", "note")
            )
            if (
                audit.reference in direct_references
                or product_id in product_ids
                or has_demo_line
                or demo_label
            ):
                demo_audits.append(audit)

        operation_ids = direct_references | {audit.reference for audit in demo_audits}
        payment_attempts = PaymentAttempt.objects.filter(store=store).filter(
            provider="demo"
        ) | PaymentAttempt.objects.filter(
            store=store, reference__startswith=f"DEMO-{store.pk}-"
        ) | PaymentAttempt.objects.filter(store=store, receipt__in=receipts)
        branches = Branch.objects.filter(
            store=store, code__in=("demo-city-centre", "demo-pop-up")
        )
        demo_usernames = [f"demo_{store.pk}_{role}" for role in ("staff", "cashier", "viewer")]
        demo_users = user_model.objects.filter(username__in=demo_usernames)
        demo_memberships = Membership.objects.filter(user__in=demo_users, store=store)
        counts = {
            "products": products.count(),
            "movements": movements.count(),
            "receipts": receipts.count(),
            "expenses": expenses.count(),
            "reconciliations": reconciliations.count(),
            "staff accounts": demo_memberships.count(),
            "branches": branches.count(),
            "payment attempts": payment_attempts.distinct().count(),
        }

        self.stdout.write(", ".join(f"{count} {label}" for label, count in counts.items()))
        if not options["yes"]:
            confirmation = input(
                f"Remove the demo data from {store.name}? Type 'yes' to continue: "
            ).strip().casefold()
            if confirmation != "yes":
                self.stdout.write("Cancelled; no demo data was removed.")
                return

        with transaction.atomic():
            payment_attempts.distinct().delete()
            refunds.delete()
            Allocation.objects.filter(movement__in=movements).delete()
            Batch.objects.filter(product__in=products).delete()
            movements.delete()
            Receipt.objects.filter(store=store, pk__in=receipt_ids).delete()
            expenses.delete()
            reconciliations.delete()
            AuditLog.objects.filter(pk__in=[audit.pk for audit in demo_audits]).delete()
            Operation.objects.filter(store=store, pk__in=operation_ids).delete()
            branches.delete()
            products.delete()
            MobileToken.objects.filter(user__in=demo_users).delete()
            demo_memberships.delete()
            for demo_user in demo_users:
                if not demo_user.has_usable_password():
                    demo_user.delete()

        self.stdout.write(self.style.SUCCESS("Demo data removed; non-demo shop data was preserved."))
