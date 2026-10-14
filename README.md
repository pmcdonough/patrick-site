# patrick-site

Personal site for sharing interactive models and side projects, mostly built with AI coding tools. Everything is static and runs in the browser. The site is served from `public/`.

```
public/
  index.html                       home page: simulations and experiments
  assets/share.png                 link preview image (Open Graph card)
  bruins-vs-canadiens/
    index.html                     the hockey engine, single file, no build step
    data/                          the data that drives it (see below), including the expected-goal model
  play-review/
    index.html                     shot versus pass review of a real game, single file like the sim
    data/game-2025020812.json      the game, built from the NHL play-by-play and shift chart
tools/                             build script, data fits (xg_fit.py, game_load.py) and headless checks
docs/ENGINE.md                     how the engine is organized, invariants, baselines, lessons learned
docs/XG-MODEL.md                   the expected-goal model: data, method, fit, how the engine uses it
docs/PLAY-REVIEW.md                the play-review page: pipeline, reconstruction, scoring, replay, limits
docs/MODELING.md                   every model in the repo: what it answers, what it is built on, how it was set, where it lives
docs/ROADMAP.md                    where each project stands and what comes next
docs/HISTORY.md                    what was built before version numbers, in order
docs/RAW-INPUTS.md                 the raw input files: what each is, where to download it, the command for each script
LOCAL-SETUP.md                     one-time setup on a new machine and the checks that prove it works
CLAUDE.md                          project memory for working on this with Claude Code
CHANGELOG.md                       version history for the projects
```

To run locally, serve `public/` with any static server, for example `npx serve public` or `python3 -m http.server --directory public 8000`. The hockey page also works when opened straight from disk; see the note on data loading below.

## Bruins vs Canadiens

A 5-on-5 hockey engine, not a scripted animation. Real 2025-26 rosters rated from MoneyPuck data, an expected-goal model fit on two seasons of shots that scores every attempt by distance, angle, type and the shooter's finishing, goalies stopping pucks at their actual save percentages by danger tier, and skating calibrated to NHL EDGE tracking. Each team runs selectable systems that can be changed mid-game, and a built-in reality check grades every game against how the real teams played.

Plain HTML, CSS and JavaScript on a 2D canvas. No libraries, no build step. The current version number is shown in the page footer and in the `VERSION` constant at the top of the script.

### What the engine models

**Players.** Four forward lines, three defense pairs and two goalies per club, with jersey numbers and 2025-26 stat lines. Each skater gets four ratings (shoot, pass, def, skate) derived from MoneyPuck per-60 rates and percentiles, with a fallback formula from the basic stat line for players with too few minutes. Top speed and acceleration are scaled from the skate rating against NHL EDGE burst and top-speed benchmarks.

**Decisions.** A carrier decides each tick whether to shoot, pass, carry or dump, based on shot quality from his location, lanes to the net and to teammates, pressure, and the team's chosen systems. Shots are classified in-tight, slot, perimeter or point, and every attempt is tagged with a danger tier that maps to a league expected-goal value.

**Systems.** Formations are team-relative coordinates in `data/systems.json`: four forechecks (1-2-2, 2-1-2, 1-3-1 trap, left wing lock), three breakouts (up the boards, stretch pass, reverse), four zone entries (headman, carry wide, chip and chase, dump and chase), three offensive-zone structures (cycle low, umbrella, crash the net), two defensive-zone coverages (zone, man-on-man), three power plays (1-3-1, umbrella, overload) and three penalty kills (passive box, diamond, aggressive box). Each club's coaching card sits above its bench and changes take effect on the next play.

**Pace.** Once a team has possession in its own zone the forwards burst north ahead of the puck and the carrier wheels out with speed; on the rush all three forwards are at full effort. The cycle rotates corner, half wall and net front every few seconds so nobody stands still in the offensive zone.

