"""Dependency-free release sanity checks. Does not replace Django/Expo tests."""
from pathlib import Path
import ast,json,sys
root=Path(__file__).resolve().parents[1]
files=list((root/'shop').rglob('*.py'))+list((root/'config').rglob('*.py'))
for file in files: ast.parse(file.read_text(encoding='utf-8'),filename=str(file))
for f in ('mobile/package.json','mobile/app.json','mobile/eas.json'):json.loads((root/f).read_text())
urls=(root/'config/urls.py').read_text()
for route in ('api/v1/auth/login/','api/v1/checkout/','api/v1/purchases/','api/v1/receipts/','sw.js'):
 assert route in urls,route
assert (root/'static/shop/sw.js').exists()
print('PASS: Python syntax, mobile JSON configuration, API routes and desktop service worker present')
