# CLAUDE.md

Project memory for anyone (or any Claude session) working on this repo. Read this first, then `docs/ENGINE.md` before touching the hockey engine.

## What this repo is

A static personal site in `public/`, served by Cloudflare at pmcdonough.com. The main project is the Hockey Strategy Lab at `public/bruins-vs-canadiens/`, a hockey engine in plain JavaScript modules on a 2D canvas, no libraries, no build step, driven by the JSON files in its `data/`. It has three views that share nothing but the engine: Watch a game (scoreboard, rink, each team's game plan as a sentence with its drawer, the Watch settings drawer with the sliders, box score, play by play and rosters, a strip that explains the lab and links to it, and once a game ends a link to its review), Review a game (every shot of a finished game judged by the shooter's own read, with a replay and What if he passed; the game is a finished Watch game or any lab game opened with Review it, and recent games are listed, the lab's kept in the browser as their seed and plans and played again exactly when reopened; Print or save as PDF puts the shot on screen on one page for the browser's print dialog) and the Game plan lab, read top to bottom (the baseline of 100 games at the NHL settings with the comparison with the real 2025-26 teams folded under it; both teams' plans, its own, side by side; Rerun the baseline and Test against the baseline, each enabled only after an edit; the tests of the edited plans on the same games, each named for what it changed and each foldable and removable; Find the best option, which ranks every option of one choice; all kept in the browser; a button that sends both plans to Watch; and Print or save as PDF, a report of the baseline and every test for the browser's print dialog). The second project is Play Review at `public/play-review/`, which scores the shots of a real game with the sim's own expected-goal model. The third is Keystone at `public/keystone/`: build the whole of Notre-Dame in 3D piece by piece, every stone carrying real load from a rigid-block masonry solver, with a 2D arch lab beside it (`docs/KEYSTONE.md`).

Names: the project is the Hockey Strategy Lab (page title, home card, footer); Bruins vs Canadiens is the matchup it plays, the line under the title. It was called Bruins vs Canadiens until sim 0.66; the folder and its address keep that name so links keep working, and older changelog entries keep the name they had. Inside the repo "the sim" is still the short name. The Game plan lab is one of its two views.

