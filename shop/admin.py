from django.contrib import admin
from .models import Store,Membership,Product,Movement,Operation,Receipt,Batch,Allocation,Refund,Expense,Reconciliation,AuditLog,SyncConflict,Branch,PaymentAttempt
admin.site.site_header='Noriss Beautyquest Administration'
admin.site.site_title='Noriss Admin'
admin.site.register(Store)
@admin.register(Membership)
class MembershipAdmin(admin.ModelAdmin):
 list_display=['user','store','role'];list_filter=['role'];autocomplete_fields=['user']
@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
 list_display=['name','category','price','stock','store'];readonly_fields=['id','stock','created'];search_fields=['name'];list_filter=['store','category']
 def has_add_permission(self,request):return False
 def has_delete_permission(self,request,obj=None):return False
 def has_change_permission(self,request,obj=None):return False
@admin.register(Movement)
class MovementAdmin(admin.ModelAdmin):
 list_display=['kind','product','quantity','unit_amount','created','recorded_by'];readonly_fields=[f.name for f in Movement._meta.fields];list_filter=['kind','store']
 def has_add_permission(self,request):return False
 def has_delete_permission(self,request,obj=None):return False
 def has_change_permission(self,request,obj=None):return False
@admin.register(Operation)
class OperationAdmin(admin.ModelAdmin):
 readonly_fields=[f.name for f in Operation._meta.fields]
 def has_add_permission(self,request):return False
 def has_delete_permission(self,request,obj=None):return False
 def has_change_permission(self,request,obj=None):return False

class ReadOnlyAdmin(admin.ModelAdmin):
 def has_add_permission(self,request):return False
 def has_change_permission(self,request,obj=None):return False
 def has_delete_permission(self,request,obj=None):return False
for model in [Receipt,Batch,Allocation,Refund,Expense,Reconciliation,AuditLog,SyncConflict]:admin.site.register(model,ReadOnlyAdmin)

@admin.register(Branch)
class BranchAdmin(admin.ModelAdmin):
 list_display=['name','code','store','active']
 list_filter=['store','active']
 search_fields=['name','code']

@admin.register(PaymentAttempt)
class PaymentAttemptAdmin(ReadOnlyAdmin):
 list_display=['provider','reference','amount','currency','status','store','created']
 list_filter=['provider','status','store']
 search_fields=['reference']
