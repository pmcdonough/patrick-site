#!/usr/bin/env python3
"""Embed the data files into the sim page so it also works as a single file opened from disk.

Usage:  python3 tools/build.py            (rewrites public/bruins-vs-canadiens/index.html in place)
        python3 tools/build.py --check    (exit 1 if the embedded copies are out of date)

The page fetches data/*.json when served over HTTP and falls back to the embedded
<script type="application/json" id="data-NAME"> blocks when opened from file://.
Run this after editing anything in data/ so both copies agree.
"""
import json, re, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
PAGE = ROOT / 'public' / 'bruins-vs-canadiens' / 'index.html'
DATA = ROOT / 'public' / 'bruins-vs-canadiens' / 'data'
NAMES = ['rosters', 'ratings', 'systems', 'physics', 'moneypuck-2025', 'defaults']

def main():
    check = '--check' in sys.argv
    html = PAGE.read_text(encoding='utf-8')
    stale = []
    for name in NAMES:
        obj = json.loads((DATA / f'{name}.json').read_text(encoding='utf-8'))
        pat = re.compile(r'(<script type="application/json" id="data-%s">)(.*?)(</script>)' % re.escape(name), re.S)
        m = pat.search(html)
        if not m:
            sys.exit(f'no embedded block for {name}')
        try:
            current = json.loads(m.group(2))
        except json.JSONDecodeError:
            current = None
        if current != obj:
            stale.append(name)
            html = html[:m.start(2)] + '\n' + json.dumps(obj, indent=1) + '\n' + html[m.end(2):]
    if check:
        print('stale embedded copies: ' + (', '.join(stale) if stale else 'none'))
        sys.exit(1 if stale else 0)
    PAGE.write_text(html, encoding='utf-8')
    ver = re.search(r"const VERSION = '([^']+)'", html)
    print(f'embedded {len(stale)} updated file(s); page version {ver.group(1) if ver else "?"}')

if __name__ == '__main__':
    main()
