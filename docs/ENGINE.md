# Engine notes

How `public/bruins-vs-canadiens/index.html` is put together, what must stay true, and what we learned tuning it. Function names below are the ones in the script; search for them.

## File structure

The file is, in order: CSS; page markup (coaching cards, scoreboard, canvas, control row, panel with Game, Rosters and Advanced tabs, About dialog, version footer); six `<script type="application/json" id="data-NAME">` blocks holding copies of `data/*.json`; the engine inside `function startSim(DATA)`; and a small async loader at the end that fetches `data/*.json`, falls back to the embedded blocks, records which copy was used in `window.rinkDataFrom`, and calls `startSim`.

`startSim` exposes `window.rinkSim = { tick, teams, game, puck, DATA, cfg }` for the headless checks. `tick(dt)` advances the game by `dt` seconds (the frame loop uses 0.03 s substeps); the tools drive it directly, thousands of ticks per second, with the drawing loop paused.

## Coordinates

The rink is 200 by 85 feet in canvas units, goal lines at x = 11 and 189, blue lines at 75 and 125. Above the ice is a 12 ft bench band (`BENCH_H`) and below it a 10 ft penalty-box band; `RINK_Y` offsets the ice. Everything in the engine is in feet.

Formations and most rules use team-relative coordinates: `toFx(t, x)` gives distance from the team's own goal line (0) toward the far goal line (178), `toRink(t, fx, fy)` converts back, `zone(t, x)` returns `own` (fx < 64), `neutral` or `off` (fx > 114). `t.dir` is +1 for a team attacking right and flips every period (`endPeriod`), so anything that depends on direction must go through these helpers or `t.dir`, never a raw x.

## Sections of the script

**Rosters and ratings** (`buildRosters`, `mkSkater`, `mkGoalie`). Players are built from `rosters.json` with ratings from `moneypuck-2025.json` when the player has enough minutes, otherwise from the stat-line formulas in `ratings.json`. Skating speed is `27 + skate * 6` ft/s top speed (NHL EDGE), acceleration from `physics.json`. Goalies carry save percentage by danger tier and a freeze tendency.

**Game state and officials** (`setFaceoff`, `blowWhistle`, `moveOfficials`, `newGame`). `game.faceoff` is set during a stoppage; `game.faceT` counts down the pause. Three officials follow NHL lead/trail mechanics and are drawn but never touch the play.

**Lines, benches and shifts** (`pattern`, `nextLine`, `buildUnit`, `stoppageChange`, `matchLines`, `safeToChange`, `defending`, `shiftTarget`, `startUnitChange`, `startSoloChange`, `manageChanges`, `benchMinor`). Rotation patterns and shift targets come from `systems.json` deployment. Each bench has two doors (`fDoor`, `dDoor`, `doorFor`): forwards use the door at the attacking end, defense the other, so they swap with `t.dir`. Change windows are in `SYS.deployment.changeWindows`; the only on-the-fly windows are our carrier through the neutral zone, or the opponent retrieving deep in his own end. Nobody changes off a loose puck or while defending. Past `desperateAfterSec` a unit takes the first half-decent window and its carrier clears early.

**Formations** (`formationSpot`). One function returns the spot for a player given situation (offense, defense, loose) and zone. Offense in own zone starts at the breakout spots and, once possession has lasted `breakout.flow.startAfterSec`, moves the forwards north ahead of the puck. Neutral-zone offense is relative to the puck (lead winger, strong-side winger, center trailer, D trailing). Offensive zone uses the chosen system's spots, with the cycle rotating its three forward spots every `offensiveZone.motion.cycleEverySec` and a small drift on every spot. Defense: forecheck spots in their zone, puck-relative spots in neutral, and in our zone either the penalty-kill slots, man coverage (`manMark`), or zone coverage where the center owns the slot, D box out the net-front man and wingers shade the high man. Gap control caps a defenseman's depth at the deepest attacker minus 9 ft, reading the attacker's speed.

