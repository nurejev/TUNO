#!/usr/bin/env python3
"""Check the nginx response contract against a running self-hosted TUNO.

ENCA's tools/check-headers.py, ported in beta 10693 and widened: the four
security headers on every path (a 404 included), no-store on the four files
whose content can change under an unchanged ?v=, and the entrypoint gone
from the web root. Run by .github/workflows/docker.yml against the image it
just built:  python3 selfhost/check-headers.py http://127.0.0.1:8080
"""
import sys, time, urllib.request, urllib.error
base = sys.argv[1].rstrip('/')
expected = {'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'SAMEORIGIN',
            'Referrer-Policy': 'no-referrer', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'}
no_store = ['/', '/index.html', '/selfhost-branding.json', '/js/selfhost-boot.js', '/js/authConfig.js']
cached = ['/js/app.js', '/css/app.css', '/does-not-exist']
# The image runs on 127.0.0.1; a proxy in the environment must not sit in between.
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
for attempt in range(20):
    try:
        opener.open(base, timeout=2).close()
        break
    except (OSError, urllib.error.URLError):
        if attempt == 19: raise
        time.sleep(.25)
def fetch(path):
    try: return opener.open(base + path, timeout=5)
    except urllib.error.HTTPError as error: return error
for path in no_store + cached:
    with fetch(path) as response:
        for key, value in expected.items():
            actual = response.headers.get(key)
            assert actual == value, f'{path}: {key} expected {value!r}, got {actual!r}'
        cc = response.headers.get('Cache-Control')
        if path in no_store:
            assert cc == 'no-store', f'{path}: Cache-Control expected no-store, got {cc!r}'
        else:
            assert cc is None, f'{path}: Cache-Control expected none (cache-busted by ?v=), got {cc!r}'
    print(f'Headers OK: {path}')
with fetch('/selfhost/docker-entrypoint.sh') as response:
    assert response.status == 404, f'the entrypoint is served from the web root ({response.status}) - the Dockerfile must remove it'
print('Entrypoint not served: OK')
with fetch('/js/authConfig.js') as response:
    assert response.status == 200, 'js/authConfig.js must be served'
print('All checks passed.')
