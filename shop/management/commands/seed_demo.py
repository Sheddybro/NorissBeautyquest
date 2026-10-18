"""Populate an owner shop with repeatable, clearly labelled demo data."""
import base64
import io
import uuid
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone
from PIL import Image

from shop.models import (
    Branch,
    Membership,
    Movement,
    Operation,
    PaymentAttempt,
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


def demo_photo():
    image = Image.new("RGB", (24, 24), (42, 112, 91))
    output = io.BytesIO()
    image.save(output, format="PNG")
    return "data:image/png;base64," + base64.b64encode(output.getvalue()).decode("ascii")


class Command(BaseCommand):
    help = "Add a repeatable, comprehensive demo dataset to an owner shop."

    def add_arguments(self, parser):
        parser.add_argument("--owner", required=True)
        parser.add_argument(
            "--scale",
            type=int,
            default=100,
            help="Repeat the base dataset this many times (default: 100).",
        )

    def handle(self, *args, **options):
        scale = options["scale"]
        if not 1 <= scale <= 100:
            raise CommandError("Scale must be between 1 and 100.")
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
        photo = demo_photo()
        products = []
        purchases = []
        catalog = []
        for cycle in range(scale):
            for template_index, (name, category, price, reorder, opening_stock) in enumerate(PRODUCTS):
                product_index = cycle * len(PRODUCTS) + template_index
                display_name = name if cycle == 0 else f"{name} {cycle + 1:03d}"
                adjusted_price = price if cycle == 0 else price + ((cycle * 7 + template_index * 3) % 11) * 2_500
                catalog.append((
                    display_name,
                    category,
                    adjusted_price,
                    reorder,
                    opening_stock if cycle == 0 else opening_stock * 5,
                ))

        try:
            with transaction.atomic():
                for index, (name, category, price, reorder, opening_stock) in enumerate(catalog):
                    product = Product.objects.filter(
                        store=member.store, name=name
                    ).first()
                    if product is None:
                        barcode = f"DEMO{member.store_id}-{index + 1:04d}"
                        product_id = add_operation(
                            f"product:{index}",
                            {
                                "kind": "product",
                                "name": name,
                                "category": category,
                                "price": price,
                                "reorder": reorder,
                                "barcode": barcode,
                                "photo": photo if index == 0 else "",
                            },
                        )
                        product = Product.objects.get(pk=product_id)
                    products.append(product)

                    if index < len(PRODUCTS) and index in (0, 4, 5):
                        split = opening_stock // 2
                        lots = [(split, 180, 1), (opening_stock - split, 75, 2)]
                    elif index < len(PRODUCTS):
                        if index == len(PRODUCTS) - 1:
                            split = opening_stock // 2
                            lots = [(split, -7, 0), (opening_stock - split, 10, 1)]
                        else:
                            lots = [(opening_stock, 120, 0)]
                    else:
                        split = opening_stock // 2
                        expiry_days = -7 if index % 17 == 0 else (0 if index % 11 == 0 else (10 if index % 7 == 0 else 120))
                        lots = [(split, expiry_days, 0), (opening_stock - split, 180, 1)]
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

                    expected_barcode = f"DEMO{member.store_id}-{index + 1:04d}"
                    needs_product_update = (
                        product.barcode != expected_barcode
                        or (index == 0 and not product.photo)
                        or (index == len(catalog) - 1 and product.active)
                    )
                    if needs_product_update:
                        add_operation(
                            f"product-update:{index}",
                            {
                                "kind": "product_update",
                                "product_id": str(product.id),
                                "version": product.version,
                                "name": product.name,
                                "category": product.category,
                                "price": product.price,
                                "reorder": product.reorder,
                                "barcode": expected_barcode,
                                "photo": product.photo or (photo if index == 0 else ""),
                                "active": False if index == len(catalog) - 1 else product.active,
                            },
                        )
                        product.refresh_from_db()

                today = timezone.localdate()
                for index, product in enumerate(products[:3]):
                    purchase_id = add_operation(
                        f"purchase:today:{today.isoformat()}:{index}",
                        {
                            "kind": "purchase",
                            "product_id": str(product.id),
                            "quantity": 4 + index,
                            "unit_amount": catalog[index][2] // 2,
                            "party": f"Demo supplier {index + 1}",
                            "payment": ("Cash", "Transfer", "POS card")[index],
                            "created": now.isoformat(),
                            "batch_code": f"DEMO-TODAY-{today:%Y%m%d}-{index + 1}",
                            "expires": (today + timedelta(days=180)).isoformat(),
                        },
                    )
                    purchases.append(purchase_id)

                sale_ids = []
                sale_details = []
                saleable_count = max(1, len(products) - 1)
                for index in range(len(SALES) * scale):
                    if index < len(SALES):
                        day_offset, payment, lines = SALES[index]
                    else:
                        day_offset = (index * 7 + index // len(SALES) * 3) % 90
                        payment = ("Cash", "Transfer", "POS card")[index % 3]
                        line_count = 2 + (index % 3 == 0)
                        lines = tuple(
                            (
                                (index * 7 + line_index * 31) % saleable_count,
                                1 + ((index + line_index) % 2),
                            )
                            for line_index in range(line_count)
                        )
                    created_at = now - timedelta(days=day_offset, hours=(index * 3) % 12)
                    sale_details.append((day_offset, created_at))
                    sale_ids.append(
                        add_operation(
                            f"sale:{index}",
                            {
                                "kind": "checkout",
                                "lines": [
                                    {
                                        "product_id": str(products[product_index].id),
                                        "quantity": quantity,
                                        "unit_amount": catalog[product_index][2],
                                    }
                                    for product_index, quantity in lines
                                ],
                                "party": f"Demo customer {index + 1:04}",
                                "payment": payment,
                                "created": created_at.isoformat(),
                            },
                        )
                    )

                refund_indexes = [2]
                if len(sale_ids) > 7:
                    refund_indexes.append(7)
                refund_indexes.extend(range(49, len(sale_ids), 50))
                for refund_number, sale_index in enumerate(refund_indexes):
                    sale_id = sale_ids[sale_index]
                    sale_line = Movement.objects.get(
                        pk=uuid.uuid5(uuid.UUID(sale_id), "0")
                    )
                    sale_day, sale_created = sale_details[sale_index]
                    add_operation(
                        "refund:partial" if sale_index == 2 else f"refund:{sale_index}",
                        {
                            "kind": "refund",
                            "movement_id": str(sale_line.id),
                            "quantity": 1,
                            "restock": refund_number % 2 == 0,
                            "reason": "Demo partial return" if refund_number == 0 else "Demo customer return",
                            "payment": sale_line.payment,
                            "created": (sale_created + timedelta(hours=1)).isoformat(),
                        },
                    )

                base_expenses = (
                    (0, "Demo · Packaging supplies", 28_000, "Cash"),
                    (3, "Demo · Local delivery", 45_000, "Transfer"),
                    (8, "Demo · Shop utilities", 72_000, "Cash"),
                    (14, "Demo · Social media promotion", 55_000, "POS card"),
                    (21, "Demo · Cleaning supplies", 18_000, "Cash"),
                )
                for index in range(len(base_expenses) * scale):
                    if index < len(base_expenses):
                        day_offset, description, amount, payment = base_expenses[index]
                    else:
                        day_offset = (index * 11) % 90
                        description = f"Demo · Operating expense {index + 1:04}"
                        amount = 15_000 + (index * 7_300) % 125_000
                        payment = ("Cash", "Transfer", "POS card")[index % 3]
                    add_operation(
                        f"expense:{index}",
                        {
                            "kind": "expense",
                            "description": description,
                            "amount": amount,
                            "payment": payment,
                            "created": (now - timedelta(days=day_offset, hours=index % 12)).isoformat(),
                        },
                    )

                reconciliation_offsets = sorted(set(range(0, min(90, scale * 3), 3)) | {14})
                for day_offset in reconciliation_offsets:
                    reconciliation_day = timezone.localdate() - timedelta(days=day_offset)
                    if Reconciliation.objects.filter(
                        store=member.store, day=reconciliation_day
                    ).exists():
                        continue
                    expected = expected_payments(member.store, reconciliation_day, 100_000)
                    add_operation(
                        f"reconciliation:{day_offset}",
                        {
                            "kind": "reconcile",
                            "day": reconciliation_day.isoformat(),
                            "opening_cash": 100_000,
                            "actual_cash": max(0, expected["Cash"] - 2_500),
                            "actual_transfer": max(0, expected["Transfer"]),
                            "actual_pos": max(0, expected["POS card"]),
                            "note": "Demo close · cash variance for review",
                        },
                    )

                self._seed_team(user, member)
                self._seed_branches(member)
                self._seed_payment_attempts(member)
        except (Product.DoesNotExist, Movement.DoesNotExist) as exc:
            raise CommandError(
                "Demo setup is incomplete; rerun the command to safely resume."
            ) from exc

        self.stdout.write(
            self.style.SUCCESS(
                f"Demo data ready for {member.store.name}: "
                f"{len(products)} products, {len(purchases)} purchase lots, "
                f"{len(sale_ids)} checkouts, {len(refund_indexes)} returns, "
                f"{len(base_expenses) * scale} expenses, {len(reconciliation_offsets)} reconciliation days. "
                f"{created} new demo operations added; rerunning is safe. "
                "Staff accounts have no usable password; all sample records are labeled Demo."
            )
        )

    def _seed_team(self, owner, member):
        user_model = get_user_model()
        staff_rows = (
            ("staff", ["product", "product_update", "purchase", "expense", "reconcile"]),
            ("cashier", []),
            ("viewer", []),
        )
        for role, permissions in staff_rows:
            username = f"demo_{member.store_id}_{role}"
            user = user_model.objects.filter(username=username).first()
            if user is None:
                user = user_model.objects.create_user(username=username)
                user.set_unusable_password()
                user.save(update_fields=["password"])
            existing = Membership.objects.filter(user=user).first()
            if existing and existing.store_id != member.store_id:
                raise CommandError(f"Demo account {username} is already assigned to another shop.")
            Membership.objects.update_or_create(
                user=user,
                defaults={"store": member.store, "role": role, "permissions": permissions},
            )

    def _seed_branches(self, member):
        for name, code, active in (
            ("Main Branch", "main", True),
            ("Demo · City Centre", "demo-city-centre", True),
            ("Demo · Seasonal Pop-up", "demo-pop-up", False),
        ):
            Branch.objects.update_or_create(
                store=member.store,
                code=code,
                defaults={"name": name, "active": active},
            )

    def _seed_payment_attempts(self, member):
        statuses = ("pending", "verified", "failed", "cancelled", "refunded")
        receipts = list(Receipt.objects.filter(store=member.store).order_by("number")[:5])
        for index, status in enumerate(statuses):
            receipt = receipts[index] if index < len(receipts) else None
            PaymentAttempt.objects.update_or_create(
                provider="demo",
                reference=f"DEMO-{member.store_id}-{status}",
                defaults={
                    "store": member.store,
                    "receipt": receipt,
                    "amount": max(1, sum(item.quantity * item.unit_amount for item in receipt.items.all())) if receipt else 25_000,
                    "currency": "NGN",
                    "status": status,
                    "verified_at": timezone.now() if status in ("verified", "refunded") else None,
                    "provider_metadata": {"demo": True, "scenario": status},
                },
            )
