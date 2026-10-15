# Expected-goal model

What it is, what it was fit on, how good it is, and how the engine and the play-review page use it. Added in sim 0.29.

## What it replaces

Before 0.29 the engine graded every shot into one of three danger tiers by a distance box around the net (high: within 12 ft and 8 ft of the midline; medium: within 36 ft and 20 ft) and credited each tier with the league goal rate. That hid a lot: a wrist shot from the hash marks and a bad-angle tip from the goal line were the same "medium" shot. Now every shot gets its own probability from where it was taken and how.

## Data

Two MoneyPuck single-season shot files from [moneypuck.com/data.htm](https://moneypuck.com/data.htm): `shots_2024.csv` (2024-25) and `shots_2025.csv` (2025-26), 239,141 rows together, one per unblocked shot (saved, missed or goal), 124 columns. We use the arena-adjusted distance and angle, shot type, the rebound flag, the skater counts, handedness side and the puck speed from the last event. MoneyPuck's terms: free for non-commercial use with credit to MoneyPuck.com; other uses by arrangement with them.

Excluded: empty-net shots and shootout attempts, leaving 237,055 shots with a goal rate of 6.73 percent.

Not used: MoneyPuck's `shotRush` flag, because it is set on 0.1 percent of shots in the 2025-26 file and the coefficient it produced was meaningless. The engine has its own rush notion for other purposes but does not feed it to the model.

## Method

A logistic regression, fit with scikit-learn on standardized features and then expressed in raw units so the same formula runs in the browser. Features:

| Feature | Definition |
| --- | --- |
| dist, logDist, dist2 | distance from the net center in feet, ln(dist + 1), dist squared over 100 |
| angle, angle2 | absolute angle from the net's midline in degrees, and its square over 100 |
| distAngle | dist times angle over 100 |
| type_SNAP, type_SLAP, type_TIP, type_BACK, type_DEFL, type_WRAP | shot type flags; wrist shot is the baseline |
| rebound | MoneyPuck's flag: a shot within 3 s of a prior shot |
| pp, sh | the shooting team has more, or fewer, skaters on the ice |
| offWing | shooter on his off wing |
| speed | puck speed from the previous event in ft/s, capped at 60, divided by 10 |

Probability = 1 / (1 + exp(-(intercept + sum of coefficient times feature))). Two features the engine cannot measure (speed and offWing) take their dataset means, which are stored with the model as `defaults`; without that the engine's shots were inflated by about a third.

The script is `tools/xg_fit.py`. It writes `public/bruins-vs-canadiens/data/xg-model.json` with the coefficients, the recipe in words, the tier thresholds, a baseline grid, the shooter table and the fit statistics.

## How good it is

Trained on 2024-25, tested on 2025-26 (118,186 shots): log loss 0.2257, AUC 0.742. MoneyPuck's own model on the same shots: log loss 0.2178, AUC 0.767. Theirs is better, as it should be with more features (shooter history, time since the last event, more context). Ours is close enough to grade shots and small enough to run anywhere.

Calibration by decile on the holdout season: predicted and actual goal rates agree within a point from the 2nd to the 9th decile; the top decile predicts 21 percent and sees 17, so the model is a little generous on the best looks.

Danger tiers follow MoneyPuck's own thresholds on expected goals: low under 0.08, medium under 0.20, high 0.20 and up. On the 2025-26 file those thresholds reproduce the league tier goal rates in `moneypuck-2025.json` (3.6, 12.8 and 22.8 percent).

Baseline grid (wrist shot, even strength, no rebound), feet from the goal line on the midline: 5 ft 20 percent, 10 ft 17, 20 ft 12, 40 ft 6, 55 ft 3.

## Shooter finishing

For every shooter with at least 60 unblocked shots across the two seasons (738 players), finishing = (goals + k) / (expected goals + k) with k equal to 40 shots at the league rate, clamped to 0.6 to 1.6. That shrinks small samples toward 1.0. David Pastrnak: 855 shots, 70 goals on 56.8 expected, finishing 1.22. The engine multiplies a shooter's model xG by his finishing; the sim's rosters match by full name to the MoneyPuck name.

## In the engine

`shoot()` computes distance and angle to the net, the shot type (slap for point shots and defensemen, snap for one-timers, wrist otherwise), rebound (within 3 s of the goalie's last save), and the strength, then stores `puck.xg` and the tier. `countUnblocked()` adds `puck.xg` to the team's expected goals. The goalie's save roll uses it: goal probability = xG divided by the league share of unblocked shots that hit the net (0.651, since this check only runs on pucks that reach the goalie), times the goalie's goal rate in that tier relative to the league's, times `goalie.tierGoalScale` (0.39 since sim 0.35; 0.72 before).

The shot mix was retuned at the same time because the old tier boxes had hidden how close the sim's shots were. At the NHL-average settings the engine now produces about 43 unblocked attempts per team per game in a 28 / 13 / 3 low / medium / high split (league 31 / 8 / 3), mean xG per attempt 0.087 (league 0.073), and 3.5 to 4 goals per team per game over a ten-game batch. The medium tier is still too fat; `tierGoalScale` compensates for goals, and the reality check shows the mix honestly.

Since sim 0.35 the carrier also decides with the model (`lookXg`, `shotDecision.xgChoice` in `physics.json`). In the offensive zone he compares his own look (the model's xG times his finishing, halved with a defender in the lane, cut further with a defender within 4 ft) with the best pass (a teammate's look times the chance the pass gets there). He shoots a look worth at least 0.12 when no pass is clearly better, which covers an open wrist shot from about 20 ft straight on; a teammate's look better by 30% gets the pass. The volume rules (perimeter and point shots, the stuck rule) still throw low-danger pucks on net.

The consequence: the sim now takes the chances its defense allows, and it allows too many. At the NHL-average settings both clubs generate 60 to 90% more expected goals than the league, mostly medium-danger looks off passes into the slot. `tierGoalScale` (0.39) brings goals back to the league rate, and the reports show expected goals unscaled so the gap stays visible. Closing it is defensive work (`docs/ROADMAP.md`).

## In the play-review page

The same formula, copied into `public/play-review/index.html`, scores the real shot (real type, strength and rebound flag) and each teammate's hypothetical one-timer (type SNAP) from his inferred spot. See `docs/PLAY-REVIEW.md`.

## Refitting

Download newer shot files from MoneyPuck, run `python3 tools/xg_fit.py shots_2025.csv shots_2026.csv`, then `python3 tools/build.py` to re-embed the model in the sim page, and `node tools/calibration.js` to see what moved.