**AI** (`assignTargets`, `carrierThink`, `pass`, `shoot`, `chip`, `clearPuck`, `laneClear`, `shotQuality`, `leadForward`). `assignTargets` picks the chaser (nearest to the puck or carrier; a second chaser on 2-1-2 and lock forechecks), a fronter in our zone, the dump-and-chase sprinter, and gives everyone else a formation spot, clamped onside at fx 106 while we attack. `carrierThink` runs the carrier's decision each tick: in-tight shot, slot must-shoot, perimeter shots through traffic, probabilistic and point shots, breakaway, spring pass to a lead forward, the chosen zone entry (headman, carry, chip, dump), the stuck rule after `shotDecision.stuckAfterSec`, clearing under pressure in our zone, and pass scoring (openness, progress, shot quality of the receiver, distance).

**Movement and physics** (`movePlayers`, `fatigueLevel`, `fatigue`, `hands`, `movePuck`, `keepOffNets`, `keepOnIce`, goalie helpers). Effort: full speed when chasing, rushing, bursting on a breakout, back-checking caught above the puck, or far from the spot; otherwise cruise. Fatigue scales top speed and acceleration down and pass and shot error up after `skater.fatigue.startsAtShiftSec`. The puck has friction, board and rim restitution, and `puck.cool` prevents instant re-pickup after releases. `movePuck` handles pickups, steals, blocks (`shotBlock`), goalie saves against the goalie line (`goalieLine`, one save roll per shot via `puck.beaten`), rebounds kicked to the corner, freezes, goals, icing and the dead-puck whistle.

**Rules** (`checkOffside`, `whistleOffside`, `penalize`, `releaseFromBox`, hybrid icing inside `movePuck`). Tag-up offside with a delayed flag, hybrid icing judged at the dots with the icing team unable to change, penalties drawn from each player's MoneyPuck penalty rate, too-many-men on a mid-change turnover.

**Effects** (`FX`, `fxTick`, `drawFx`). Skate trails, puck streak, rings on takeaways and blocks, save flash, goal light, scorer ring. All drawn under the players and cleared at every whistle. Two toggles, Effects and Sticks, remembered in `localStorage`.

**Drawing and HUD** (`drawRink`, `drawBenches`, `drawPlayers`, `drawSkater`, `drawGoalie`, `drawOfficials`, `drawWhistle`, `updateHud`, roster sheets, `renderCalib`, `runBatch`). The reality check reads `teamSample` per team and compares with `moneypuck-2025.json` benchmarks; `runBatch` plays ten headless games inside the page with the display paused.

## Invariants

- Only the helpers above read direction. If something looks mirrored in the second period, a raw x slipped in.
- Each shot gets exactly one save roll (`puck.beaten`), and whether it is on net is decided at release (`puck.onNet`). Wide pucks the goalie touches are misses, not saves.
- A player is never in two places: `onIce`, `leaving`, `entering`, `box` are mutually consistent; `rebuildOnIce` recomputes `t.players` after any change.
- Formation spots are clamped to the ice and attackers are held onside at fx 106 until the puck crosses the far blue line.
- `tick` must never throw. `tools/smoke.js` fails the check on any page error.

## Baselines (v0.27 to v0.28)

At NHL-average multipliers, per team per game, over 6 games: about 28 to 32 shots on goal, 3 to 4 goals, 7 high-danger shots, 6 goalie freezes, 3 offsides, 4 icings; mean shift about 49 s, p90 about 73 s, 3 percent of shifts past 90 s (units pinned in their zone); line changes about 150 per team.

At build defaults (shots 2x, speed 1.3x): about 45 shots on goal and 6 to 8 goals per team, which is intended.

## Tuning knobs most likely to matter

`physics.json`: `skater.fatigue`, `skater.effort`, `shotDecision.*`, `goalie.freeze`, `goalie.tierGoalScale`, `turnover`, `puck.friction`, `rulesBenchmarks`.
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
- Measuring pace: compare builds with the same harness and the same multipliers; a quick harness that skipped whistle ticks produced misleading averages once.
