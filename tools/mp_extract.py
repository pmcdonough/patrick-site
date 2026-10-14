#!/usr/bin/env python3
"""Build data/moneypuck-2025.json from the MoneyPuck season downloads.

Usage: python3 tools/mp_extract.py <dir with skaters.csv goalies.csv teams.csv lines.csv> [--check]

The four files come from https://moneypuck.com/data.htm (season downloads, 2025-26 regular season) and
stay out of the repo. The script keeps only the two rosters' players (names from rosters.json) plus the
team and league benchmarks the reality check uses. --check compares the result with the committed file
and prints every field that differs instead of writing.

Rating recipe (all percentiles are among regular skaters, 300+ minutes, all situations):
  shoot = 0.25 + 0.45 * pct(xG/60) + 0.30 * clamp((finishing - 0.7) / 0.7, 0, 1)
          finishing = (goals + 8) / (xG + 8), shrunk toward 1 with 8 pseudo-xG
  pass  = 0.25 + 0.45 * pct(primary assists/60) + 0.30 * pct(on-ice xGF/60)
  def   = 0.25 + 0.40 * (1 - pct(relative on-ice xGA)) + 0.20 * pct(takeaways - giveaways /60) + 0.15 * pct(blocks/60)
          relative on-ice xGA = player's on-ice xGA/60 over his team's xGA/60
  faceoff = (won + 25) / (taken + 50)
  penaltiesPer60 = penalties per 60, shrunk toward the league skater rate with 2 hours of pseudo-ice time
  Players under 600 minutes are shrunk toward 0.5: rating = 0.5 + (toi/600) * (raw - 0.5).
  Percentile = share of regular skaters at or below the value. Players who took no draws get faceoff 0.45.
Goalie tier save percentages are shrunk toward the league tier rate (goals over shots faced, from goalies.csv)
with 150 pseudo-shots; freeze and rebound rates are per shot on goal.
"""
import csv, json, os, sys
from bisect import bisect_right

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '..', 'public', 'bruins-vs-canadiens', 'data')
OUT = os.path.join(DATA, 'moneypuck-2025.json')

def rows(path, situation='all'):
    with open(path, newline='') as f:
        return [r for r in csv.DictReader(f) if r.get('situation') == situation]

def f(r, k):
    return float(r[k]) if r.get(k) not in (None, '') else 0.0

def r3(x):
    return round(x + 0.0, 3)

def clamp(x, lo, hi):
    return max(lo, min(hi, x))

