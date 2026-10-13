"""Consistent database backup with SQLite online backup or PostgreSQL pg_dump."""
import hashlib,os,sqlite3,subprocess,tempfile
from pathlib import Path
from django.conf import settings
from django.core.management.base import BaseCommand,CommandError
class Command(BaseCommand):
 help='Create a database backup; schedule this command with your host scheduler.'
 def add_arguments(self,p):p.add_argument('--output',required=True)
 def handle(self,*a,**o):
  dest=Path(o['output']).expanduser().resolve()
  if dest.exists():raise CommandError('Output exists. Choose a new timestamped filename.')
  dest.parent.mkdir(parents=True,exist_ok=True);db=settings.DATABASES['default'];tmp=dest.with_suffix(dest.suffix+'.tmp')
  try:
   if db['ENGINE']=='django.db.backends.sqlite3':
    source=sqlite3.connect(str(db['NAME']));target=sqlite3.connect(str(tmp))
    try:source.backup(target)
    finally:target.close();source.close()
   elif db['ENGINE']=='django.db.backends.postgresql':
    env={**os.environ,'PGPASSWORD':db.get('PASSWORD','')}
    command=['pg_dump','--format=custom','--file',str(tmp),'--host',db.get('HOST') or 'localhost','--port',str(db.get('PORT') or 5432),'--username',db.get('USER') or '',db['NAME']]
    subprocess.run(command,env=env,check=True)
   else:raise CommandError('Unsupported database backend.')
   os.replace(tmp,dest)
   try:os.chmod(dest,0o600)
   except OSError:pass
   dest.with_suffix(dest.suffix+'.sha256').write_text(hashlib.file_digest(dest.open('rb'),'sha256').hexdigest()+'\n')
  except (OSError,subprocess.CalledProcessError) as e:
   tmp.unlink(missing_ok=True);raise CommandError('Backup failed. Check filesystem access and database backup tools.') from e
  self.stdout.write(self.style.SUCCESS(f'Backup created: {dest}'))
