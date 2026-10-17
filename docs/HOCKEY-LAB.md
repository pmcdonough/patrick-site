# Hockey Strategy Lab

The site's main project, at `public/bruins-vs-canadiens/` (live at `/bruins-vs-canadiens/`). Sim 0.71. Bruins vs Canadiens is the matchup it plays; the project had that name until sim 0.66, and the folder keeps it so links keep working.

A 5-on-5 hockey engine, not a scripted animation. Real 2025-26 rosters rated from MoneyPuck data. An expected-goal model fit on two seasons of shots scores every attempt by distance, angle, type and the shooter's finishing. Goalies' save rolls use their real 2025-26 save rates by danger tier, and skating is calibrated to NHL EDGE tracking. Each team runs systems that can be changed mid-game. The Game plan lab tests a change of plan over 100 seeded games and grades those games against how the real teams played.

Plain HTML, CSS and JavaScript modules on a 2D canvas. No libraries, no build step. The version is in the page footer and in the `VERSION` constant at the top of `src/main.js`.

This doc is the project overview. The others go deeper:

| Doc | What it covers |
|---|---|
| `docs/ENGINE.md` | the code: where each function lives, the invariants, the reference numbers, the lessons |
| `docs/MODELING.md` | the engine as a model: what is measured, calibrated or inferred, and what tracking data would change |
| `docs/XG-MODEL.md` | the expected-goal model: data, method, fit, how the engine uses it |
| `docs/RESTRUCTURE.md` | how the single-file page became modules (sites 0.50 to 0.56) |
| `docs/HISTORY.md` | what was built before version numbers |
| `docs/ROADMAP.md` | what comes next |

## The three views

The page opens on Watch; `#review` and `#lab` in the address open the other two. They share the engine and nothing else.

**Watch a game.** One game on the rink, drawn at the frame rate. The scoreboard shows shots, each team's share of the chances and the power play. Below it: pause, 0.5x to 8x, new game, Effects, Sticks and Sight lines (what the puck carrier sees). Each team's game plan reads as a sentence, with Edit plan to change it on the next play. Settings holds the sliders for this game only, each with a tick at its NHL-average value, plus save, export and the data sources. The box score, play by play and rosters fold open below. When a game ends, a link opens its review.

**Review a game.** Every shot of a finished game, judged by the shooter's own read at the release: better pass missed, close call or right call. Each shot has a replay and What if he passed, which plays the pass and the shot out a few hundred times from the instant before the release. The game is a finished Watch game or any lab game opened with Review it. Recent games are listed; the lab's are kept in the browser as their seed and plans and played again exactly when reopened. Print or save as PDF puts the shot on screen on one page for the browser's print dialog.

**Game plan lab.** Read top to bottom. The baseline is your plan against theirs over 100 seeded games at the NHL settings, with the comparison with the real 2025-26 teams folded under it. Both teams' plans sit side by side; they are the lab's own, separate from Watch. Change either plan and Test against the baseline plays the same games again and judges the change three ways (net chances, goal difference, points), each a clear edge, too close to call or a clear cost from its 95% interval. Find the best option ranks every option of one choice. Everything is kept in the browser. Any lab game can be watched on the rink or reviewed, and Print or save as PDF prints the baseline and every test.

How it works (the About dialog) explains all of it for visitors, ending with a glossary; each term also has a ? button.

## What the engine models

**Players.** Four forward lines, three defense pairs and two goalies per club, with jersey numbers and 2025-26 stat lines. Each skater gets four ratings (shoot, pass, def, skate) from MoneyPuck per-60 rates and percentiles, with a fallback formula from the basic stat line for players with too few minutes. Top speed and acceleration are scaled from the skate rating against NHL EDGE burst and top-speed benchmarks.

**Decisions.** A carrier decides each tick what to do with the puck. In the offensive zone he weighs his own shot by the expected-goal model against the best pass, each discounted for a defender in the lane or on him, and shoots when his look is worth enough. On top of that, perimeter and point shots go to the net at per-second rates from distance, which is where most real attempts and blocks come from. Elsewhere the team's systems decide: breakaways, spring passes, the chosen zone entry, clears under pressure, and on the penalty kill a clear the length of the ice. Every attempt is tagged with MoneyPuck's danger tier from its expected goals.

**Systems.** Formations are team-relative coordinates in `data/systems.json`: four forechecks (1-2-2, 2-1-2, 1-3-1 trap, left wing lock), three breakouts (up the boards, stretch pass, reverse), four zone entries (headman, carry wide, chip and chase, dump and chase), three offensive-zone structures (cycle low, umbrella, crash the net), two defensive-zone coverages (zone, man-on-man), three power plays (1-3-1, umbrella, overload) and three penalty kills (passive box, diamond, aggressive box).

**Pace.** Once a team has the puck in its own zone the forwards burst north ahead of it and the carrier wheels out with speed; on the rush all three forwards are at full effort. The cycle rotates corner, half wall and net front every few seconds, so nobody stands still in the offensive zone.

**Line changes and fatigue.** Forwards and pairs change separately. On the fly they change only when the carrier is through the neutral zone or the other team is retrieving deep in its own end, never off a loose puck or while defending. Shift length is not a hard rule: after about 30 seconds a skater loses top speed, acceleration and hands, and is gassed by 65 seconds. A unit stuck in its own zone plays tired, which is where goals against come from. Each bench has two doors, forwards through the one at the attacking end, and they swap when the teams change ends. Stoppage changes follow the visitors-first rule with the home team's last change, and the team that iced the puck cannot change.

