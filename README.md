# patrick-site

Personal site for sharing interactive models and side projects, mostly built with AI coding tools. Everything is static and runs in the browser. The site is served from `public/`.

```
public/
  index.html                       home page: simulations and experiments
  assets/share.png                 link preview image (Open Graph card)
  bruins-vs-canadiens/
    index.html, style.css          the page's markup and styles, no build step
    src/engine/                    the engine, as plain ES modules that never touch the page (they also run in Node)
    src/main.js                    the page: drawing, controls, game plans, the strategy test and the reality check
    src/lab/worker.js              the strategy test's background worker
    data/                          the data that drives it (see below), including the expected-goal model
  play-review/
    index.html, style.css, src/    shot versus pass review of a real game, scored with the sim's own expected-goal model
    data/game-2025020812.json      the game, built from the NHL play-by-play and shift chart
tools/                             data fits (xg_fit.py, mp_extract.py, game_load.py), the engine in Node, unit tests and checks
docs/ENGINE.md                     how the engine is organized, invariants, baselines, lessons learned
docs/XG-MODEL.md                   the expected-goal model: data, method, fit, how the engine uses it
docs/PLAY-REVIEW.md                the play-review page: pipeline, reconstruction, scoring, replay, limits
docs/MODELING.md                   every model in the repo: what it answers, what it is built on, how it was set, where it lives
docs/ROADMAP.md                    where each project stands and what comes next
docs/HISTORY.md                    what was built before version numbers, in order
docs/RAW-INPUTS.md                 the raw input files: what each is, where to download it, the command for each script
docs/RESTRUCTURE.md                how the single-file pages became modules, and what was found on the way
LOCAL-SETUP.md                     one-time setup on a new machine and the checks that prove it works
CLAUDE.md                          project memory for working on this with Claude Code
CHANGELOG.md                       version history for the projects
```

To run locally, serve `public/` with any static server, for example `node tools/serve.js` or `python3 -m http.server --directory public 8000`, and open http://localhost:8000/. The pages load their data over HTTP, so opening them straight from disk does not work.

## Bruins vs Canadiens

A 5-on-5 hockey engine, not a scripted animation. Real 2025-26 rosters rated from MoneyPuck data, an expected-goal model fit on two seasons of shots that scores every attempt by distance, angle, type and the shooter's finishing, goalies stopping pucks at their actual save percentages by danger tier, and skating calibrated to NHL EDGE tracking. Each team runs selectable systems that can be changed mid-game, and a built-in reality check grades every game against how the real teams played.

Plain HTML, CSS and JavaScript modules on a 2D canvas. No libraries, no build step. The current version number is shown in the page footer and in the `VERSION` constant at the top of `src/main.js`.

A game is fully determined by its seed: the engine draws every random number from the game's own seeded generator and does its own trigonometry and logarithms with exact arithmetic, so the same seed plays the same game in Node, in Chrome, Firefox and Safari, and after browser updates. That is what lets the strategy test compare two plans on the same games, and what lets the checks say a change left every game exactly as it was.

### What the engine models

**Players.** Four forward lines, three defense pairs and two goalies per club, with jersey numbers and 2025-26 stat lines. Each skater gets four ratings (shoot, pass, def, skate) derived from MoneyPuck per-60 rates and percentiles, with a fallback formula from the basic stat line for players with too few minutes. Top speed and acceleration are scaled from the skate rating against NHL EDGE burst and top-speed benchmarks.

**Decisions.** A carrier decides each tick what to do with the puck. In the offensive zone he weighs his own shot by the expected-goal model against the best pass, each discounted for a defender in the lane or on him, and shoots when his look is worth enough; on top of that, perimeter and point shots go to the net at per-second rates from distance, which is where most real attempts and blocks come from. Elsewhere the team's systems decide: breakaways, spring passes, the chosen zone entry, clears under pressure, and on the penalty kill a clear the length of the ice. Every attempt is tagged with MoneyPuck's danger tier from its expected goals.

**Systems.** Formations are team-relative coordinates in `data/systems.json`: four forechecks (1-2-2, 2-1-2, 1-3-1 trap, left wing lock), three breakouts (up the boards, stretch pass, reverse), four zone entries (headman, carry wide, chip and chase, dump and chase), three offensive-zone structures (cycle low, umbrella, crash the net), two defensive-zone coverages (zone, man-on-man), three power plays (1-3-1, umbrella, overload) and three penalty kills (passive box, diamond, aggressive box). Each club's game plan is set in the plan drawer and takes effect on the next play.

