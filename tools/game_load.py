#!/usr/bin/env python3
"""Turn an NHL play-by-play file and its shift chart into the compact game file the play-review page reads.

Usage:
    python3 tools/game_load.py play-by-play.json shiftcharts.json

Inputs (saved from the public NHL API, no key needed):
    https://api-web.nhle.com/v1/gamecenter/{gameId}/play-by-play
    https://api.nhle.com/stats/rest/en/shiftcharts?cayenneExp=gameId={gameId}

Output: public/play-review/data/game-{gameId}.json with
    meta        game id, date, venue, teams, final score
    players     every dressed player: id, name, number, position, team
    shots       every shot attempt (shot on goal, miss, goal, block) in order, with
                period, clock, strength, shooter, shot type, result, coordinates in the
                NHL frame (x -100..100, y -42.5..42.5) and in the attacking frame
                (feet from the goal line the shooter is attacking, feet off the midline),
                the event before it, and the skaters on the ice for both teams
    goals       the game's goals

Attacking frame: `homeTeamDefendingSide` on each play says which end the home team
defends, so the shooting team's attacking goal line is at x = +89 or -89. The review
page draws every shot as if the shooter attacks to the right.
"""
import json, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUTDIR = ROOT / 'public' / 'play-review' / 'data'
SHOT_TYPES = {'shot-on-goal': 'shot', 'missed-shot': 'miss', 'goal': 'goal', 'blocked-shot': 'block'}

def sec(t):
    m, s = t.split(':'); return int(m) * 60 + int(s)

def main(pbp_path, shifts_path):
    pbp = json.load(open(pbp_path, encoding='utf-8'))
    shifts = json.load(open(shifts_path, encoding='utf-8'))['data']
    gid = pbp['id']
    home, away = pbp['homeTeam'], pbp['awayTeam']
    teams = {home['id']: {'abbr': home['abbrev'], 'side': 'home'}, away['id']: {'abbr': away['abbrev'], 'side': 'away'}}
    players = {}
    for r in pbp['rosterSpots']:
        players[r['playerId']] = {'id': r['playerId'], 'name': f"{r['firstName']['default']} {r['lastName']['default']}", 'number': r['sweaterNumber'], 'pos': r['positionCode'], 'team': teams[r['teamId']]['abbr']}

    # shifts by period: (start, end, playerId, team)
    by_period = {}
    for s in shifts:
        if s.get('typeCode') != 517 or not s.get('startTime') or not s.get('endTime'): continue
        by_period.setdefault(s['period'], []).append((sec(s['startTime']), sec(s['endTime']), s['playerId'], s['teamAbbrev']))

    def on_ice(period, t, abbr):
        out = [pid for (a, b, pid, tm) in by_period.get(period, []) if tm == abbr and a <= t < b]
        return [pid for pid in out if pid in players and players[pid]['pos'] != 'G']

    plays = sorted(pbp['plays'], key=lambda e: e['sortOrder'])
    shots, goals, prev = [], [], None
    for e in plays:
        d = e.get('details', {})
        kind = SHOT_TYPES.get(e['typeDescKey'])
        if kind and 'xCoord' in d:
            period = e['periodDescriptor']['number']; t = sec(e['timeInPeriod'])
            team_id = d.get('eventOwnerTeamId'); abbr = teams[team_id]['abbr']; opp = [v['abbr'] for k, v in teams.items() if k != team_id][0]
            # which way is the shooting team attacking: the home team defends `homeTeamDefendingSide`
            home_def = e.get('homeTeamDefendingSide', 'left')
            attack_right = (teams[team_id]['side'] == 'home') == (home_def == 'left')
            gx = 89 if attack_right else -89
            x, y = d['xCoord'], d['yCoord']
            dist_goal_line = abs(gx - x); off = y if attack_right else -y
            code = e.get('situationCode', '1551')   # away goalie, away skaters, home skaters, home goalie
            away_sk, home_sk = int(code[1]), int(code[2])
            own_sk, opp_sk = (home_sk, away_sk) if teams[team_id]['side'] == 'home' else (away_sk, home_sk)
            shooter = d.get('shootingPlayerId') or d.get('scoringPlayerId')
            rec = {
                'i': len(shots), 'period': period, 'clock': e['timeInPeriod'], 'sec': t, 'team': abbr, 'opp': opp,
                'result': kind, 'shooter': shooter, 'shotType': d.get('shotType'), 'zone': d.get('zoneCode'),
                'nhl': {'x': x, 'y': y}, 'attack': {'fromGoalLine': dist_goal_line, 'offMidline': off, 'attackRight': attack_right},
                'strength': {'own': own_sk, 'opp': opp_sk, 'pp': own_sk > opp_sk, 'sh': own_sk < opp_sk},
                'goalie': d.get('goalieInNetId'), 'blocker': d.get('blockingPlayerId'),
                'onIce': {abbr: on_ice(period, t, abbr), opp: on_ice(period, t, opp)},
            }
            if prev is not None and prev['periodDescriptor']['number'] == period:
                pd = prev.get('details', {})
                rec['prev'] = {'type': prev['typeDescKey'], 'team': teams.get(pd.get('eventOwnerTeamId'), {}).get('abbr'), 'secBefore': t - sec(prev['timeInPeriod']),
                               'x': pd.get('xCoord'), 'y': pd.get('yCoord')}
            if kind == 'goal':
                rec['assists'] = [a for a in (d.get('assist1PlayerId'), d.get('assist2PlayerId')) if a]
                goals.append({'period': period, 'clock': e['timeInPeriod'], 'team': abbr, 'scorer': shooter, 'assists': rec['assists'], 'score': f"{d.get('awayScore')}-{d.get('homeScore')}"})
            shots.append(rec)
        if e['typeDescKey'] not in ('stoppage', 'period-start', 'period-end', 'game-end'):
            prev = e

    out = {
        'schema': 'rink-sim-game/1',
        'meta': {'gameId': gid, 'date': pbp['gameDate'], 'venue': pbp['venue']['default'], 'home': home['abbrev'], 'away': away['abbrev'],
                 'score': {home['abbrev']: home.get('score'), away['abbrev']: away.get('score')},
                 'sources': [{'title': 'NHL play-by-play', 'url': f'https://api-web.nhle.com/v1/gamecenter/{gid}/play-by-play'},
                             {'title': 'NHL shift chart', 'url': f'https://api.nhle.com/stats/rest/en/shiftcharts?cayenneExp=gameId={gid}'}]},
        'players': players, 'shots': shots, 'goals': goals,
    }
    OUTDIR.mkdir(parents=True, exist_ok=True)
    path = OUTDIR / f'game-{gid}.json'
    path.write_text(json.dumps(out, separators=(',', ':')), encoding='utf-8')
    kinds = {}
    for s in shots: kinds[s['result']] = kinds.get(s['result'], 0) + 1
    print(f"wrote {path} ({path.stat().st_size // 1024} KB): {len(shots)} attempts {kinds}, {len(goals)} goals, {len(players)} players")

if __name__ == '__main__':
    main(*sys.argv[1:3])
