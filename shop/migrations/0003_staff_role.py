from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [('shop', '0002_allocation_auditlog_batch_expense_receipt_and_more')]
    operations = [
        migrations.AddField(model_name="membership", name="permissions", field=models.JSONField(default=list, blank=True, help_text="Additional staff operation permissions; owner always has full access.")),
        migrations.AlterField(
            model_name='membership', name='role',
            field=models.CharField(max_length=10, default='cashier', choices=[('owner','Owner'),('staff','Staff'),('cashier','Cashier (legacy)'),('viewer','Viewer (legacy)')]),
        ),
    ]