**Pace.** Once a team has possession in its own zone the forwards burst north ahead of the puck and the carrier wheels out with speed; on the rush all three forwards are at full effort. The cycle rotates corner, half wall and net front every few seconds so nobody stands still in the offensive zone.

**Line changes and fatigue.** Forwards and pairs change separately, on the fly only when the carrier is through the neutral zone or the other team is retrieving deep in its own end, never off a loose puck or while defending. Shift length is not a hard rule: after about 30 seconds a skater loses top speed, acceleration and hands, and is gassed by 65 seconds. A unit stuck in its own zone plays tired, which is where goals against come from. Each bench has two doors, forwards through the door at the attacking end and defense through the other, swapping when the teams change ends. Stoppage changes follow the visitors-first rule with the home team getting the last change, and the team that iced the puck cannot change.

**Goalies.** A goalie is drawn and modeled as a line squared to the puck. Every puck that reaches the net gets one save roll: its expected goals over the league's on-net share, scaled by that goalie's real 2025-26 goal rate for the shot's danger tier against the league's. Rebounds are steered to the corners, and the goalie freezes the puck more often with traffic in the crease.

**Rules and officials.** Offside with the tag-up rule, hybrid icing judged at the dots, icing waived while shorthanded, minor penalties with power plays, too-many-men bench minors on bad changes, and goalie freezes. Three officials work NHL mechanics: the referee at the goal line in the zone, the lead linesman on the blue line for offside, the trail linesman on the red line for icing. A tie goes to a five-minute sudden-death overtime and then a shootout, so every game has a winner and the record is kept as wins, losses and overtime or shootout losses.

**Expected goals.** Every unblocked attempt gets a probability from a logistic model fit on two seasons of MoneyPuck shots (distance, angle, shot type, rebound, strength) times the shooter's finishing; the goalie's save roll scales that by his real tier save rate. See `docs/XG-MODEL.md`.

**Test a strategy.** Pick the team you coach. Plan A is that team as set; plan B is a copy where any choice can change. Run plays both plans against the opponent's plan in the same seeded games, in background workers on every spare core (100 games a plan takes about a minute on an eight-core machine), at the NHL-realistic settings. The result is a sentence and three verdicts, net chances, goal difference and points, each labeled clear edge, too close to call or clear cost from its 95% interval, with the records under Details for analysts. Rank every option for one choice plays each option on the same games and orders them by net chances.

**Reality check.** In the How real is it view, the games from the last run (or the current game, scaled to 60 minutes, when nothing has run) are compared per game with each club's real 2025-26 rates and the league average: shot attempts, shots on goal, goals, expected goals, blocks, misses, danger-tier mix, penalties, faceoff percentage, goalie freezes, offsides, icings, plus the record and points percentage against each club's final 2025-26 record. Each row gets a plain reading and an on target, above or below verdict. That table is the engine's to-do list.

### The data that drives it

Everything a hockey person might question lives in `public/bruins-vs-canadiens/data/`, not in the engine.

| File | What it holds |
|---|---|
| `rosters.json` | Lineups for both clubs, every player's 2025-26 stat line, jersey numbers, injuries, each club's final 2025-26 record, and a `sources` list with the URL each fact came from |
| `ratings.json` | The formulas that turn a stat line into the skater and goalie ratings, with weights, clamps and the precedence rule between MoneyPuck-derived and stat-line ratings |
| `systems.json` | Formations as team-relative coordinates for every system, zone-entry and dump parameters, clearing rules, breakout timing, offensive-zone motion, line rotation patterns, shift targets, change windows and the late-game bench-shortening rule, with references |
| `physics.json` | Skating speed and acceleration (NHL EDGE-calibrated), effort, fatigue, pass and shot speeds and accuracy, puck friction and board restitution, goalie coverage and save model, shot blocking, turnover and penalty rates, officials' speeds, rink geometry, and the offside and icing benchmarks, with references |
| `moneypuck-2025.json` | Extract of MoneyPuck's 2025-26 skaters, goalies and teams files for the two rosters: per-60 rates, percentiles, derived ratings, goalie save percentage by danger tier, team and league per-game benchmarks used by the reality check; produced by `tools/mp_extract.py` |
| `defaults.json` | Build defaults for the engine multipliers and both teams' systems, in the format the Settings drawer's Export button produces |
| `xg-model.json` | The expected-goal model: logistic coefficients and recipe, MoneyPuck's danger-tier thresholds, a baseline grid, per-shooter finishing, and the holdout fit statistics; produced by `tools/xg_fit.py` from MoneyPuck shot files (see `docs/XG-MODEL.md`) |

