from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
class Migration(migrations.Migration):
 dependencies=[('shop','0004_branch_paymentattempt'),migrations.swappable_dependency(settings.AUTH_USER_MODEL)]
 operations=[migrations.CreateModel(name='MobileToken',fields=[('id',models.BigAutoField(auto_created=True,primary_key=True,serialize=False,verbose_name='ID')),('token_hash',models.CharField(db_index=True,max_length=64,unique=True)),('expires_at',models.DateTimeField(db_index=True)),('created_at',models.DateTimeField(auto_now_add=True)),('user',models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,related_name='noriss_mobile_tokens',to=settings.AUTH_USER_MODEL))])]
