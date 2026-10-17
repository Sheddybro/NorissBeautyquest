"""Read-only API health probe. Usage: python release_checks/check_http.py https://YOUR-STAGING-HOST"""
import sys,urllib.request,urllib.error,json
if len(sys.argv)!=2 or not sys.argv[1].startswith('https://'):
 raise SystemExit('Usage: python release_checks/check_http.py https://YOUR-STAGING-HOST')
base=sys.argv[1].rstrip('/')
for path in ('/health/','/api/v1/me/','/api/v1/products/'):
 try:
  with urllib.request.urlopen(base+path,timeout=12) as response: code=response.status
 except urllib.error.HTTPError as e:code=e.code
 print(path,code)
 if path.startswith('/api/') and code!=401:raise SystemExit('FAIL: unauthenticated API should return HTTP 401')
 if path=='/health/' and code!=200:raise SystemExit('FAIL: health endpoint not OK')
print('PASS: public health and protected API behavior')
