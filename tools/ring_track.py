"""Ring Kart's lap from OpenStreetMap and a public elevation model: writes the points of data/track.json.

The Nordschleife is in OpenStreetMap as about fifty one-way raceway segments, each named for its corner (Hatzenbach,
Flugplatz, Fuchsroehre, ...). This chains them into the loop, cuts out the Touristenfahrten lap (from the T13 entry,
where the queue waits, round the whole Doettinger Hoehe and Antoniusbuche to the gantry before Tiergarten), resamples it every SPACING metres, looks up each
point's height in the EU-DEM 25 m model, names each point where a named segment starts, and carries over what a map
cannot give: the jumps (crests) and the Karussell's banking, by corner name.

Raw inputs go in raw/ring/ (git-ignored) and are reused when present:
  raw/ring/raceway.json   the Overpass API answer: every highway=raceway way round the Nuerburgring, with geometry
  raw/ring/elev.json      heights from api.opentopodata.org (eudem25m), keyed by "lat,lon"

  python3 tools/ring_track.py            # fetch what is missing, then write public/ring-kart/data/track.json
  python3 tools/ring_track.py --check    # rebuild from raw/ and fail if the committed file differs

Standard library only. The fetch identifies itself with a User-Agent (Overpass refuses requests without one) and
asks the elevation API for 100 points a second, inside its published limits.
"""
import json, math, os, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'raw', 'ring')
OUT = os.path.join(ROOT, 'public', 'ring-kart', 'data', 'track.json')
UA = 'patrick-site ring-kart track builder (pmcdonough.com)'
BBOX = (50.31, 6.92, 50.39, 7.02)
SPACING = 50            # metres between points along the lap
SMOOTH = 120            # sigma of the blur on the heights, metres (see smooth)
# Two stretches of road that pass close (the climb to the Karussell and the way out of it, about 30 m apart) must stay
# far enough apart at the game's scale for both roads and a barrier: the game's road is 13 m wide at a third of real
# size, so their centres must be SEPARATE real metres apart. Points closer than that, and more than CLOSE_PATH metres
# apart along the lap (so not the two sides of one hairpin), are pushed apart.
SEPARATE = 58
CLOSE_PATH = 180
LAT0 = 50.35            # the lap's middle latitude, for metres per degree of longitude
START_AT = 'T13'        # the lap starts where this segment starts (the Touristenfahrten entry, where the queue waits)
# and ends where this one starts. The real Touristenfahrten gantry is before Antoniusbuche, where the speed limits step
# down for the exit; the game runs on through Antoniusbuche to the braking zone for Tiergarten, because the whole of the
# Doettinger Hoehe flat out is the best part of the lap
END_AT = 'Tiergarten'

# What a map does not say, by corner: jumps as extra game height h over a bump len game metres long, at the highest
# point within `near` metres of where the corner's segment starts; banking in degrees over the whole segment (negative
# banks a left-hander).
CRESTS = {'Quiddelbacher Höhe': {'h': 2.2, 'len': 34}, 'Flugplatz': {'h': 3.2, 'len': 30},
          'Pflanzgarten': {'h': 4.6, 'len': 28}, 'Sprunghügel': {'h': 3.2, 'len': 26}}
BANK = {'Karussell': -24, 'Mini-Karussell': -14}
SKIP_NAMES = {'Nürburgring Nordschleife', 'T13', END_AT}


