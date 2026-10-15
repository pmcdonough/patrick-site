# Engine notes

How `public/bruins-vs-canadiens/index.html` is put together, what must stay true, and what we learned tuning it. Function names below are the ones in the script; search for them.

## File structure

The file is, in order: CSS; page markup (a header with the pitch, the three steps and the view switcher; the Watch view with the scoreboard strip, canvas, control row, both teams' game plans and folded box score, play by play and rosters; the Test a strategy and How real is it views; the game-plan and settings drawers; About dialog; version footer); seven `<script type="application/json" id="data-NAME">` blocks holding copies of `data/*.json`; the engine inside `function startSim(DATA)`; and a small async loader at the end that fetches `data/*.json`, falls back to the embedded blocks, records which copy was used in `window.rinkDataFrom`, and calls `startSim`.

`startSim` exposes `window.rinkSim = { tick, teams, game, puck, DATA, cfg }` for the headless checks. `tick(dt)` advances the game by `dt` seconds (the frame loop uses 0.03 s substeps); the tools drive it directly, thousands of ticks per second, with the drawing loop paused.

## Coordinates

The rink is 200 by 85 feet in canvas units, goal lines at x = 11 and 189, blue lines at 75 and 125. Above the ice is a 12 ft bench band (`BENCH_H`) and below it a 10 ft penalty-box band; `RINK_Y` offsets the ice. Everything in the engine is in feet.

Formations and most rules use team-relative coordinates: `toFx(t, x)` gives distance from the team's own goal line (0) toward the far goal line (178), `toRink(t, fx, fy)` converts back, `zone(t, x)` returns `own` (fx < 64), `neutral` or `off` (fx > 114). `t.dir` is +1 for a team attacking right and flips every period (`endPeriod`), so anything that depends on direction must go through these helpers or `t.dir`, never a raw x.

## Sections of the script

**Rosters and ratings** (`buildRosters`, `mkSkater`, `mkGoalie`). Players are built from `rosters.json` with ratings from `moneypuck-2025.json` when the player has enough minutes, otherwise from the stat-line formulas in `ratings.json`. Skating speed is `27 + skate * 6` ft/s top speed (NHL EDGE), acceleration from `physics.json`. Goalies carry save percentage by danger tier and a freeze tendency.

**Game state and officials** (`setFaceoff`, `blowWhistle`, `moveOfficials`, `newGame`). `game.faceoff` is set during a stoppage; `game.faceT` counts down the pause. Three officials follow NHL lead/trail mechanics and are drawn but never touch the play.

**Lines, benches and shifts** (`pattern`, `nextLine`, `buildUnit`, `stoppageChange`, `matchLines`, `safeToChange`, `defending`, `shiftTarget`, `startUnitChange`, `startSoloChange`, `manageChanges`, `benchMinor`). Rotation patterns and shift targets come from `systems.json` deployment. Each bench has two doors (`fDoor`, `dDoor`, `doorFor`): forwards use the door at the attacking end, defense the other, so they swap with `t.dir`. Change windows are in `SYS.deployment.changeWindows`; the only on-the-fly windows are our carrier through the neutral zone, or the opponent retrieving deep in his own end. Nobody changes off a loose puck or while defending. Past `desperateAfterSec` a unit takes the first half-decent window and its carrier clears early.

**Formations** (`formationSpot`). One function returns the spot for a player given situation (offense, defense, loose) and zone. Offense in own zone starts at the breakout spots and, once possession has lasted `breakout.flow.startAfterSec`, moves the forwards north ahead of the puck. Neutral-zone offense is relative to the puck (lead winger, strong-side winger, center trailer, D trailing). Offensive zone uses the chosen system's spots, with the cycle rotating its three forward spots every `offensiveZone.motion.cycleEverySec` and a small drift on every spot. Defense: forecheck spots in their zone, puck-relative spots in neutral, and in our zone either the penalty-kill slots, man coverage, or zone coverage where the center owns the slot, D box out the net-front man (or stand `zone.dSpread` off the middle), wingers shade the high man, and any attacker in the slot gets the nearest free defender first (`zone.slotCoverage`, sticky). Man coverage (`manMarks`, once per tick) marks every attacker including the carrier; the man on the carrier is the one who pressures him, marks switch only past `man.stickFt`, and each defender plays between his man and the net with a cushion that grows with the man's distance from it. In our own zone a defender more than `skater.effort.defendOwnZoneUrgentBeyondFt` from his spot skates at full effort. Gap control caps a defenseman's depth at the deepest attacker minus 9 ft, reading the attacker's speed.

**AI** (`assignTargets`, `carrierThink`, `pass`, `shoot`, `chip`, `clearPuck`, `laneClear`, `shotQuality`, `leadForward`). `assignTargets` picks the chaser (nearest to the puck or carrier; a second chaser on 2-1-2 and lock forechecks), a fronter in our zone, the dump-and-chase sprinter, and gives everyone else a formation spot, clamped onside at fx 106 while we attack. `carrierThink` runs the carrier's decision each tick: in the offensive zone, shoot or pass by expected goals (`lookXg`, `shotDecision.xgChoice`: his look against the best pass, discounted for a defender in the lane or on him), then perimeter shots through traffic, probabilistic and point shots; breakaway, spring pass to a lead forward, the chosen zone entry (headman, carry, chip, dump), the stuck rule after `shotDecision.stuckAfterSec`, clearing under pressure in our zone, and the open-man pass (`pass.want`; in the offensive zone only after `pass.controlSec` with the puck). A pass on its way to a teammate counts as that team's puck in `assignTargets` (`inFlight`): both sides keep their structure and the defense plays the receiver. Defenders get one stick on a pass that goes by within `pass.stickReachFt`, and an uncontrolled touch knocks it off line.

**Expected goals** (`xgModel`, `xgTier`, `XGF`). The logistic model from `xg-model.json`, evaluated in `shoot()` with the shot's distance, angle, type, rebound and strength; `puck.xg` feeds the team total and the goalie's save roll. `docs/XG-MODEL.md` has the fit and the calibration story.

**Movement and physics** (`movePlayers`, `fatigueLevel`, `fatigue`, `hands`, `movePuck`, `keepOffNets`, `keepOnIce`, goalie helpers). Effort: full speed when chasing, rushing, bursting on a breakout, back-checking caught above the puck, or far from the spot; otherwise cruise. Fatigue scales top speed and acceleration down and pass and shot error up after `skater.fatigue.startsAtShiftSec`. The puck has friction, board and rim restitution, and `puck.cool` prevents instant re-pickup after releases. `movePuck` handles pickups, steals, blocks (`shotBlock`), goalie saves against the goalie line (`goalieLine`, one save roll per shot via `puck.beaten`), rebounds kicked to the corner, freezes, goals, icing and the dead-puck whistle.

**Rules** (`checkOffside`, `whistleOffside`, `penalize`, `releaseFromBox`, hybrid icing inside `movePuck`). Tag-up offside with a delayed flag, hybrid icing judged at the dots with the icing team unable to change, penalties drawn from each player's MoneyPuck penalty rate, too-many-men on a mid-change turnover.

**Effects** (`FX`, `fxTick`, `drawFx`). Skate trails, puck streak, rings on takeaways and blocks, save flash, goal light, scorer ring. All drawn under the players and cleared at every whistle. Two toggles, Effects and Sticks, remembered in `localStorage`.

**Drawing and HUD** (`drawRink`, `drawBenches`, `drawPlayers`, `drawSkater`, `drawGoalie`, `drawOfficials`, `drawWhistle`, `updateHud`, roster sheets, `renderCalib`, `drawSight`). The sight lines (`drawSight`, toggled with `FX.sight`) draw the carrier's read in the offensive zone from the same `readLook` that `carrierThink` decides with: a lit wedge to the posts, a shadow behind each defender in front of him, a dashed line to the best pass and a tag with both values. They read the game and change nothing. The reality check (`renderCalib`, in the How real is it view) reads `teamSample` per team and compares with `moneypuck-2025.json` benchmarks, and shows the record and points percentage of the session or the last lab run against each club's final record from `rosters.json`. `batch` holds the sums from the last lab run; while it exists the table shows that average, otherwise the current game scaled to 60 minutes.

**Game end** (`endPeriod`, `shootout`, `recordResult`). A game tied after three goes to a five-minute overtime (`game.period === 4`, full strength) and then `shootout()`: three shooters a side, best shooters first, then sudden death; a shooter's chance is `game.shootout.leagueRate` in `physics.json` scaled by his shoot rating and the goalie's high-danger save rate relative to the league. `game.overtime` and `game.shootout` mark how the game ended, `recordResult` adds it once (`game.recorded`) to the session `record` shown on the Game tab, and `newGame` resets the flags.

**Views, steps and drawers** (`showView`, `openDrawer`, `renderPlans`). `showView` switches Watch, Test a strategy and How real is it (remembered in `rink.view`; `#lab` or `#test` and `#real` in the address open those views). The three steps open the test view and flash the part that does that step. The game-plan drawer holds both teams' selects (the same ids the engine reads), each with its description from `systems.json` under it; `renderPlans` writes each plan as a sentence on the Watch view.

**Test a strategy** (`TEST`, `runJobs`, `runInPage`, `makePool`, `buildB`, `testRefresh`, `showResult`, the run and rank handlers). The coach picks his team; plan A is that team as set in the plan drawer, plan B a copy where any choice can change (`bGrid`, changed choices marked). A run is a list of jobs, one per game: a seed, both teams' tactics and the engine multipliers, always the NHL-average tick. `runJobs` plays them in background workers, one per spare core up to eight (`makePool`): each worker runs this page's own script behind a stand-in for the page's elements (`WORKER_PRELUDE`; the data loader skips itself when `self.__RINK_WORKER` is set), receives `DATA` once, and plays each job as `tools/lab.js` would, `Math.random` seeded from the job's seed. If a browser cannot start workers, `runInPage` plays the same jobs on the page, 4,000 ticks a frame, with the seeded generator switched on only while the game ticks. Plan A and plan B play the same seeds, so the verdicts compare game for game: net chances (chances for minus against), goal difference and points, each a mean with a 95% interval, labeled clear edge, too close to call or clear cost by whether the interval excludes zero. The ranking plays every option of one choice on the same seeds. Plan A's games feed the reality check (`feedRealityCheck` fills `batch`). The lab has no engine logic of its own; a seeded game plays identically in a worker, on the page and in `tools/lab.js`.

The aggression dial (`t.tac.agg`, 0 to 1) feeds exactly four things: the steal rate and the minor-penalty rate when a checker is on the carrier (`turnover.*PerAggression`), the probabilistic shot rate, and how long the carrier holds the puck under pressure. Its description, and every system's, lives in `systems.json` and is shown as hover text and in the About dialog.

## Invariants

- Only the helpers above read direction. If something looks mirrored in the second period, a raw x slipped in.
- Each shot gets exactly one save roll (`puck.beaten`), and whether it is on net is decided at release (`puck.onNet`). Every puck that reaches the goal line between the posts gets that roll, including one that slipped past where the goalie stood; before 0.35 those went in without one (about two goals per team per game at the 0.35 settings). Wide pucks the goalie touches are misses, not saves. The save roll divides xG by the league on-net share because xG is per unblocked attempt and the roll only sees pucks that reached the goalie.
- A game depends only on its seed. `newGame` resets every field a game reads, and picks the opening lines only after the clock, period, score and both penalty boxes are reset (the rotation reads them). Check with `tools/lab.js --workers 1` against `--workers 3`: the rows must be identical.
- A player is never in two places: `onIce`, `leaving`, `entering`, `box` are mutually consistent; `rebuildOnIce` recomputes `t.players` after any change.
- Formation spots are clamped to the ice and attackers are held onside at fx 106 until the puck crosses the far blue line.
- `tick` must never throw. `tools/smoke.js` fails the check on any page error.

## Baselines (sim 0.35)

Measure with `tools/lab.js`: `node tools/lab.js --nhl` and `node tools/lab.js`, 100 games each from seed 1, eight games at a time. Each game seeds `Math.random`, so a run reproduces exactly and the report says "identical to the reference" until the engine changes. The references are in `tools/baselines.json`; re-save with `--save` only for an intended change. To try a data value without editing the file: `--param shotDecision.xgChoice.minXg=0.14`. In the report "unblocked attempts" is a club's attempts minus the opponent's blocks (the engine's `blocked` counts blocks a team made).

At the NHL-average tick, per team per game, against the league (MoneyPuck 2025-26):

| | League | BOS | MTL |
|---|---|---|---|
| Goals | 3.08 | 3.37 | 2.95 |
| Expected goals | 3.13 | 5.97 | 5.01 |
| Shots on goal | 27.8 | 35.9 | 33.5 |
| Unblocked attempts | 42.7 | 53.5 | 61.5 |
| Low / medium / high danger | 31.2 / 8.1 / 3.4 | 24.5 / 22.2 / 5.4 | 37.4 / 16.8 / 3.9 |
| Offsides | 3.0 | 2.3 | 5.0 |
| Icings | 4.2 | 7.8 | 5.7 |

Goals match the league because `goalie.tierGoalScale` is 0.39. Everything else is honest: since 0.35 a carrier takes every look worth taking, so the sim's chance count shows how many looks its defense gives up, which is 60 to 90% too many, mostly medium-danger looks off passes into the slot (Boston, attacking Montreal's man coverage, gets the most). Montreal misses the net about 28 times a game (league 15) and is offside nearly twice the league rate; icings run high. At build defaults (speed 1.3x, shot volume 2x) goals are 2.9 to 3.5 a game on 5 to 5.7 expected, and Boston ices it about 10 times a game.

How 0.35 got here, measured each step with `lab.js --nhl` (both clubs' expected goals): the expected-goal decision alone took the sim from about 4 to 12 a game, because open looks were everywhere and players had been passing them up; passes no longer turning the defense into a loose-puck scramble, man coverage that keeps its marks with a cushion, and the pass control time brought it back to 5 to 6. Several sensible changes measured almost nothing on their own (slot pick-up, sticks on passes, own-zone effort, defenseman spacing) and were kept because they are right, not because they moved the number.

## System effects (sim 0.35)

The question the lab exists to answer: does changing a card move the result, by more than the noise, in a direction a hockey person would accept? Every Bruins card against the Canadiens' build cards, NHL-average tick, 100 games per option, the same seeds for every option (`node tools/lab.js --nhl --sweep BOS.<card>`). Differences are against the current Bruins card; * means the 95% interval excludes zero.

| Bruins card | Change | xG for | xG against | Points % | 0.34 for comparison (xGF / xGA) |
|---|---|---|---|---|---|
| Defensive zone | zone to man | +0.80 * | +2.00 * | +1% | +0.64 / +2.79 |
| Entry | dump to carry | +0.98 * | -0.09 | +4% | +0.46 / +0.15 |
| Entry | dump to headman | +0.75 * | -0.11 | +8% | +0.39 / +0.06 |
| Entry | dump to chip | -1.14 * | +0.38 * | -6% | -0.84 / +0.19 |
| Offensive zone | cycle to umbrella | -0.82 * | +0.25 | -14% * | +0.44 / -0.18 |
| Offensive zone | cycle to crash | -1.09 * | +0.23 | -11% | -0.94 / -0.25 |
| Forecheck | 2-1-2 to 1-2-2 / lock / 1-3-1 | -0.1 to +0.2 | -0.30 to -0.38 * | -3% to +14% | similar |
| Breakout | boards to stretch | +0.36 * | +0.12 | +9% | +0.16 / -0.15 |
| Penalty kill | pressure to diamond | -0.06 | -0.93 * | +14% * | +0.12 / -0.45 |
| Power play | any change | within ±0.1 | within ±0.25 | noise | noise |
| Aggression | 0 to 1 | within ±0.1 | within ±0.4 | noise | +0.28 / -0.28 at 1.0 |

What it says:

- Records are still noise at these sample sizes: about ±12 points on a points-percentage difference at 100 games. Expected-goal differential separates at about ±0.4 a game; read it first.
- More of the effects now point the way analysts would expect: controlled entries (carry, headman) create about a goal's worth of expected goals more than dumping it in, chipping it creates less, and the penalty kill's diamond protects the slot better than chasing.
- Man-on-man still gives up 2 expected goals a game more than zone. It used to cost the Bruins a quarter of their points; now it costs nothing in points because both sides score more. Still too big.
- Crashing the net still lowers expected goals for, and the umbrella flipped from better than the cycle to worse. Both offensive-zone systems need a look at where their forwards stand.
- Aggression no longer does anything measurable. It fed the old probabilistic shot rate and the reflex pass, which the expected-goal decision now outweighs; its steal and penalty effects are too small to show. It needs a real job (forecheck depth, pinching, how hard the chaser goes).
- The power-play systems still do nothing measurable.

## Tuning knobs most likely to matter

`physics.json`: `shotDecision.*` (rates per rule, breakaway detection), `goalie.tierGoalScale`, `shot.xg`, `skater.fatigue`, `skater.effort`, `shotDecision.*`, `goalie.freeze`, `goalie.tierGoalScale`, `turnover`, `puck.friction`, `rulesBenchmarks`.
`systems.json`: `breakout.flow`, `offensiveZone.motion`, `entry.dump`, `clearing`, `deployment.shiftTargetsSec`, `deployment.changeWindows`, formation spots per system.
`defaults.json`: what the sliders and systems start at.

## Lessons learned

Things that were wrong once and the fix, so nobody reintroduces them.

- Lead forwards overshooting the blue line: braking distance was ignored; the onside clamp now sits at fx 106 and targets back off at 113.
- Offsides on faceoffs: the faceoff zone flag leaked into the offside check; clear it at the drop.
- No icings at all: puck friction was far too high; `puck.friction` is now 0.008 and clears aim past the far blue line.
- Defense pinned to the goal line: gap control applied in our own zone; it is now skipped there.
- Man coverage marking point men: D take forwards only (`manMark`).
- Goalie line swinging parallel to the shot: the line is squared from the net toward the puck, smoothed by `goalie.turnRate`, with a body-radius floor.
- Multiple save rolls per shot and rebound chains: one roll (`puck.beaten`), rebounds kicked to the corner with `reboundCoolSec`.
- Power-play freeze (everyone stopped): the stuck rule and a PP drift keep the carrier moving.
- Stuck passes thrown out of the zone: stuck-rule passes go only to deep teammates.
- Dump on every possession: a dump window (fx 92 to 108) plus a cooldown.
- Rim dying beside the net: dump speed 125 ft/s and rim restitution 0.93.
- Lines peeling off during offensive-zone possession: the loose-puck change window was the cause; removed, replaced by the two windows and fatigue.
- Forwards standing still on breakouts and in the cycle: formation spots were fixed; see `breakout.flow` and `offensiveZone.motion`.
- Gassed units icing the puck constantly: the gassed clear now needs pressure within `clearing.gassedPressureFt` (8 ft), not the penalty-kill distance.
- Hidden panes showing in the standalone file: `[hidden] { display: none !important; }` is required in the CSS.
- The xG model's unmeasured features (puck speed before the shot, off wing) must take their dataset means, or every shot is inflated by about a third. MoneyPuck's rush flag is empty in 2025-26 and must not be used.
- The old distance-box tiers hid a shot mix that was far too close to the net; the first xG swap tripled goals until the decision rates were retuned against the real tier split.
- Measuring pace: compare builds with the same harness and the same multipliers; a quick harness that skipped whistle ticks produced misleading averages once.
- Sample size: ten games cannot separate two close strategies; at 50% the Wilson interval on 10 games is 24 to 76 points wide, on 100 games about 40 to 60. The lab prints the interval for that reason.
