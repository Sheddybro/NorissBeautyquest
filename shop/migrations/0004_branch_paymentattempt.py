import uuid
from django.db import migrations, models
import django.db.models.deletion
from django.db.models import Q


def create_default_branches(apps, schema_editor):
    Store = apps.get_model('shop', 'Store')
    Branch = apps.get_model('shop', 'Branch')
    for store in Store.objects.using(schema_editor.connection.alias).all().iterator():
        Branch.objects.using(schema_editor.connection.alias).get_or_create(
            store_id=store.pk, code='main', defaults={'name': 'Main Branch'})


class Migration(migrations.Migration):
    dependencies = [('shop', '0003_staff_role')]
    operations = [
        migrations.CreateModel(name='Branch', fields=[
            ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
            ('name', models.CharField(max_length=120)),
            ('code', models.SlugField(max_length=32)),
            ('active', models.BooleanField(default=True)),
            ('created', models.DateTimeField(auto_now_add=True)),
            ('store', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='branches', to='shop.store')),
        ], options={'ordering': ['name']}),
        migrations.AddConstraint(model_name='branch', constraint=models.UniqueConstraint(fields=('store', 'code'), name='unique_branch_code_per_store')),
        migrations.RunPython(create_default_branches, migrations.RunPython.noop),
        migrations.CreateModel(name='PaymentAttempt', fields=[
            ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
            ('provider', models.CharField(default='manual', max_length=32)),
            ('reference', models.CharField(max_length=120)),
            ('amount', models.PositiveBigIntegerField(help_text='Amount in kobo')),
            ('currency', models.CharField(default='NGN', max_length=3)),
            ('status', models.CharField(choices=[('pending','Pending'),('verified','Verified'),('failed','Failed'),('cancelled','Cancelled'),('refunded','Refunded')], default='pending', max_length=12)),
            ('provider_metadata', models.JSONField(blank=True, default=dict)),
            ('created', models.DateTimeField(auto_now_add=True)),
            ('verified_at', models.DateTimeField(blank=True, null=True)),
            ('receipt', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='payment_attempts', to='shop.receipt')),
            ('store', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='payment_attempts', to='shop.store')),
        ]),
        migrations.AddConstraint(model_name='paymentattempt', constraint=models.UniqueConstraint(fields=('provider', 'reference'), name='unique_provider_payment_reference')),
        migrations.AddConstraint(model_name='paymentattempt', constraint=models.CheckConstraint(condition=Q(amount__gt=0), name='payment_attempt_positive_amount')),
        migrations.AddIndex(model_name='paymentattempt', index=models.Index(fields=['store', 'status'], name='payment_store_status_idx')),
    ]
