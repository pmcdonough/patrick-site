"""Ring Kart's circuits from OpenStreetMap and a public elevation model: writes data/<id>.json for a closed circuit.

A circuit is mapped as a handful of one-way raceway segments that join up into a loop. This chains them, starts the
loop at the start/finish line (some distance before a named segment, since maps rarely mark the line), resamples it
every SPACING metres, looks up each point's height, blurs the heights a little, names each point where a named
segment starts, and writes the points with the build settings the game needs to lay the circuit out lap after lap
(see buildTrack in src/track.js: preN points of the lap's end before the line for the grid, postN after the finish).
The Nordschleife, which is not a closed circuit in the game, has its own script, tools/ring_track.py.

Raw inputs go in raw/ring/ (git-ignored) and are reused when present:
  raw/ring/<id>-raceway.json   the Overpass API answer: every highway=raceway way in the circuit's box
  raw/ring/<id>-elev.json      heights from api.opentopodata.org, keyed by "lat,lon"

  python3 tools/circuit_track.py laguna            # fetch what is missing, then write public/ring-kart/data/laguna.json
  python3 tools/circuit_track.py laguna --check    # rebuild from raw/ and fail if the committed file differs

Standard library only, like ring_track.py.
"""
import json, math, os, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'raw', 'ring')
UA = 'patrick-site ring-kart track builder (pmcdonough.com)'

CIRCUITS = {
    'laguna': {
        'name': 'Laguna Seca',
        'about': 'WeatherTech Raceway Laguna Seca, Monterey, California: 3.6 km, eleven corners, the Corkscrew.',
        'bbox': (36.576, -121.764, 36.594, -121.742),
        'lat0': 36.585,
        # the raceway's own segments, not the pit lane
        'keep': lambda t: t.get('name') != 'Pit Lane' and t.get('raceway') != 'pitlane',
        'dataset': 'ned10m',             # USGS 10 m elevation model
        'spacing': 25,                   # metres between points
        'smooth': 40,                    # sigma of the height blur, metres
        # the start/finish line is on the front straight, this far before the Andretti Hairpin's segment starts
        'start': ('Andretti Hairpin', 520),
        'names': {'WeatherTech Raceway Laguna Seca': None},   # the circuit's own name on plain segments: not a corner
        'look': {'theme': 'dry', 'finish': 'Start · Finish', 'words': ['CORKSCREW', 'FLAT OUT', 'TURN 11', 'GO GO GO', 'LATE APEX', 'MONTEREY', 'SEND IT', 'BRAKE!', 'LAGUNA']},
        'build': {'lengthScale': 0.6, 'heightScale': 0.75, 'laps': 3, 'grid': 200, 'runoff': 160},
        'lengthDesc': 'Game length per real metre: a 3.6 km lap at 0.6 is about 2.2 km, so three laps make a race of about four minutes.',
    },
}