Versions: the site has one (home page footer, `CHANGELOG.md` Site section) and each project has its own (the sim's card badge on the home page, its page footer and `VERSION` constant; Play Review's `VERSION`; Keystone's card badge and the `VERSION` on both its pages). As of this writing: site 0.90, sim 0.71, Play Review 0.10, Keystone 0.6.

## Layout

```
public/index.html                  home page (one wide card for the sim with its version badge, a card for Keystone with its badge, then More coming soon; link preview tags; the footer's site version is the easter egg to Under the hood). Play Review has no card since site 0.73: the sim card links it as the first prototype
public/under-the-hood/index.html   Under the hood: the architecture and stack, for the curious; linked only from the easter egg, noindex. Update it when the stack or the checks change
public/assets/share.png            the 1200x630 link preview image
public/bruins-vs-canadiens/
  index.html                       the page's markup; loads style.css and src/main.js with a ?v= version stamp
  style.css                        its styles
  data/*.json                      rosters, ratings, systems, physics, moneypuck-2025, defaults, xg-model
  src/main.js                      the page: Watch (drawing, controls, its plans and settings) and the Game plan lab
  src/review.js                    Review a game: recorders (the Watch rink, or a lab game played from its seed and plans on an engine of its own), recent games, the panel and replay
  src/lab/worker.js                the lab's background worker: imports the engine, plays seeded games
  src/lab/read.js                  how the lab reads a run: averages, 95% ranges, verdicts, the baseline's headline (no page in it; unit-tested)
  src/engine/                      the engine; never touches the page (the page reads its state and listens to its events)
    sim.js                         createSim(DATA): game state, newGame(seed), tick; installs and links the modules below
    rink.js, xg.js, rosters.js     geometry, expected goals, ratings: plain functions
    officials.js, lines.js,        each install(S): adds its functions to the shared object S, then links to the others'
    formations.js, ai.js,
    physics.js, rules.js
    rng.js                         the seeded generator behind newGame(seed)
    detmath.js                     sin, cos, atan2, exp, log, pow, hypot from exact arithmetic: the same bits everywhere
public/keystone/
  index.html, style.css            the 3D build; style.css is shared with the arch lab
  src/main.js                      the 3D page (Three.js): scene, booklet, steps, Inspect, load coloring, cutaway
  src/notre-dame.js                the whole cathedral as a kit: pieces, steps, bags, loads, force lines
  src/solver.js                    the masonry solver, pure functions; both pages import it, the unit tests run it
  src/vendor/                      Three.js r128, served from the site (its README says how to upgrade)
  arch-lab/index.html, src/main.js the 2D arch lab
public/play-review/
  index.html, style.css            markup and styles, with ?v= stamps
  src/main.js                      reconstruction, scoring, replay; imports the sim's engine/xg.js, rink.js and detmath.js
  data/game-*.json                 one file per game, from tools/game_load.py
tools/
  engine.js                        the engine in Node, set up the way a fresh visit to the page sets it up
  lab.js                           seeded matchups in Node, 8 processes: report vs league and reference, --compare, --sweep, --order, --pool
  shifts.js, rules.js, nhl-average.js   shift lengths, offsides and icings, six games at the NHL tick (Node)
  test/*.test.js                   unit tests: node --test tools/test
  smoke.js                         loads every page over HTTP, plays a game, starts Keystone's 3D, checks the version stamps (Chromium)
  calibration.js                   a ten-game baseline in the Game plan lab through the page's own controls (Chromium)
  review.js                        fingerprint of every shot Play Review scores, against the reference (Chromium)
  browsers.js                      the same seeded games in Node and in Chromium, Firefox and WebKit
  baselines.json                   saved references for lab.js and review.js, a fingerprint per game and per shot
  serve.js, harness.js             the static server each page check starts, and the Playwright loader
  bump.js                          sets a project's VERSION and every ?v= stamp that carries it
  xg_fit.py, mp_extract.py,        the data scripts: fit xg-model.json, extract moneypuck-2025.json, build a game file
  game_load.py
docs/ENGINE.md                     how the engine is organized, where each function lives, invariants, baselines, lessons
docs/MODELING.md                   every model (measured, calibrated or inferred, and where it lives), a technical summary, what tracking would change
docs/XG-MODEL.md                   the expected-goal model: data, method, fit, how the engine uses it
docs/PLAY-REVIEW.md                Play Review's pipeline, reconstruction, scoring and replay
docs/KEYSTONE.md                   Keystone: concept, modes, the solver and what it checks, buildings, the look, roadmap
docs/ROADMAP.md                    where each project stands and what comes next, in priority order
docs/RAW-INPUTS.md                 every raw input file: what it is, its URL, retrieval date, the command that uses it
docs/RESTRUCTURE.md                how the single-file pages became modules (sites 0.50 to 0.56), and what was found on the way
docs/HISTORY.md                    what was built before version numbers existed, in order
LOCAL-SETUP.md                     one-time setup on a new machine and the checks that prove it works
CHANGELOG.md                       per-version changes
raw/, .venv/                       raw inputs and the Python environment for the data scripts (both git-ignored)
```

## Rules of the road

Copy and data:

- The app's visible copy never mentions technical internals: no file names, no "data/systems.json", no function names. Data sources are listed only in the Settings drawer, in a collapsed section. System descriptions in `systems.json` are shown to visitors under each choice, so they are written in hockey terms too, never with parameter names. The About dialog explains how the game works in hockey terms.
- Copy is plain and factual. No em dashes. Short sentences. Hockey vocabulary, not marketing.
- Every number a hockey person might question lives in `data/`, not in the code. If you add a threshold to the engine, put it in `physics.json` or `systems.json` with a `desc`, and read it from `PH` or `SYS`.
- Anything inferred or mocked (positions at a real shot, replay movement) is labeled on the page and never feeds a measured or calibrated number. `docs/MODELING.md` keeps the three kinds apart.
- Raw inputs (MoneyPuck CSVs, NHL JSON) stay out of the repo (`raw/` is ignored); the fitted model, the ratings extract and the compact game file go in. `docs/RAW-INPUTS.md` lists the exact inputs, where to download each and the command for each script; run `xg_fit.py` with `.venv/bin/python` (pandas, scikit-learn). Re-run the script, not the numbers, when the data changes. All three scripts reproduce the committed files byte for byte from those inputs (`mp_extract.py --check` proves it for the ratings file; for the other two, `git status` stays clean after a run). Do not hand-edit their outputs.

Pages:

- Pages are served over HTTP and fetch their data; opening them from disk is not supported (decided 2026-10-14). No bundler, no framework, no external scripts or stylesheets beyond the Google Fonts links already there. The one library is Three.js for Keystone's 3D, kept in `public/keystone/src/vendor/` and served from the site with Keystone's stamps.
- Every file a page loads carries a `?v=` version stamp: the sim's `index.html` loads `style.css` and `src/main.js` with the sim version, every import in its `src/` carries the same stamp (the worker passes its own on), and Play Review stamps its own files with its version and its imports from the sim with the sim's. A visitor never mixes files from two deploys, and Cloudflare already makes browsers revalidate every file. `smoke.js` fails if any stamp disagrees or an import has none.

Engine:

- The engine (`src/engine/`) never touches the page: no `document`, no `window`, no drawing. Anything the page shows comes from its state or its events (`log`, `fx`, `final`, `reset`).
- A game's whole state can be copied and restored, into the same engine or another: `snapshot()`, `restore(snap)`, `reseed(seed)`, `force(player, what)` (the shot review's what-if). That works only because every piece of state hangs off `teams`, `puck`, `game` and `officials`: a module must never keep game state in its own variables. The unit test 'a snapshot restored ... plays on exactly' fails if one does.
- A game depends only on its seed. `newGame(seed)` gives it its own generator; the engine never calls `Math.random` (every draw goes through `random()` or `rnd()` from `S`), and a game started with `newGame()` uses `Math.random`.
- Every game starts from freshly built teams, players, puck and clock (`buildTeams` refills the same two team objects in `newGame`); only the game plans carry over. Put a new field's starting value in `rosters.js`, not in a reset list.
- The engine never calls `Math.sin`, `cos`, `tan`, `atan2`, `exp`, `log`, `pow`, `hypot` or `**`: browsers and Node compute those differently in the last bit, which changes how seeded games end. Use `detmath.js` (add a function there if you need one). `Math.abs`, `min`, `max`, `floor`, `round`, `sign` and `sqrt` are exact everywhere and fine.
- The expected-goal formula lives in one place, `src/engine/xg.js`. Play Review imports it with the sim's rink and math, so the two pages cannot disagree.
- Watch and the Game plan lab are separate: the Watch plans and sliders drive only the game on the rink (only `#planDrawer` controls feed `readTactics`), and the lab keeps its own plans (`LAB`, saved as `rink.lab`) and always plays at the NHL settings.
- The Game plan lab plays the engine's own `tick` and `newGame`, in background workers that import the engine (`runJobs`, `src/lab/worker.js`) or, when a browser cannot start workers, on an engine instance of its own on the page (`runInPage`); it has no engine logic of its own. Do not add a second way to play a game. (Review a game plays a lab game the same way, `tick` and `newGame` on an engine of its own, and checks its final against the lab's.) A seeded game plays identically in a worker, on the page, in `tools/lab.js` (Node) and in every browser.
- The engine is balanced at the NHL-average multipliers (every slider at 1.0, the tick mark). The build defaults in `defaults.json` deliberately run hotter (acceleration 1.8, speed 1.3, cruise 1.15, shot volume 2) because it is more fun to watch. Calibrate at 1.0, then check that the defaults still look right, including the points split: acceleration was 2.3 until sim 0.62, when it handed Montreal's man coverage about three quarters of the points. `--param cfg.accel=1.5` tries a multiplier.
- Balance is measured, not eyeballed. A seeded run reproduces exactly, so any change from the saved reference is the code's doing. Re-save a reference with `--save` only for an intended change, and say so in the commit. A system or aggression effect is real only when its interval in `--compare` or `--sweep` excludes zero; judge by expected-goal differential first, since records need thousands of games to separate settings.