**Line changes and fatigue.** Forwards and pairs change separately, on the fly only when the carrier is through the neutral zone or the other team is retrieving deep in its own end, never off a loose puck or while defending. Shift length is not a hard rule: after about 30 seconds a skater loses top speed, acceleration and hands, and is gassed by 65 seconds. A unit stuck in its own zone plays tired, which is where goals against come from. Each bench has two doors, forwards through the door at the attacking end and defense through the other, swapping when the teams change ends. Stoppage changes follow the visitors-first rule with the home team getting the last change, and the team that iced the puck cannot change.

**Goalies.** A goalie is drawn and modeled as a line squared to the puck. A shot that crosses the line is a save with probability equal to that goalie's real 2025-26 save percentage for the shot's danger tier; rebounds are steered to the corners, and the goalie freezes the puck more often with traffic in the crease.

**Rules and officials.** Offside with the tag-up rule, hybrid icing judged at the dots, icing waived while shorthanded, minor penalties with power plays, too-many-men bench minors on bad changes, and goalie freezes. Three officials work NHL mechanics: the referee at the goal line in the zone, the lead linesman on the blue line for offside, the trail linesman on the red line for icing. A tie goes to a five-minute sudden-death overtime and then a shootout, so every game has a winner and the record is kept as wins, losses and overtime or shootout losses.

**Expected goals.** Every unblocked attempt gets a probability from a logistic model fit on two seasons of MoneyPuck shots (distance, angle, shot type, rebound, strength) times the shooter's finishing; the goalie's save roll scales that by his real tier save rate. See `docs/XG-MODEL.md`.

**Matchup lab.** The Lab tab shows the systems on both coaching cards side by side, plays the two clubs against each other 10 to 100 times and reports each club's W-L-OTL, win and points percentage with a 95% Wilson interval, and goals and expected goals for and against per game. A sweep holds everything else and tries every option for one card, so a forecheck or breakout can be judged against what the other bench is running, and the interval says how many games it takes to separate two choices. The engine's system effects have not been validated against real results, and the tab says so; it is a way to ask a question of the video, not an answer. The home page opens the page on this tab (`/bruins-vs-canadiens/#lab`).

**Reality check.** Below the record in the Lab tab, the games from the last run (or the current game, scaled to 60 minutes, when nothing has run) are compared per game with each club's real 2025-26 rates and the league average: shot attempts, shots on goal, goals, expected goals, blocks, misses, danger-tier mix, penalties, faceoff percentage, goalie freezes, offsides, icings, plus the record and points percentage against each club's final 2025-26 record. Cells more than 50 percent off the real rate are flagged. That table is the engine's to-do list.

### The data that drives it

Everything a hockey person might question lives in `public/bruins-vs-canadiens/data/`, not in the engine.

| File | What it holds |
|---|---|
| `rosters.json` | Lineups for both clubs, every player's 2025-26 stat line, jersey numbers, injuries, each club's final 2025-26 record, and a `sources` list with the URL each fact came from |
| `ratings.json` | The formulas that turn a stat line into the skater and goalie ratings, with weights, clamps and the precedence rule between MoneyPuck-derived and stat-line ratings |
| `systems.json` | Formations as team-relative coordinates for every system, zone-entry and dump parameters, clearing rules, breakout timing, offensive-zone motion, line rotation patterns, shift targets, change windows and the late-game bench-shortening rule, with references |
| `physics.json` | Skating speed and acceleration (NHL EDGE-calibrated), effort, fatigue, pass and shot speeds and accuracy, puck friction and board restitution, goalie coverage and save model, shot blocking, turnover and penalty rates, officials' speeds, rink geometry, and the offside and icing benchmarks, with references |
| `moneypuck-2025.json` | Extract of MoneyPuck's 2025-26 skaters, goalies and teams files for the two rosters: per-60 rates, percentiles, derived ratings, goalie save percentage by danger tier, team and league per-game benchmarks used by the reality check; produced by `tools/mp_extract.py` |
| `defaults.json` | Build defaults for the engine multipliers and both teams' systems, in the format the Advanced tab's Export button produces |
| `xg-model.json` | The expected-goal model: logistic coefficients and recipe, MoneyPuck's danger-tier thresholds, a baseline grid, per-shooter finishing, and the holdout fit statistics; produced by `tools/xg_fit.py` from MoneyPuck shot files (see `docs/XG-MODEL.md`) |

