from decimal import Decimal
from django import template
register=template.Library()
@register.filter
def naira(value):return f'₦{Decimal(value)/100:,.2f}'