## Checks

GitHub runs the engine checks (unit tests, both reference levels) and the page checks (smoke, order and pool, Play Review) on every push (`.github/workflows/checks.yml`); a red run means something changed play without a re-saved reference, or a page broke. Run them locally before pushing anyway.

The engine checks run in Node; the page checks start their own server and load the pages in headless Chromium (`LOCAL-SETUP.md` has the setup).

| Run | When | Passes when |
|---|---|---|
| `node tools/smoke.js` | every change; first command of a session | `ERRORS: []` |
| `node --test tools/test` | any engine change (about 20 s) | `fail 0` |
| `node tools/lab.js` and `node tools/lab.js --nhl` | any engine change (about 40 s each) | "Identical to the reference: all 100 games", or a change you intended and re-save |
| `node tools/lab.js --games 20 --order --pool` | a change to how games start or reset, to the worker or to the Game plan lab | "Order check" and "Pool check" lines, no FAILED |
| `node tools/shifts.js`, `node tools/rules.js` | a change to lines, changes, offside or icing | numbers against the targets in their headers |
| `node tools/review.js` | a change to Play Review, the expected-goal model or the rink | "Identical to the reference" |
| `node tools/calibration.js` | a change to the Game plan lab | the two tables print, `ERRORS []` |
| `node tools/browsers.js` | a change to `detmath.js` or anything the engine computes with | every installed browser "identical to Node" |

