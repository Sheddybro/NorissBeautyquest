"""Optional integration tests. Uses a disposable database; never a real shop."""
import os,subprocess,sys,tempfile,time,urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
with tempfile.TemporaryDirectory(prefix='noriss-qa-') as directory:
 database=Path(directory)/'qa.sqlite3'
 env={**os.environ,'DJANGO_DEBUG':'true','DJANGO_ALLOWED_HOSTS':'localhost,127.0.0.1,testserver','DATABASE_URL':f'sqlite:///{database.as_posix()}'}
 def run(args,**kwargs):return subprocess.run(args,cwd=ROOT,env=env,check=True,**kwargs)
 run([sys.executable,'manage.py','migrate','--noinput'],stdout=subprocess.DEVNULL)
 fixture="from django.contrib.auth import get_user_model;from shop.models import Store,Membership;u=get_user_model().objects.create_user('qaowner',password='Testing-only-strong-pass!');s=Store.objects.create();Membership.objects.create(user=u,store=s,role='owner')"
 run([sys.executable,'manage.py','shell','-c',fixture],stdout=subprocess.DEVNULL)
 port=os.getenv('NORISS_TEST_PORT','8766');origin=f'http://127.0.0.1:{port}'
 server=subprocess.Popen([sys.executable,'manage.py','runserver',f'127.0.0.1:{port}','--noreload'],cwd=ROOT,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 try:
  for _ in range(100):
   try:urllib.request.urlopen(origin+'/health/',timeout=.3);break
   except Exception:time.sleep(.1)
  else:raise RuntimeError('Test server did not start.')
  subprocess.run(['node','tests/dom.test.mjs'],cwd=ROOT,env={**env,'QA_ORIGIN':origin},check=True)
 finally:server.terminate();server.wait(timeout=10)
