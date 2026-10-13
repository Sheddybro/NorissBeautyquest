import hashlib,sqlite3
from pathlib import Path
from django.core.management.base import BaseCommand,CommandError
class Command(BaseCommand):
 help='Verify checksum and SQLite integrity, without altering the live database.'
 def add_arguments(self,p):p.add_argument('path')
 def handle(self,*a,**o):
  path=Path(o['path']).resolve()
  try:
   expected=path.with_suffix(path.suffix+'.sha256').read_text().strip()
   if hashlib.file_digest(path.open('rb'),'sha256').hexdigest()!=expected:raise CommandError('Checksum mismatch.')
   if path.open('rb').read(16)==b'SQLite format 3\x00':
    conn=sqlite3.connect(f'file:{path.as_posix()}?mode=ro',uri=True)
    try:
     if conn.execute('PRAGMA integrity_check').fetchone()[0]!='ok':raise CommandError('SQLite integrity check failed.')
     count=conn.execute('SELECT COUNT(*) FROM shop_operation').fetchone()[0]
    finally:conn.close()
    self.stdout.write(self.style.SUCCESS(f'Checksum and SQLite integrity verified; {count} operations.'))
   else:self.stdout.write(self.style.SUCCESS('Checksum verified. Restore PostgreSQL into a disposable database and run Django checks before relying on this backup.'))
  except OSError as e:raise CommandError('Cannot read backup or checksum file.') from e