## Shipping a version

The site has its own version (the home page footer and the Site section of the changelog); each project keeps its own number. Bump the site version on every commit that changes anything under `public/` or ships a set of changes, and the project version only when that project changed. A repo-only change with nothing under `public/` (a tool, a doc) can go in without a version.

1. Bump the version of each project that changed with `node tools/bump.js sim 0.xx`, `node tools/bump.js review 0.x` or `node tools/bump.js keystone 0.x`: it sets `VERSION` in the project's `src/main.js` (for Keystone, also the arch lab's) and every `?v=` stamp that carries it (for the sim, also Play Review's imports from the sim's engine).
2. Add a section to `CHANGELOG.md` and update the summary line at its top (`Site 0.xx = sim 0.yy + Play Review 0.z + Keystone 0.w`).
3. Update `public/index.html`: the card's badge of each project that changed (`<span class="ver">v0.xx</span>`), and the footer's site version (inside the easter-egg link). When the sim gains or loses a feature, update the card's four short sections too.
4. Update the version in "What this repo is" above, the "State" section below and the first line of `docs/ROADMAP.md`.
5. Run the checks above for what changed; `smoke.js` always.
6. One commit with what changed and the version numbers in the subject, for example `Shots decided by the expected-goal model (sim 0.34, site 0.42)`, then push. The live site updates about a minute later; check its footer.

## Working with Claude Code

Run Claude Code from the repo root so this file loads automatically. `LOCAL-SETUP.md` has the one-time setup; the first command of a session is `node tools/smoke.js` (the pages load their data and the sim runs).

The engine is about 1,500 lines across `src/engine/` (the biggest file, `ai.js`, under 400) and the sim's page, `src/main.js`, about 850. `docs/ENGINE.md` (Where things live) names the file for each function, and sections inside a file are marked with `// ---------- Name ----------` comments, so search for those rather than reading whole files.

The context that matters is in this file, `docs/ENGINE.md`, `docs/MODELING.md` and `docs/ROADMAP.md`. Until site 0.40 the repo was built in claude.ai chat and each version arrived as a full-repo zip, so the history is one commit per site version with a few upload-splitting commits around 0.39 and 0.40. Keep the one-commit-per-version habit.

## State (site 0.90)

All checks pass. References in `tools/baselines.json` are from sim 0.71 (re-saved when attackers stopped standing in the crease and on the goalie; `tierGoalScale` went from 1.02 to 0.98; expected goals are 25 to 40% above the league after the coverage fixes in 0.58 to 0.61 and the shot accuracy in 0.60), 100 games at each level, saved from Node; the page's workers play all 200 identically, and the live site plays seeded games identically in Chromium, Firefox and WebKit. The restructure in `docs/RESTRUCTURE.md` is complete, and the long-shift bug it turned up is fixed. The next engine work, by priority, is defense that allows the real number of chances (`docs/ROADMAP.md`). Keystone 0.1 shipped in site 0.85 from two chat prototypes, 0.2 (zoom where you point, one whole line of thrust) in 0.86, 0.3 (the whole nave, drawn in batches) in 0.87, 0.4 (the west front and towers) in 0.88, 0.5 (the transept, crossing and spire) in 0.89, and 0.6 (the choir and apse: the whole cathedral) in 0.90; its solver tests pass and both pages load clean in Chromium at desktop and phone widths, light and dark; its next steps are in `docs/KEYSTONE.md`.
