#!/usr/bin/env python3
"""Fit the expected-goal (xG) model from MoneyPuck shot files and write data/xg-model.json.

Usage:
    python3 tools/xg_fit.py path/to/shots_2024.csv path/to/shots_2025.csv

Input: MoneyPuck single-season shot files (moneypuck.com/data.htm), one row per unblocked
shot (saved, missed or goal) with arena-adjusted coordinates and context. Free for
non-commercial use with credit to MoneyPuck.com.

What the model is: a logistic regression of goal / no goal on the shot's geometry and
context. It is deliberately small so the same formula can be evaluated in the browser
by the engine and the play-review page. Features:

    dist          distance from the net center, feet (arenaAdjustedShotDistance)
    angle         absolute angle from the net's midline, degrees (shotAngleAdjusted)
    log(dist+1), dist^2/100, angle^2/100, dist*angle/100   curvature terms
    type_*        shot type, one flag each; WRIST is the baseline
    rebound       MoneyPuck's shotRebound flag (a shot within 3 s of a prior shot)
    offWing       shooter is on his off wing (left shot on the right side, or the reverse)
    pp / sh       shooting team has more / fewer skaters on the ice
    speed         puck speed from the last event, ft/s, capped at 60 (pass-then-shoot proxy)

Exclusions: empty-net shots, shootout attempts (period 5+).

Outputs in data/xg-model.json:
    model          intercept and coefficient per feature, plus the feature recipe
    tiers          MoneyPuck's danger tiers by xG: low < 0.08, medium < 0.20, high >= 0.20
    grid           baseline xG (wrist shot, even strength, no rebound or rush) on a
                   1 ft grid over the offensive zone, for heat maps and quick lookups
    shooters       finishing multiplier per shooter (goals vs xG, shrunk toward 1.0),
                   for shooters with at least 60 unblocked shots across the input seasons
    fit            holdout metrics: trained on the earlier season, tested on the later one
    sources        the input files and row counts
"""
import json, sys, pathlib, math
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import make_pipeline
from sklearn.metrics import log_loss, roc_auc_score

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'public' / 'bruins-vs-canadiens' / 'data' / 'xg-model.json'
TYPES = ['SNAP', 'SLAP', 'TIP', 'BACK', 'DEFL', 'WRAP']   # WRIST is the baseline
COLS = ['season', 'period', 'arenaAdjustedShotDistance', 'shotAngleAdjusted', 'shotType', 'shotRebound', 'shotRush',
        'offWing', 'shotOnEmptyNet', 'goal', 'xGoal', 'homeSkatersOnIce', 'awaySkatersOnIce', 'isHomeTeam',
        'speedFromLastEvent', 'shotWasOnGoal', 'shooterPlayerId', 'shooterName', 'playerPositionThatDidEvent']

def features(d):
    dist = d['arenaAdjustedShotDistance'].clip(0, 120).astype(float)
    ang = d['shotAngleAdjusted'].abs().clip(0, 90).astype(float)
    own = np.where(d['isHomeTeam'] == 1, d['homeSkatersOnIce'], d['awaySkatersOnIce'])
    opp = np.where(d['isHomeTeam'] == 1, d['awaySkatersOnIce'], d['homeSkatersOnIce'])
    X = pd.DataFrame({
        'dist': dist, 'logDist': np.log(dist + 1), 'dist2': dist ** 2 / 100, 'angle': ang, 'angle2': ang ** 2 / 100,
        'distAngle': dist * ang / 100,
        'rebound': d['shotRebound'].fillna(0).astype(float),
        'offWing': d['offWing'].fillna(0).astype(float),
        'pp': (own > opp).astype(float), 'sh': (own < opp).astype(float),
        'speed': d['speedFromLastEvent'].fillna(0).clip(0, 60).astype(float) / 10,
    })
    for t in TYPES:
        X['type_' + t] = (d['shotType'] == t).astype(float)
    return X

class Fit:
    """Logistic regression on standardized features, with the coefficients mapped back to raw units."""
    def __init__(self, X, y):
        self.pipe = make_pipeline(StandardScaler(), LogisticRegression(max_iter=5000, C=1.0)).fit(X, y)
        lr, sc = self.pipe.named_steps['logisticregression'], self.pipe.named_steps['standardscaler']
        self.coef_ = [lr.coef_[0] / sc.scale_]
        self.intercept_ = [lr.intercept_[0] - float(np.sum(lr.coef_[0] * sc.mean_ / sc.scale_))]
    def predict_proba(self, X):
        return self.pipe.predict_proba(X)

def fit(X, y):
    return Fit(X, y)

