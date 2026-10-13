"""Populate an owner shop with repeatable, clearly labelled demo data."""
import uuid
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from shop.models import (
    Membership,
    Movement,
    Operation,
    Product,
    Receipt,
    Reconciliation,
    Refund,
)
from shop.services import ShopError, apply_operation, expected_payments


DEMO_NAMESPACE = uuid.UUID("e5ee59df-7017-4dfb-81f9-56cfa2c26d76")

PRODUCTS = (
    ("Demo · Glow serum", "Skincare", 850_000, 8, 44),
    ("Demo · Shea body lotion", "Skincare", 450_000, 10, 56),
    ("Demo · Velvet lipstick", "Makeup", 350_000, 12, 64),
    ("Demo · Signature fragrance", "Fragrance", 1_200_000, 5, 28),
    ("Demo · Curl defining cream", "Haircare", 550_000, 8, 45),
    ("Demo · Daily sunscreen", "Skincare", 720_000, 8, 38),
    ("Demo · Nourishing body oil", "Skincare", 680_000, 7, 32),
    ("Demo · Gentle face cleanser", "Skincare", 620_000, 8, 46),
    ("Demo · Travel size mist", "Fragrance", 250_000, 8, 7),
)

# Day offset, payment method, and (product index, quantity) line items.
SALES = (
    (0, "Cash", ((0, 1), (2, 2))),
    (1, "Transfer", ((1, 2), (5, 1))),
    (2, "POS card", ((3, 1), (7, 1))),
    (3, "Cash", ((4, 2), (6, 1))),
    (5, "Transfer", ((0, 1), (1, 1), (2, 1))),
    (7, "POS card", ((5, 2), (7, 1))),
    (9, "Cash", ((3, 1), (6, 2))),
    (11, "Transfer", ((0, 2), (4, 1))),
    (14, "POS card", ((1, 1), (2, 2))),
    (14, "Cash", ((5, 1), (7, 2))),
    (17, "Transfer", ((3, 1), (4, 1))),
    (20, "Cash", ((0, 1), (6, 1))),
    (23, "POS card", ((1, 2), (5, 1))),
    (27, "Transfer", ((2, 1), (7, 1))),
)


def stable_id(store_id, key):
    return str(uuid.uuid5(DEMO_NAMESPACE, f"store:{store_id}:{key}"))