def get(url, data=None):
    req = urllib.request.Request(url, data=data, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.load(r)


def raceways(cid, C):
    path = os.path.join(RAW, f'{cid}-raceway.json')
    if not os.path.exists(path):
        q = '[out:json][timeout:90];way["highway"="raceway"](%s,%s,%s,%s);out tags geom;' % C['bbox']
        d = get('https://overpass-api.de/api/interpreter', urllib.parse.urlencode({'data': q}).encode())
        os.makedirs(RAW, exist_ok=True)
        json.dump(d, open(path, 'w'))
    return [w for w in json.load(open(path))['elements'] if C['keep'](w.get('tags', {}))]


def loop(ways, C):
    """The circuit as one closed list of (lat, lon, name of the segment starting here or None)."""
    key = lambda g: (round(g['lat'], 7), round(g['lon'], 7))
    after = {key(w['geometry'][0]): w for w in ways}
    w0 = ways[0]; w = w0; pts = []; seen = set()
    while w['id'] not in seen:
        seen.add(w['id'])
        name = w['tags'].get('name')
        name = C['names'].get(name, name)
        for i, g in enumerate(w['geometry'][:-1]):
            pts.append((g['lat'], g['lon'], name if i == 0 else None))
        w = after.get(key(w['geometry'][-1]))
        if w is None: sys.exit('the segments do not close into a loop')
    if w is not w0 or len(seen) != len(ways): sys.exit(f'chained {len(seen)} of {len(ways)} segments')
    return pts


def metres(a, b, lat0):
    return math.hypot((b[0] - a[0]) * 111320, (b[1] - a[1]) * 111320 * math.cos(math.radians(lat0)))


def resample_loop(pts, spacing, lat0):
    """Points every `spacing` metres round the closed loop, each with its distance from the first."""
    ring = pts + [pts[0]]
    cum = [0.0]
    for a, b in zip(ring, ring[1:]): cum.append(cum[-1] + metres(a, b, lat0))
    total = cum[-1]; n = round(total / spacing); out = []; j = 0
    for i in range(n):
        s = total * i / n
        while cum[j + 1] < s: j += 1
        t = (s - cum[j]) / ((cum[j + 1] - cum[j]) or 1)
        out.append((ring[j][0] + (ring[j + 1][0] - ring[j][0]) * t, ring[j][1] + (ring[j + 1][1] - ring[j][1]) * t, s))
    return out, cum, total


def heights(cid, C, locs):
    path = os.path.join(RAW, f'{cid}-elev.json')
    cache = json.load(open(path)) if os.path.exists(path) else {}
    keyf = lambda p: '%.6f,%.6f' % (p[0], p[1])
    todo = [p for p in locs if keyf(p) not in cache]
    for i in range(0, len(todo), 100):
        batch = todo[i:i + 100]
        d = get(f"https://api.opentopodata.org/v1/{C['dataset']}?locations=" + '|'.join('%.6f,%.6f' % (p[0], p[1]) for p in batch))
        for p, r in zip(batch, d['results']): cache[keyf(p)] = r['elevation']
        json.dump(cache, open(path, 'w')); time.sleep(1.1)
    return [cache[keyf(p)] for p in locs]


def smooth_loop(v, sigma):
    r = int(3 * sigma) + 1; w = [math.exp(-0.5 * (j / sigma) ** 2) for j in range(-r, r + 1)]; n = len(v)
    return [sum(v[(i + j) % n] * w[j + r] for j in range(-r, r + 1)) / sum(w) for i in range(n)]


def build(cid):
    C = CIRCUITS[cid]; lat0 = C['lat0']
    pts = loop(raceways(cid, C), C)
    # start the loop at the start/finish line
    ring = pts + [pts[0]]; cum = [0.0]
    for a, b in zip(ring, ring[1:]): cum.append(cum[-1] + metres(a, b, lat0))
    total = cum[-1]
    seg, before = C['start']
    at = cum[next(i for i, p in enumerate(pts) if p[2] == seg)] - before
    # the point nearest the line becomes the first, with the line exactly on it
    i0 = min(range(len(pts)), key=lambda i: abs(((cum[i] - at) + total / 2) % total - total / 2))
    pts = pts[i0:] + pts[:i0]
    samp, _, total = resample_loop(pts, C['spacing'], lat0)
    # where each named segment starts, as a distance round the loop
    cum2 = [0.0]
    for a, b in zip(pts + [pts[0]], (pts + [pts[0]])[1:]): cum2.append(cum2[-1] + metres(a, b, lat0))
    named = [(p[2], cum2[i]) for i, p in enumerate(pts) if p[2]]
    els = smooth_loop(heights(cid, C, [(p[0], p[1]) for p in samp]), C['smooth'] / C['spacing'])
    la, lo = samp[0][0], samp[0][1]
    P = [{'p': [round((q[1] - lo) * 111.32 * math.cos(math.radians(lat0)), 4), round((q[0] - la) * 111.32, 4)], 'el': round(e, 1)} for q, e in zip(samp, els)]
    P[0]['name'] = 'Start'
    for n, s in named:
        i = min(range(len(samp)), key=lambda k: abs(samp[k][2] - s))
        if 'name' not in P[i]: P[i]['name'] = n
    return P, total, C


def main():
    cid = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('-') else 'laguna'
    P, total, C = build(cid)
    b = C['build']; sp = C['spacing']
    T = {
        'about': (f"{C['about']} Each point is [east, north] in kilometres from the start/finish line, with its height in metres: "
                  f"the circuit from OpenStreetMap's raceway segments, resampled every {sp} m, heights from Open Topo Data's "
                  f"{C['dataset']} and blurred over about {C['smooth']} m, written by tools/circuit_track.py (do not edit the points by "
                  f"hand; change the script and rerun it). The points close into a loop; the game lays the loop out lap after lap."),
        'name': C['name'],
        'look': C['look'],
        'build': {
            'format': {'value': 'circuit', 'desc': 'A closed circuit, raced for laps from a grid.'},
            'laps': {'value': b['laps'], 'desc': 'Laps in a race.'},
            'preN': {'value': math.ceil(b['grid'] / b['lengthScale'] / sp), 'desc': "Points of the lap's end laid out before the start line, for the grid."},
            'postN': {'value': math.ceil(b['runoff'] / b['lengthScale'] / sp), 'desc': 'Points of run-off past the finish line.'},
            'realLength': {'value': round(total), 'desc': 'One lap along the OpenStreetMap line, metres.'},
            'lengthScale': {'value': b['lengthScale'], 'desc': C['lengthDesc']},
            'heightScale': {'value': b['heightScale'], 'desc': 'Game height per real metre of climb, a little more than the length scale so the hills stay dramatic.'},
            'sample': {'value': 2, 'desc': 'Distance between road samples, game metres.'},
            'width': {'value': 13, 'desc': 'Road width, game metres.'},
            'verge': {'value': 4, 'desc': 'Grass between the road edge and the barrier, game metres.'},
            'gateAt': {'value': 0, 'desc': 'Unused on a circuit: the grid stands before the start line.'},
        },
        'points': P,
    }
    pts = T.pop('points')
    text = json.dumps(T, indent=1, ensure_ascii=False)[:-2] + ',\n "points": [\n' + ',\n'.join('  ' + json.dumps(q, ensure_ascii=False, separators=(', ', ': ')) for q in pts) + '\n ]\n}'
    out = os.path.join(ROOT, 'public', 'ring-kart', 'data', f'{cid}.json')
    if '--check' in sys.argv:
        same = os.path.exists(out) and open(out, encoding='utf-8').read() == text + '\n'
        print(f'{cid}.json matches its inputs' if same else f'{cid}.json differs from what raw/ring/ gives'); sys.exit(0 if same else 1)
    open(out, 'w', encoding='utf-8').write(text + '\n')
    print(f"{C['name']}: {len(pts)} points, a {total:.0f} m lap, {sum(1 for p in pts if 'name' in p)} names, heights {min(p['el'] for p in pts):.0f} to {max(p['el'] for p in pts):.0f} m")


if __name__ == '__main__':
    main()