**Goalies.** A goalie is drawn and modeled as a line squared to the puck. Every puck that reaches the net gets one save roll: its expected goals over the league's on-net share, scaled by that goalie's real 2025-26 goal rate for the shot's danger tier against the league's, and by one calibration factor (`goalie.tierGoalScale`, 0.98 since sim 0.71) that keeps goals at the league rate while the engine still creates too many chances. Rebounds are steered to the corners, and the goalie freezes the puck more often with traffic in the crease. Attackers without the puck set up at the edge of the crease and never stand on the goalie.

**Rules and officials.** Offside with the tag-up rule, hybrid icing judged at the dots, icing waived while shorthanded, minor penalties with power plays, too-many-men bench minors on bad changes, and goalie freezes. Three officials work NHL mechanics: the referee at the goal line in the zone, the lead linesman on the blue line for offside, the trail linesman on the red line for icing. A tie goes to five minutes of sudden-death overtime and then a shootout, so the record is kept as wins, losses and overtime or shootout losses.

**Expected goals.** Every unblocked attempt gets a probability from a logistic model fit on two seasons of MoneyPuck shots (distance, angle, shot type, rebound, strength), times the shooter's finishing. See `docs/XG-MODEL.md`.

**Reality check.** Folded under the lab's baseline, its games are compared per game with each club's real 2025-26 rates and the league average: shot attempts, shots on goal, goals, expected goals, blocks, misses, danger-tier mix, penalties, faceoffs, goalie freezes, offsides, icings, and the record and points percentage against each club's final 2025-26 record. Each row gets a plain reading and an on target, above or below verdict. That table is the engine's to-do list.

## The modeling

The engine is a discrete-time simulation (0.03 s steps) of 12 bodies and a puck with bounded acceleration and speed, a hand-written decision policy whose thresholds are all data, and fitted outcome models: a logistic expected-goal model on 237,055 NHL shots and a save roll built on each goalie's tier save rates. Every number is labeled measured, calibrated or assumed. The Game plan lab estimates strategy effects by paired Monte Carlo with common random numbers. `docs/MODELING.md` has the full table.

A game is fully determined by its seed. The engine draws every random number from the game's own seeded generator and does its own trigonometry and logarithms with exact arithmetic (`detmath.js`), so the same seed plays the same game in Node, Chrome, Firefox and Safari, and after browser updates. That is what lets the lab compare a test with its baseline on the same games, and what lets the checks say a change left every game exactly as it was.

## The data that drives it

Everything a hockey person might question lives in `data/`, not in the engine. The page fetches these files, so edits take effect on reload.

| File | What it holds |
|---|---|
| `rosters.json` | Lineups for both clubs, every player's 2025-26 stat line, jersey numbers, injuries, each club's final 2025-26 record, and a `sources` list with the URL each fact came from |
| `ratings.json` | The formulas that turn a stat line into skater and goalie ratings, with weights, clamps and the precedence between MoneyPuck-derived and stat-line ratings |
| `systems.json` | Formations as team-relative coordinates for every system, entry and dump parameters, clearing rules, breakout timing, offensive-zone motion, line rotations, shift targets, change windows and the late-game bench rule, with references |
| `physics.json` | Skating (NHL EDGE-calibrated), effort, fatigue, pass and shot speeds and accuracy, puck friction and board restitution, the crease, goalie coverage and the save model, shot blocking, turnover and penalty rates, officials, rink geometry, and the offside and icing benchmarks, with references |
| `moneypuck-2025.json` | Extract of MoneyPuck's 2025-26 skaters, goalies and teams files for the two rosters: per-60 rates, percentiles, derived ratings, goalie save percentage by tier, team and league per-game benchmarks; produced by `tools/mp_extract.py` |
| `defaults.json` | Build defaults for the multipliers and both teams' systems, in the format the Settings drawer's Export produces |
| `xg-model.json` | The expected-goal model: coefficients, MoneyPuck's tier thresholds, a baseline grid, per-shooter finishing and the holdout statistics; produced by `tools/xg_fit.py` |

To change the build defaults, set the sliders and systems, click Export, and overwrite `defaults.json`. The defaults deliberately run hotter than the NHL (acceleration 1.8, speed 1.3, cruise 1.15, shot volume 2) because that is more fun to watch; the engine is balanced at 1.0 and the lab always plays there.

Formation coordinates are in feet and team-relative: `fx` runs from the team's own goal line (0) up the ice (64 own blue line, 89 red line, 114 far blue line, 178 far goal line); `fy` runs across the ice from 0 to 85, with 42.5 at center. The engine mirrors them for whichever end the team attacks.

## Sources

MoneyPuck 2025-26 skaters, goalies, lines and teams downloads (ratings, danger tiers, save percentages, per-game benchmarks) and shot files for 2024-25 and 2025-26 (the expected-goal fit). NHL EDGE tracking for skating speed and burst benchmarks. Hockey-Reference 2025-26 statistics for the stat-line fallback ratings. League offside and icing rates, line-change guidance and shift-length norms are cited in each file's `references` block. `docs/RAW-INPUTS.md` lists every raw file with its URL and retrieval date.

## Play Review, the first prototype

`public/play-review/` (Play Review 0.10) is a real game, Montreal 3 at Boston 4 on January 24, 2026, with every unblocked shot scored by expected goals against the best pass the model saw from the same spot, and a replay of the seconds around it. It is built from the public NHL play-by-play and shift chart by `tools/game_load.py`; the other skaters' positions are inferred from the clubs' systems and the page says so. It scores with the sim's own `xg.js`, `rink.js` and `detmath.js`, so the two cannot disagree. Review a game in the sim is where that work continues. See `docs/PLAY-REVIEW.md`.
