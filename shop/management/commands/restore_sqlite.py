import sqlite3
from pathlib import Path
from django.core.management import call_command
from django.core.management.base import BaseCommand,CommandError
class Command(BaseCommand):
 help='Restore a verified SQLite backup into a NEW file, never over a live database.'
 def add_arguments(self,p):p.add_argument('backup');p.add_argument('--output',required=True)
 def handle(self,*a,**o):
  source=Path(o['backup']).resolve();dest=Path(o['output']).resolve()
  if dest.exists() or source==dest:raise CommandError('Choose a new output file. Existing databases are never overwritten.')
  call_command('verify_backup',str(source),stdout=self.stdout)
  if source.open('rb').read(16)!=b'SQLite format 3\x00':raise CommandError('This command restores SQLite only. Use pg_restore for PostgreSQL.')
  dest.parent.mkdir(parents=True,exist_ok=True)
  original=sqlite3.connect(f'file:{source.as_posix()}?mode=ro',uri=True);target=sqlite3.connect(str(dest))
  try:original.backup(target)
  finally:target.close();original.close()
  self.stdout.write(self.style.SUCCESS(f'Restored copy created at {dest}. Check it in staging before switching DATABASE_URL.'))
