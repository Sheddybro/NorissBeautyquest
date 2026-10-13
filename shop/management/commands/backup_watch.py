import time
from datetime import datetime,timezone
from pathlib import Path
from django.core.management import call_command
from django.core.management.base import BaseCommand,CommandError
class Command(BaseCommand):
 help='Run scheduled verified backups. Supervise this process or use host cron.'
 def add_arguments(self,p):p.add_argument('--directory',required=True);p.add_argument('--interval',type=int,default=86400);p.add_argument('--keep',type=int,default=14);p.add_argument('--once',action='store_true')
 def handle(self,*a,**o):
  if o['interval']<60 or o['keep']<1:raise CommandError('Use an interval of at least 60 seconds and keep at least one backup.')
  folder=Path(o['directory']).expanduser().resolve();folder.mkdir(parents=True,exist_ok=True)
  try:
   while True:
    name='noriss-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')+'.backup';path=folder/name
    call_command('backup_shop',output=str(path),stdout=self.stdout)
    call_command('verify_backup',str(path),stdout=self.stdout)
    for old in sorted(folder.glob('noriss-*.backup'),reverse=True)[o['keep']:]:old.unlink();old.with_suffix(old.suffix+'.sha256').unlink(missing_ok=True)
    if o['once']:break
    time.sleep(o['interval'])
  except KeyboardInterrupt:self.stdout.write('Backup scheduler stopped.')
