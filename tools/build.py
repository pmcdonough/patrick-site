#!/usr/bin/env python3
"""Embed the data files into the sim page so it also works as a single file opened from disk.

Usage:  python3 tools/build.py            (rewrites the sim page and the play-review page in place)
        python3 tools/build.py --check    (exit 1 if the embedded copies are out of date)

The page fetches data/*.json when served over HTTP and falls back to the embedded
<script type="application/json" id="data-NAME"> blocks when opened from file://.
The play-review page embeds xg-model, systems and its game file the same way.
Run this after editing anything in data/ so both copies agree.
"""
import json, re, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
PAGE = ROOT / 'public' / 'bruins-vs-canadiens' / 'index.html'
DATA = ROOT / 'public' / 'bruins-vs-canadiens' / 'data'
NAMES = ['rosters', 'ratings', 'systems', 'physics', 'moneypuck-2025', 'defaults']

REVIEW = ROOT / 'public' / 'play-review' / 'index.html'
REVIEW_DATA = {'xg-model': DATA / 'xg-model.json', 'systems': DATA / 'systems.json', 'game': ROOT / 'public' / 'play-review' / 'data' / 'game-2025020812.json'}

def embed(page, sources, check):
    """sources: {block name: json path}. Returns (html, stale names)."""
    html = page.read_text(encoding='utf-8'); stale = []
    for name, path in sources.items():
        obj = json.loads(path.read_text(encoding='utf-8'))
        pat = re.compile(r'(<script type="application/json" id="data-%s">)(.*?)(</script>)' % re.escape(name), re.S)
        m = pat.search(html)
        if not m:
            sys.exit(f'no embedded block for {name} in {page.name}')
        try:
            current = json.loads(m.group(2))
        except json.JSONDecodeError:
            current = None
        if current != obj:
            stale.append(name)
            html = html[:m.start(2)] + '\n' + json.dumps(obj, indent=1) + '\n' + html[m.end(2):]
    if not check and stale:
        page.write_text(html, encoding='utf-8')
    return html, stale

def main():
    check = '--check' in sys.argv
    html, stale = embed(PAGE, {n: DATA / f'{n}.json' for n in NAMES}, check)
    html2, stale2 = embed(REVIEW, REVIEW_DATA, check)
    if check:
        print('stale embedded copies: sim ' + (', '.join(stale) if stale else 'none') + '; play review ' + (', '.join(stale2) if stale2 else 'none'))
        sys.exit(1 if (stale or stale2) else 0)
    ver = re.search(r"const VERSION = '([^']+)'", html)
    print(f'sim: embedded {len(stale)} updated file(s), page version {ver.group(1) if ver else "?"}; play review: {len(stale2)} updated')

if __name__ == '__main__':
    main()