def get(url, data=None):
    req = urllib.request.Request(url, data=data, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.load(r)


def raceways():
    path = os.path.join(RAW, 'raceway.json')
    if not os.path.exists(path):
        q = '[out:json][timeout:90];way["highway"="raceway"](%s,%s,%s,%s);out tags geom;' % BBOX
        d = get('https://overpass-api.de/api/interpreter', urllib.parse.urlencode({'data': q}).encode())
        os.makedirs(RAW, exist_ok=True)
        json.dump(d, open(path, 'w'))
    return json.load(open(path))['elements']


def metres(a, b):
    return math.hypot((b[0] - a[0]) * 111320, (b[1] - a[1]) * 111320 * math.cos(math.radians(LAT0)))


def loop(ways):
    """The Nordschleife's points in driving order, from where START_AT starts, and the ids of the segments used."""
    ring = [w for w in ways if w.get('tags', {}).get('fee') == 'yes' or w.get('tags', {}).get('name') == START_AT]
    key = lambda g: (round(g['lat'], 7), round(g['lon'], 7))
    after = {}
    for w in ring:
        after.setdefault(key(w['geometry'][0]), []).append(w)
    w = next(x for x in ring if x['tags'].get('name') == START_AT)
    seen, pts = set(), []
    while w is not None and w['id'] not in seen:
        seen.add(w['id'])
        # each segment's first point is the previous one's last
        pts += [(g['lat'], g['lon']) for g in (w['geometry'] if not pts else w['geometry'][1:])]
        nxt = after.get(key(w['geometry'][-1]), [])
        w = nxt[0] if nxt else None
    if len(seen) < 40:
        sys.exit(f'only {len(seen)} segments chained; the map data has changed')
    return pts, seen


def starts(ways, order_ids):
    """Where each named segment starts, as (lat, lon) -> name."""
    out = {}
    for w in ways:
        if w['id'] in order_ids and w['tags'].get('name'):
            g = w['geometry'][0]
            out[(round(g['lat'], 7), round(g['lon'], 7))] = w['tags']['name']
    return out


def resample(pts, spacing):
    """Points every `spacing` metres along the polyline, each with the distance at which it lies."""
    cum = [0.0]
    for a, b in zip(pts, pts[1:]):
        cum.append(cum[-1] + metres(a, b))
    out, j, s = [], 0, 0.0
    total = cum[-1]
    n = max(2, round(total / spacing))
    for i in range(n + 1):
        s = total * i / n
        while j < len(pts) - 2 and cum[j + 1] < s:
            j += 1
        t = (s - cum[j]) / ((cum[j + 1] - cum[j]) or 1)
        out.append((pts[j][0] + (pts[j + 1][0] - pts[j][0]) * t, pts[j][1] + (pts[j + 1][1] - pts[j][1]) * t, s))
    return out, cum, total


def heights(locs):
    path = os.path.join(RAW, 'elev.json')
    cache = json.load(open(path)) if os.path.exists(path) else {}
    keyf = lambda p: '%.6f,%.6f' % (p[0], p[1])
    todo = [p for p in locs if keyf(p) not in cache]
    for i in range(0, len(todo), 100):
        batch = todo[i:i + 100]
        q = '|'.join('%.6f,%.6f' % (p[0], p[1]) for p in batch)
        d = get('https://api.opentopodata.org/v1/eudem25m?locations=' + q)
        for p, r in zip(batch, d['results']):
            cache[keyf(p)] = r['elevation']
        json.dump(cache, open(path, 'w'))
        time.sleep(1.1)
    return [cache[keyf(p)] for p in locs]


def smooth(v, sigma):
    """A Gaussian blur along the lap, sigma in points. The elevation model reads trees and small bumps as part of the
    road, and the game shrinks length three times more than height, which turns every bump into a jump; a road's
    gradient changes slowly, so blurring over a couple of hundred metres keeps the real climbs and drops and loses the
    noise."""
    r = int(3 * sigma) + 1
    w = [math.exp(-0.5 * (j / sigma) ** 2) for j in range(-r, r + 1)]
    out = []
    for i in range(len(v)):
        t = sw = 0.0
        for j in range(-r, r + 1):
            k = min(len(v) - 1, max(0, i + j))
            t += v[k] * w[j + r]; sw += w[j + r]
        out.append(t / sw)
    return out


def separate(pts):
    """Push apart points of the lap that pass too close to each other (see SEPARATE), a little at a time, each push
    eased along the road on either side so the line stays smooth. Returns how far the furthest point moved."""
    xy = [[(lon - pts[0][1]) * 111320 * math.cos(math.radians(LAT0)), (lat - pts[0][0]) * 111320] for lat, lon, s in pts]
    s = [p[2] for p in pts]
    moved = [0.0] * len(xy)
    for _ in range(60):
        push = [[0.0, 0.0] for _ in xy]; any_ = False
        for i in range(len(xy)):
            for j in range(i + 1, len(xy)):
                if s[j] - s[i] < CLOSE_PATH: continue
                dx, dy = xy[j][0] - xy[i][0], xy[j][1] - xy[i][1]; d = math.hypot(dx, dy)
                if d >= SEPARATE or d == 0: continue
                k = (SEPARATE - d) / d * 0.25; any_ = True
                push[i][0] -= dx * k; push[i][1] -= dy * k; push[j][0] += dx * k; push[j][1] += dy * k
        if not any_: break
        # ease each push onto the neighbours, so the road bends rather than kinks
        eased = [[0.0, 0.0] for _ in xy]
        for i in range(len(xy)):
            for o, w in ((-2, 0.25), (-1, 0.6), (0, 1.0), (1, 0.6), (2, 0.25)):
                j = i + o
                if 0 < j < len(xy) - 1: eased[j][0] += push[i][0] * w / 2.7 * 1.6; eased[j][1] += push[i][1] * w / 2.7 * 1.6
        for i in range(1, len(xy) - 1):
            xy[i][0] += eased[i][0]; xy[i][1] += eased[i][1]; moved[i] += math.hypot(*eased[i])
    out = [(pts[0][0] + y / 111320, pts[0][1] + x / (111320 * math.cos(math.radians(LAT0))), s0) for (x, y), s0 in zip(xy, s)]
    return out, max(moved)


def build():
    ways = raceways()
    pts, ids = loop(ways)
    names = starts(ways, ids)
    # cut the lap: from where START_AT begins to where END_AT begins
    first_end = next(i for i, p in enumerate(pts) if names.get((round(p[0], 7), round(p[1], 7))) == END_AT)
    lap = pts[:first_end + 1]
    # the distance at which each named segment starts along the lap
    cum = [0.0]
    for a, b in zip(lap, lap[1:]):
        cum.append(cum[-1] + metres(a, b))
    corner_at = []
    for i, p in enumerate(lap):
        n = names.get((round(p[0], 7), round(p[1], 7)))
        if n and n not in SKIP_NAMES and all(c[0] != n for c in corner_at):
            corner_at.append((n, cum[i]))
    samp, _, total = resample(lap, SPACING)
    els = smooth(heights([(p[0], p[1]) for p in samp]), SMOOTH / SPACING)
    # heights are looked up where the map puts the road; then the two close stretches are eased apart
    samp, moved = separate(samp)
    lat0, lon0 = samp[0][0], samp[0][1]
    P = []
    for (lat, lon, s), el in zip(samp, els):
        P.append({'p': [round((lon - lon0) * 111.32 * math.cos(math.radians(LAT0)), 4), round((lat - lat0) * 111.32, 4)], 'el': round(el, 1)})
    # names on the nearest point to where each corner begins; banking over the whole corner
    spans = corner_at + [('end', total)]
    for (n, s), (_, s2) in zip(spans, spans[1:]):
        i = min(range(len(samp)), key=lambda k: abs(samp[k][2] - s))
        if 'name' in P[i]:
            i = min(len(P) - 1, i + 1)
        P[i]['name'] = n
        if n in BANK:
            # one point beyond the segment either way, so the banking is full through the whole bend and eases off
            # after it rather than in it
            for k, q in enumerate(samp):
                if s - SPACING <= q[2] <= s2 + SPACING:
                    P[k]['bank'] = BANK[n]
        if n in CRESTS:
            near = [k for k, q in enumerate(samp) if abs(q[2] - s) <= 150]
            top = max(near, key=lambda k: els[k])
            P[top]['crest'] = dict(CRESTS[n])
    P[0]['name'] = 'Touristenfahrten'
    P[-1]['name'] = 'Gantry'
    return P, total, moved


def main():
    P, total, moved = build()
    T = json.load(open(OUT))
    T['about'] = ('The Nordschleife from the Touristenfahrten entry at T13, clockwise, to a gantry before Tiergarten: the real one '
                  'stands before Antoniusbuche, but the game keeps the whole straight. '
                  'Each point is [east, north] in kilometres from the entry, with its height in metres: the road from '
                  'OpenStreetMap\'s Nordschleife segments, resampled every %d m, and heights from the EU-DEM 25 m model, '
                  'written by tools/ring_track.py (do not edit the points by hand; change the script and rerun it). '
                  'Names mark where each corner\'s segment starts. The game draws a smooth curve through the points, '
                  'then shrinks it so a lap takes minutes, not seven. Crests are the jumps (extra height in game metres '
                  'and the length of the bump) and bank is degrees, negative for a left-hander\'s banking: those two are '
                  'the game\'s, not the map\'s.' % SPACING)
    T['build']['realLength']['value'] = round(total)
    T['build']['realLength']['desc'] = ('Bridge to the game\'s gantry along the OpenStreetMap line, metres (the official '
                                        'Nordschleife lap, with the T13 straight, is 20.832 km).')
    T['points'] = P
    T['build']['lengthScale']['value'] = 0.33
    T['build']['lengthScale']['desc'] = ("Game length per real metre. The lap is about 20.1 km, the T13 entry to the game's gantry; the game's is about a "
                                         "third of that, so a lap is about three minutes.")
    # one point per line, so the file stays readable and a rerun's diff stays small
    pts = T.pop('points')
    text = json.dumps(T, indent=1, ensure_ascii=False)[:-2] + ',\n "points": [\n' + ',\n'.join(
        '  ' + json.dumps(q, ensure_ascii=False, separators=(', ', ': ')) for q in pts) + '\n ]\n}'
    T['points'] = pts
    if '--check' in sys.argv:
        same = open(OUT, encoding='utf-8').read() == text + '\n'
        print('track.json matches its inputs' if same else 'track.json differs from what raw/ring/ gives')
        sys.exit(0 if same else 1)
    open(OUT, 'w', encoding='utf-8').write(text + '\n')
    print(f'{len(P)} points, {total:.0f} m bridge to gantry, {sum(1 for p in P if "name" in p)} names, '
          f'{sum(1 for p in P if "crest" in p)} crests, heights {min(p["el"] for p in P):.0f} to {max(p["el"] for p in P):.0f} m, '
          f'close stretches eased apart by up to {moved:.0f} m')


if __name__ == '__main__':
    main()
