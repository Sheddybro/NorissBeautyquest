from getpass import getpass
from django.core.management.base import BaseCommand,CommandError
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from shop.models import Store,Membership
class Command(BaseCommand):
 help='Create the owner and shop interactively. No default passwords.'
 def add_arguments(self,parser):parser.add_argument('--username',default='owner')
 def handle(self,*args,**options):
  username=options['username'];User=get_user_model()
  if User.objects.filter(username=username).exists():raise CommandError('Username exists. Assign a Membership in Django admin instead.')
  email=input('Owner email: ').strip();password=getpass('Owner password: ')
  if password!=getpass('Confirm password: '):raise CommandError('Passwords do not match.')
  user=User(username=username,email=email)
  try:validate_password(password,user)
  except ValidationError as e:raise CommandError(' '.join(e.messages))
  user=User.objects.create_superuser(username=username,email=email,password=password)
  store=Store.objects.create(name='Noriss Beautyquest');Membership.objects.create(user=user,store=store,role='owner')
  self.stdout.write(self.style.SUCCESS('Owner and shop created. Sign in at /accounts/login/.'))