The page fetches these files, so edits take effect on reload. To change the build defaults, adjust the sliders and systems, click Export, and overwrite `defaults.json`.

Formation coordinates are in feet and team-relative: `fx` runs from the team's own goal line (0) up ice (64 own blue line, 89 red line, 114 far blue line, 178 far goal line); `fy` runs across the ice 0 to 85 with 42.5 at center. The engine mirrors them for whichever end the team is attacking.

### Sources

MoneyPuck 2025-26 skaters, goalies, lines and teams downloads (ratings, danger tiers, save percentages, per-game benchmarks). NHL EDGE tracking for skating speed and burst benchmarks. Hockey-Reference 2025-26 regular-season statistics for the stat-line fallback ratings. League offside and icing rates, line-change guidance and shift-length norms are cited per file in each `references` block.

### Controls

The header says what the page is and links three steps (set each team's plan, simulate the games, see what changes) into the strategy test, with How it works for the long explanation. Watch: the scoreboard with shots, the share of chances and the power-play state; the rink; pause, 0.5x / 1x / 3x / 8x speed, new game, Effects (skate trails, puck streaks, hit and block ripples, save flash, goal light), Sticks and Sight lines (what the puck carrier sees: his open look at the net, what defenders block, his best pass); each team's game plan as a sentence with Edit plan; and the box score, play by play and rosters folded below. Test a strategy: the matchup, a run of 10 to 100 games, the record and a sweep of one choice. How real is it: every number per team per game against that team's real 2025-26 number and the league, grouped, each with a plain reading and an on target / above / below verdict, and a button that plays 100 games to check. Every term has a ? explainer, and How it works ends with a glossary. The page always opens on Watch. The gear opens the settings: engine sliders with a tick at the NHL-calibrated value, save and export, and data sources.

## Play Review

A real game, Montreal 3 at Boston 4 on January 24, 2026, with every unblocked shot scored by expected goals against the best pass the model saw from the same spot, and a replay of the seconds around each shot (configurable lead-in, 3 seconds after, real result on the left, the pass on the right). Built from the public NHL play-by-play and shift chart by `tools/game_load.py`; the page infers the other skaters' positions from the clubs' systems and says so. It is the first slice of the counterfactual play-review idea and is documented in `docs/PLAY-REVIEW.md`. Like the sim, it fetches its data over HTTP, and it scores every shot with the sim's own expected-goal code, so the two cannot disagree.

### Tools and checks

`tools/mp_extract.py` builds the ratings and benchmark extract from the MoneyPuck season files (skaters, goalies, teams, lines), `tools/xg_fit.py` fits the expected-goal model from the MoneyPuck shot files, and `tools/game_load.py` turns an NHL play-by-play and shift chart into a game file for the review page. The raw inputs are not committed; keep them in `raw/` (ignored); `docs/RAW-INPUTS.md` lists every file, where to download it and the command that uses it.

The engine runs in Node for the balance checks and the unit tests (`tools/engine.js` sets it up the way the page does), and Playwright loads the pages for the rest, from a server each check starts itself (`tools/serve.js`, which also serves the site for a browser):

- `node --test tools/test`: unit tests (a seed plays the same game whatever came before it, a new game keeps nothing from the last, the engine's math, the expected-goal model against the fit).
- `lab.js`: seeded matchups eight at a time, each club against the league and a saved reference (a fingerprint per game, so "identical" means every game), two settings compared or one card swept with 95% intervals; `--order` and `--pool` prove the games do not depend on order or on where they run.
- `smoke.js`: plays a game, loads every page and checks the version stamps. `review.js`: every shot Play Review scores, against its reference. `calibration.js`: a ten-game strategy test through the page. `browsers.js`: the same seeded games in Chromium, Firefox and WebKit as in Node.
- `shifts.js`, `rules.js` and `nhl-average.js`: shift lengths, offsides and icings, and six games at the NHL-average settings.

Setup once and the full list are in `LOCAL-SETUP.md`; which check goes with which change is in `CLAUDE.md`.

### Versioning

Each project has its own version: bump its `VERSION` in `src/main.js` and its `?v=` stamps (the page's and every import's), add a section to `CHANGELOG.md`, update the version badge on the home page card, and run `node tools/smoke.js`, which fails on any stamp that disagrees. See `CLAUDE.md` for the full checklist.