class Command(BaseCommand):
    help = "Add repeatable demo products, inventory, sales and reporting data."

    def add_arguments(self, parser):
        parser.add_argument("--owner", required=True)

    def handle(self, *args, **options):
        try:
            user = get_user_model().objects.get(username=options["owner"])
            member = Membership.objects.select_related("store").get(
                user=user, role="owner"
            )
        except (get_user_model().DoesNotExist, Membership.DoesNotExist):
            raise CommandError(
                "Create or assign the owner with setup_shop and Django admin first."
            )

        created = 0

        def add_operation(key, payload):
            nonlocal created
            request_id = stable_id(member.store_id, key)
            if Operation.objects.filter(pk=request_id).exists():
                return request_id
            payload["request_id"] = request_id
            try:
                result = apply_operation(user, payload)
            except ShopError as exc:
                raise CommandError(f"Could not add demo {key}: {exc.message}") from exc
            if not result["duplicate"]:
                created += 1
            return request_id

        now = timezone.now()
        products = []
        purchases = []
        try:
            with transaction.atomic():
                for index, (name, category, price, reorder, opening_stock) in enumerate(
                    PRODUCTS
                ):
                    product = Product.objects.filter(
                        store=member.store, name=name
                    ).first()
                    if product is None:
                        product_id = add_operation(
                            f"product:{index}",
                            {
                                "kind": "product",
                                "name": name,
                                "category": category,
                                "price": price,
                                "reorder": reorder,
                            },
                        )
                        product = Product.objects.get(pk=product_id)
                    products.append(product)

                    lots = [(opening_stock, 120, 0)]
                    if index in (0, 4, 5):
                        split = opening_stock // 2
                        lots = [(split, 180, 1), (opening_stock - split, 75, 2)]
                    for lot_index, (quantity, expiry_days, cost_adjustment) in enumerate(
                        lots
                    ):
                        key = f"purchase:{index}:{lot_index}"
                        purchase_id = add_operation(
                            key,
                            {
                                "kind": "purchase",
                                "product_id": str(product.id),
                                "quantity": quantity,
                                "unit_amount": price // 2 + cost_adjustment * 5_000,
                                "party": "Demo supplier",
                                "payment": "Transfer",
                                "created": (
                                    now - timedelta(days=35 - lot_index)
                                ).isoformat(),
                                "batch_code": f"DEMO-{index + 1:02}-{lot_index + 1:02}",
                                "expires": (
                                    timezone.localdate() + timedelta(days=expiry_days)
                                ).isoformat(),
                            },
                        )
                        purchases.append(purchase_id)

                sale_ids = []
                for index, (day_offset, payment, lines) in enumerate(SALES):
                    created_at = now - timedelta(
                        days=day_offset, hours=(index * 3) % 12
                    )
                    sale_ids.append(
                        add_operation(
                            f"sale:{index}",
                            {
                                "kind": "checkout",
                                "lines": [
                                    {
                                        "product_id": str(products[product_index].id),
                                        "quantity": quantity,
                                        "unit_amount": PRODUCTS[product_index][2],
                                    }
                                    for product_index, quantity in lines
                                ],
                                "party": f"Demo customer {index + 1:02}",
                                "payment": payment,
                                "created": created_at.isoformat(),
                            },
                        )
                    )

                # One returned item exercises refund reporting and restocking.
                refund_sale_index = 2
                refund_sale_id = sale_ids[refund_sale_index]
                first_line_id = uuid.uuid5(uuid.UUID(refund_sale_id), "0")
                sale_line = Movement.objects.get(pk=first_line_id)
                add_operation(
                    "refund:partial",
                    {
                        "kind": "refund",
                        "movement_id": str(sale_line.id),
                        "quantity": 1,
                        "restock": True,
                        "reason": "Demo partial return",
                        "payment": "POS card",
                        "created": (now - timedelta(days=1)).isoformat(),
                    },
                )

                for index, (day_offset, description, amount, payment) in enumerate(
                    (
                        (0, "Demo · Packaging supplies", 28_000, "Cash"),
                        (3, "Demo · Local delivery", 45_000, "Transfer"),
                        (8, "Demo · Shop utilities", 72_000, "Cash"),
                        (14, "Demo · Social media promotion", 55_000, "POS card"),
                        (21, "Demo · Cleaning supplies", 18_000, "Cash"),
                    )
                ):
                    add_operation(
                        f"expense:{index}",
                        {
                            "kind": "expense",
                            "description": description,
                            "amount": amount,
                            "payment": payment,
                            "created": (now - timedelta(days=day_offset)).isoformat(),
                        },
                    )

                reconciliation_day = timezone.localdate() - timedelta(days=14)
                if not Reconciliation.objects.filter(
                    store=member.store, day=reconciliation_day
                ).exists():
                    expected = expected_payments(member.store, reconciliation_day, 100_000)
                    add_operation(
                        "reconciliation:14",
                        {
                            "kind": "reconcile",
                            "day": reconciliation_day.isoformat(),
                            "opening_cash": 100_000,
                            "actual_cash": max(0, expected["Cash"] - 2_500),
                            "actual_transfer": expected["Transfer"],
                            "actual_pos": expected["POS card"],
                            "note": "Demo close · small cash variance for review",
                        },
                    )
        except (Product.DoesNotExist, Movement.DoesNotExist) as exc:
            raise CommandError(
                "Demo setup is incomplete; rerun the command to safely resume."
            ) from exc

        self.stdout.write(
            self.style.SUCCESS(
                f"Demo data ready for {member.store.name}: "
                f"{len(products)} products, {len(purchases)} purchase lots, "
                f"{len(SALES)} checkouts, one partial refund, five expenses. "
                f"{created} new demo operations added; rerunning is safe. "
                "All sample records are labeled Demo."
            )
        )