def main():
    src = sys.argv[1]
    check = '--check' in sys.argv
    skaters = rows(os.path.join(src, 'skaters.csv'))
    goalies = rows(os.path.join(src, 'goalies.csv'))
    teams = rows(os.path.join(src, 'teams.csv'))
    rosters = json.load(open(os.path.join(DATA, 'rosters.json')))
    old = json.load(open(OUT))

    # --- teams and league per game
    team_out = {}
    tot = {}; tg = 0
    keys = [('shotAttempts', 'shotAttemptsFor'), ('shotsOnGoal', 'shotsOnGoalFor'), ('goals', 'goalsFor'), ('xGoals', 'xGoalsFor'), ('blocked', 'blockedShotAttemptsFor'), ('missed', 'missedShotsFor'), ('highDangerShots', 'highDangerShotsFor'), ('mediumDangerShots', 'mediumDangerShotsFor'), ('lowDangerShots', 'lowDangerShotsFor'), ('penalties', 'penaltiesFor'), ('pim', 'penalityMinutesFor'), ('hits', 'hitsFor'), ('takeaways', 'takeawaysFor'), ('giveaways', 'giveawaysFor'), ('freezes', 'freezeFor'), ('rebounds', 'reboundsFor'), ('goalsAgainst', 'goalsAgainst'), ('xGoalsAgainst', 'xGoalsAgainst'), ('shotsOnGoalAgainst', 'shotsOnGoalAgainst')]
    tier_tot = {t: [0.0, 0.0, 0.0] for t in ('low', 'medium', 'high')}  # shots, goals, xg
    for t in teams:
        gp = f(t, 'games_played'); tg += gp
        for k, c in keys: tot[k] = tot.get(k, 0) + f(t, c)
        for tier in tier_tot:
            tier_tot[tier][0] += f(t, tier + 'DangerShotsFor'); tier_tot[tier][1] += f(t, tier + 'DangerGoalsFor'); tier_tot[tier][2] += f(t, tier + 'DangerxGoalsFor')
        if t['team'] in rosters['teams']:
            o = {k: r3(f(t, c) / gp) for k, c in keys}
            fo_w, fo_l = f(t, 'faceOffsWonFor'), f(t, 'faceOffsWonAgainst')
            o['faceoffWinPct'] = round(fo_w / (fo_w + fo_l), 2) if fo_w + fo_l else 0.5
            o['xGoalsPct'] = round(f(t, 'xGoalsPercentage'), 2); o['corsiPct'] = round(f(t, 'corsiPercentage'), 2)
            team_out[t['team']] = {k: o[k] for k in old['teams'][t['team']]} if t['team'] in old['teams'] else o
    per_game = {k: r3(tot[k] / tg) for k, _ in keys if k not in ('goalsAgainst', 'xGoalsAgainst', 'shotsOnGoalAgainst')}
    per_game['faceoffWinPct'] = 0.5
    tiers = {}
    for tier, (s, g, x) in tier_tot.items():
        tiers[tier] = {'goalRate': round(g / s, 4), 'xgPerShot': round(x / s, 4), 'unblockedShotsPerGame': round(s / tg, 2), 'leagueSvPct': round(1 - g / s, 4)}

    # --- skaters
    def toi_min(r): return f(r, 'icetime') / 60
    regular = [r for r in skaters if toi_min(r) >= 300]
    team_xga = {}
    for t in teams: team_xga[t['team']] = f(t, 'xGoalsAgainst') / (f(t, 'iceTime') / 3600)
    def per60(r, k): return f(r, k) * 60 / toi_min(r)
    def feats(r):
        return {'xg60': per60(r, 'I_F_xGoals'), 'pa60': per60(r, 'I_F_primaryAssists'), 'onxgf60': per60(r, 'OnIce_F_xGoals'),
                'relxga': per60(r, 'OnIce_A_xGoals') / team_xga[r['team']], 'netto': per60(r, 'I_F_takeaways') - per60(r, 'I_F_giveaways'), 'blk60': per60(r, 'shotsBlockedByPlayer')}
    dist = {k: sorted(feats(r)[k] for r in regular) for k in feats(regular[0])}
    n = len(regular)
    def pct(k, v): return bisect_right(dist[k], v) / n  # share of regular skaters at or below
    league_pen = sum(f(r, 'penalties') for r in regular) / sum(toi_min(r) / 60 for r in regular)  # pooled per 60
    by_name = {}
    for r in skaters: by_name.setdefault(r['name'], r)
    sk_out = {}
    for abbr, team in rosters['teams'].items():
        for pid, p in team['players'].items():
            o = old['skaters'].get(pid)
            if o is None or o.get('mpName') is None:
                if o is not None: sk_out[pid] = o
                continue
            r = by_name.get(o['mpName'])
            if r is None: sk_out[pid] = o; continue
            toi = toi_min(r); ft = feats(r)
            goals, xg = f(r, 'I_F_goals'), f(r, 'I_F_xGoals')
            fin = (goals + 8) / (xg + 8)
            P = {k: pct(k, ft[k]) for k in ft}
            w = min(1.0, toi / 600)
            raw = {'shoot': 0.25 + 0.45 * P['xg60'] + 0.30 * clamp((fin - 0.7) / 0.7, 0, 1),
                   'pass': 0.25 + 0.45 * P['pa60'] + 0.30 * P['onxgf60'],
                   'def': 0.25 + 0.40 * (1 - P['relxga']) + 0.20 * P['netto'] + 0.15 * P['blk60']}
            rat = {k: r3(clamp(0.5 + w * (v - 0.5), 0.3, 0.97)) for k, v in raw.items()}
            fw, fl = f(r, 'faceoffsWon'), f(r, 'faceoffsLost')
            rat['faceoff'] = r3((fw + 25) / (fw + fl + 50)) if fw + fl else 0.45
            hours = toi / 60
            rat['penaltiesPer60'] = r3((f(r, 'penalties') + 2 * league_pen) / (hours + 2))
            sk_out[pid] = {'mpName': r['name'], 'mpTeam': r['team'], 'mpPos': r['position'], 'gp': int(f(r, 'games_played')), 'toiMin': round(toi, 1),
                           'per60': {k: r3(per60(r, c)) for k, c in [('xg', 'I_F_xGoals'), ('goals', 'I_F_goals'), ('shotAttempts', 'I_F_shotAttempts'), ('highDangerShots', 'I_F_highDangerShots'), ('primaryAssists', 'I_F_primaryAssists'), ('onIceXgFor', 'OnIce_F_xGoals'), ('onIceXgAgainst', 'OnIce_A_xGoals'), ('takeaways', 'I_F_takeaways'), ('giveaways', 'I_F_giveaways'), ('shotsBlocked', 'shotsBlockedByPlayer'), ('penalties', 'penalties'), ('hits', 'I_F_hits'), ('penaltiesDrawn', 'penaltiesDrawn')]},
                           'finishing': r3(fin), 'relativeXgAgainst': r3(ft['relxga']), 'percentiles': {k: r3(v) for k, v in P.items()}, 'sampleWeight': round(w, 2), 'ratings': rat,
                           'onIceXgPct': round(f(r, 'onIce_xGoalsPercentage'), 2), 'gameScore': round(f(r, 'gameScore'), 2)}

    # --- goalies. League tier save percentage is what goalies faced (goalies.csv), which excludes empty-net goals.
    for tier in tiers:
        s = sum(f(r, tier + 'DangerShots') for r in goalies); g = sum(f(r, tier + 'DangerGoals') for r in goalies)
        tiers[tier]['leagueSvPct'] = round(1 - g / s, 4)
    g_by = {}
    for r in goalies: g_by.setdefault(r['name'], r)
    g_out = {}
    for pid, o in old['goalies'].items():
        r = g_by.get(o.get('mpName'))
        if r is None: g_out[pid] = o; continue
        t = {}
        for tier in ('low', 'medium', 'high'):
            s, g = f(r, tier + 'DangerShots'), f(r, tier + 'DangerGoals')
            lg = tiers[tier]['leagueSvPct']
            t[tier] = {'shots': int(s), 'goals': int(g), 'svPct': r3(1 - g / s) if s else None, 'svPctShrunk': r3(((s - g) + 150 * lg) / (s + 150))}
        unb = f(r, 'ongoal')
        g_out[pid] = {'mpName': r['name'], 'gp': int(f(r, 'games_played')), 'toiMin': round(f(r, 'icetime') / 60, 1), 'tiers': t,
                      'freezeRate': r3(f(r, 'freeze') / unb) if unb else 0, 'reboundRate': r3(f(r, 'rebounds') / unb) if unb else 0, 'goalsSavedAboveExpected': round(f(r, 'xGoals') - f(r, 'goals'), 2)}

    out = {'schema': old['schema'], 'source': old['source'],
           'league': {'perGame': per_game, 'dangerTiers': tiers, 'regularSkaters': n, 'penaltiesPer60Skater': r3(league_pen)},
           'teams': team_out, 'skaters': sk_out, 'goalies': g_out}

    if check:
        diffs = []
        def walk(a, b, path):
            if isinstance(a, dict) and isinstance(b, dict):
                for k in set(a) | set(b): walk(a.get(k), b.get(k), path + '.' + k)
            elif a != b:
                if isinstance(a, float) and isinstance(b, float) and abs(a - b) <= 0.0015: return
                diffs.append((path, a, b))
        walk(old, out, '')
        for d in sorted(diffs): print(d)
        print(len(diffs), 'fields differ from the committed file')
    else:
        json.dump(out, open(OUT, 'w'), indent=2); open(OUT, 'a').write('\n'); print('wrote', OUT)

if __name__ == '__main__':
    main()