When the page is served over HTTP it fetches these files, so edits take effect on reload. When it is opened directly from disk, browsers block `fetch`, so the page falls back to copies embedded in the HTML. The Data sources panel in the Advanced tab says which copy is in use. To change the build defaults, adjust the sliders and systems, click Export, and overwrite `defaults.json` and the embedded copy.

Formation coordinates are in feet and team-relative: `fx` runs from the team's own goal line (0) up ice (64 own blue line, 89 red line, 114 far blue line, 178 far goal line); `fy` runs across the ice 0 to 85 with 42.5 at center. The engine mirrors them for whichever end the team is attacking.

### Sources

MoneyPuck 2025-26 skaters, goalies, lines and teams downloads (ratings, danger tiers, save percentages, per-game benchmarks). NHL EDGE tracking for skating speed and burst benchmarks. Hockey-Reference 2025-26 regular-season statistics for the stat-line fallback ratings. League offside and icing rates, line-change guidance and shift-length norms are cited per file in each `references` block.

### Controls

Game tab: pause, 1x / 3x / 8x speed, new game, Effects (skate trails, puck streaks, hit and block ripples, save flash, goal light) and Sticks, plus this session's record. Rosters tab: who is on the ice, time on ice and current shift, goals and blocks, with each player's stat line on hover. Lab tab: collapsible sections for the matchup, a run of 10 to 100 games, the record, the reality check and a sweep of one card, each with a one-line summary. Advanced tab: engine settings with a tick at the NHL-calibrated value, save and export, and data sources.

## Play Review

A real game, Montreal 3 at Boston 4 on January 24, 2026, with every unblocked shot scored by expected goals against the best pass the model saw from the same spot, and a replay of the seconds around each shot (configurable lead-in, 3 seconds after, real result on the left, the pass on the right). Built from the public NHL play-by-play and shift chart by `tools/game_load.py`; the page infers the other skaters' positions from the clubs' systems and says so. It is the first slice of the counterfactual play-review idea and is documented in `docs/PLAY-REVIEW.md`. Like the sim, it fetches its data when served and falls back to embedded copies when opened from disk.

### Tools and checks

`tools/mp_extract.py` builds the ratings and benchmark extract from the MoneyPuck season files (skaters, goalies, teams, lines), `tools/xg_fit.py` fits the expected-goal model from the MoneyPuck shot files, and `tools/game_load.py` turns an NHL play-by-play and shift chart into a game file for the review page. The raw inputs are not committed; keep them in `raw/` (ignored); `docs/RAW-INPUTS.md` lists every file, where to download it and the command that uses it. `tools/build.py` re-embeds `data/*.json` into the page (run it after any data edit; `--check` verifies). The Playwright scripts in `tools/` drive the engine headless: `lab.js` plays seeded matchups eight at a time and reports each club against the league and a saved reference, compares two settings or sweeps one card with 95% intervals, `smoke.js` plays a game and fails on any script error, `calibration.js` runs a ten-game matchup and prints the record and the reality check, `nhl-average.js` plays six games with every multiplier at 1.0, `shifts.js` reports the shift-length distribution and change windows, `rules.js` reports offsides and icings per game. Setup once is in `LOCAL-SETUP.md`.

### Versioning

Bump `VERSION` in the script, add a section to `CHANGELOG.md`, update the version badge on the home page card, and run `python3 tools/build.py --check` and `node tools/smoke.js`. See `CLAUDE.md` for the full checklist.