def main(paths):
    frames = [pd.read_csv(p, usecols=COLS) for p in paths]
    d = pd.concat(frames, ignore_index=True)
    rows_in = len(d)
    d = d[(d['shotOnEmptyNet'] == 0) & (d['period'] <= 4)].reset_index(drop=True)
    X, y = features(d), d['goal'].astype(int)

    # holdout: earliest season trains, latest tests
    seasons = sorted(d['season'].unique())
    fitstats = {}
    if len(seasons) > 1:
        tr, te = d['season'] == seasons[0], d['season'] == seasons[-1]
        m = fit(X[tr], y[tr]); p = m.predict_proba(X[te])[:, 1]
        fitstats = {'trainSeason': int(seasons[0]), 'testSeason': int(seasons[-1]), 'testShots': int(te.sum()),
                    'logLoss': round(float(log_loss(y[te], p)), 4), 'auc': round(float(roc_auc_score(y[te], p)), 4),
                    'moneypuckLogLoss': round(float(log_loss(y[te], d.loc[te, 'xGoal'].clip(1e-4, 1 - 1e-4))), 4),
                    'moneypuckAuc': round(float(roc_auc_score(y[te], d.loc[te, 'xGoal'])), 4),
                    'meanPredicted': round(float(p.mean()), 4), 'meanActual': round(float(y[te].mean()), 4)}
        # calibration by predicted decile
        q = pd.qcut(p, 10, labels=False, duplicates='drop')
        cal = pd.DataFrame({'p': p, 'y': y[te].values, 'q': q}).groupby('q').agg(predicted=('p', 'mean'), actual=('y', 'mean'), n=('y', 'size'))
        fitstats['calibrationByDecile'] = [{'predicted': round(r.predicted, 4), 'actual': round(r.actual, 4), 'shots': int(r.n)} for r in cal.itertuples()]

    m = fit(X, y)
    coef = {k: round(float(v), 6) for k, v in zip(X.columns, m.coef_[0])}
    # dataset means for features a caller may not know (the engine has no measured puck speed before a shot, nor handedness)
    defaults = {'speed': round(float(X['speed'].mean()), 4), 'offWing': round(float(X['offWing'].mean()), 4)}
    model = {'intercept': round(float(m.intercept_[0]), 6), 'coef': coef, 'defaults': defaults,
             'recipe': 'p = 1 / (1 + exp(-(intercept + sum(coef[f] * x[f])))); dist in ft from net center, angle in degrees from the midline (absolute), logDist = ln(dist+1), dist2 = dist^2/100, angle2 = angle^2/100, distAngle = dist*angle/100, speed = min(ft/s from last event, 60)/10, type_* one flag (WRIST baseline), rebound/offWing/pp/sh are 0 or 1; a feature the caller cannot measure takes its value from defaults (the dataset mean). MoneyPuck\'s shotRush flag is not used: it is populated for almost no shots in the 2025-26 file'}

    # baseline grid: wrist, even strength, no context; x = feet from the goal line toward center ice (0..89), y = |feet off the midline| (0..42)
    def xg_at(gx, gy):
        dx, dy = gx, gy   # net center sits on the goal line
        dist = math.hypot(dx, dy); ang = math.degrees(math.atan2(dy, dx)) if dist > 0 else 0
        z = model['intercept'] + coef['speed'] * defaults['speed'] + coef['offWing'] * defaults['offWing'] + coef['dist'] * dist + coef['logDist'] * math.log(dist + 1) + coef['dist2'] * dist ** 2 / 100 + coef['angle'] * ang + coef['angle2'] * ang ** 2 / 100 + coef['distAngle'] * dist * ang / 100
        return 1 / (1 + math.exp(-z))
    grid = [[round(xg_at(gx, gy), 4) for gy in range(0, 43)] for gx in range(0, 90)]

    # shooters: finishing = (goals + k*mean) / (xG + k*mean), shrunk toward 1 with k = 40 shots' worth
    pred = m.predict_proba(X)[:, 1]
    d['pred'] = pred
    k = 40 * float(y.mean())
    g = d.groupby(['shooterPlayerId', 'shooterName']).agg(shots=('goal', 'size'), goals=('goal', 'sum'), xg=('pred', 'sum')).reset_index()
    g = g[g['shots'] >= 60]
    shooters = {str(int(r.shooterPlayerId)): {'name': r.shooterName, 'shots': int(r.shots), 'goals': int(r.goals), 'xg': round(float(r.xg), 2),
                'finishing': round(float(min(1.6, max(0.6, (r.goals + k) / (r.xg + k)))), 3)} for r in g.itertuples()}

    out = {
        'schema': 'rink-sim-xg/1',
        'description': 'Expected-goal model fit on MoneyPuck unblocked shots. See tools/xg_fit.py for the method.',
        'sources': [{'file': pathlib.Path(p).name, 'rows': int(len(f)), 'from': 'https://moneypuck.com/data.htm', 'terms': 'free for non-commercial use with credit to MoneyPuck.com'} for p, f in zip(paths, frames)],
        'rowsUsed': int(len(d)), 'rowsIn': rows_in, 'exclusions': 'empty-net shots and shootout attempts',
        'goalRate': round(float(y.mean()), 4),
        'onNetShare': round(float(d['shotWasOnGoal'].mean()), 3), 'onNetShareNote': 'share of unblocked shots that hit the net; the engine divides xG by this when it scores a puck that has already reached the goalie',
        'tiers': {'low': {'maxXg': 0.08}, 'medium': {'maxXg': 0.2}, 'high': {'minXg': 0.2},
                  'note': 'MoneyPuck danger tiers are defined by xG; these thresholds reproduce the league tier goal rates in moneypuck-2025.json'},
        'model': model,
        'grid': {'desc': 'baseline xG, wrist shot at even strength with no rebound or rush; grid[x][y] with x = feet from the goal line toward center ice (0 to 89) and y = feet off the net midline (0 to 42, mirrored)', 'values': grid},
        'shooters': shooters,
        'fit': fitstats,
    }
    OUT.write_text(json.dumps(out, separators=(',', ':')), encoding='utf-8')
    print(f'wrote {OUT} ({OUT.stat().st_size // 1024} KB); rows used {len(d)}; shooters {len(shooters)}')
    print('holdout', json.dumps({k: v for k, v in fitstats.items() if k != "calibrationByDecile"}))
    for r in fitstats.get('calibrationByDecile', []): print('  decile predicted %.3f actual %.3f n %d' % (r['predicted'], r['actual'], r['shots']))
    print('coef', json.dumps(coef))

if __name__ == '__main__':
    main(sys.argv[1:])
