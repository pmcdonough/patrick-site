# CLAUDE.md

Project memory for anyone (or any Claude session) working on this repo. Read this first, then `docs/ENGINE.md` before touching the hockey engine.

## What this repo is

A static personal site in `public/`. The main project is the Bruins vs Canadiens hockey engine at `public/bruins-vs-canadiens/`: a page, a stylesheet and a plain JavaScript module (`src/main.js`) on a 2D canvas, no libraries, no build step, driven by the JSON files in `public/bruins-vs-canadiens/data/`. A header says what it is and links three steps into the strategy test; below it are three views, Watch (scoreboard, rink, each team's game plan as a sentence, box score, play by play and rosters folded), Test a strategy (the matchup lab) and How real is it (the reality check), with the game plans and the settings (engine sliders, data sources) in side drawers. The second project is Play Review at `public/play-review/`, built on the same data and models.

Versions: the site has one (home page footer, `CHANGELOG.md` Site section) and each project has its own (card badge; the sim's page footer and `VERSION` constant). As of this writing: site 0.53, sim 0.43, Play Review 0.8.

## Layout

```
public/index.html                         home page (card for each project, version badge, link preview tags)
public/assets/share.png                   the 1200x630 link preview image
public/bruins-vs-canadiens/index.html     the sim's page: markup, plus style.css and src/main.js with a ?v= version stamp
public/bruins-vs-canadiens/style.css      its styles
public/bruins-vs-canadiens/src/main.js    the page: drawing, controls, game plans, Test a strategy, How real is it
public/bruins-vs-canadiens/src/engine/sim.js  the engine, createSim(DATA): never touches the page; the page reads its state and listens to its events
public/bruins-vs-canadiens/src/engine/detmath.js  sin, cos, atan2, exp, log, pow, hypot from exact arithmetic: the same bits in every browser and in Node
public/bruins-vs-canadiens/src/lab/worker.js  Test a strategy's background worker: imports the engine and plays seeded games
public/bruins-vs-canadiens/data/*.json    the data that drives it (rosters, ratings, systems, physics, moneypuck-2025, defaults, xg-model)
public/play-review/index.html             shot versus pass review of a real game; fetches xg-model, systems and its game file
public/play-review/data/game-*.json       one file per game, from tools/game_load.py
tools/xg_fit.py                           fits data/xg-model.json from MoneyPuck shot CSVs
tools/mp_extract.py                       builds data/moneypuck-2025.json from the MoneyPuck season CSVs; --check diffs against the committed file
tools/game_load.py                        NHL play-by-play + shift chart JSON -> play-review game file
tools/engine.js                           the engine in Node, set up as a fresh visit to the page sets it up (lab, shifts, rules, nhl-average use it)
tools/lab.js                              parallel, seeded matchups in Node: report vs league and reference, --compare, --sweep, --order, --pool (the page's workers)
tools/review.js                           fingerprint of every shot Play Review scores, against the reference
tools/baselines.json                      saved references for lab.js and review.js, with a fingerprint per game and per shot (write with --save)
tools/serve.js                            static server for public/, run inside each check (node tools/serve.js serves it for a browser)
tools/harness.js                          loads pages over HTTP in headless Chromium for the checks that need the page (smoke, calibration, review, lab --pool)
tools/*.js                                the other checks: shifts, rules and nhl-average in Node, smoke and calibration in Chromium
docs/ENGINE.md                            how the engine is organized, invariants, tuning knobs, lessons learned
docs/HISTORY.md                           what was built before version numbers existed, in order
docs/XG-MODEL.md                          the expected-goal model and how the engine scores shots with it
docs/PLAY-REVIEW.md                       the review page's pipeline, reconstruction, scoring and replay
docs/MODELING.md                          index of every model: measured, calibrated or inferred, and where it lives
docs/ROADMAP.md                           where each project stands and what comes next, in priority order
docs/RAW-INPUTS.md                        every raw input file: what it is, its URL, retrieval date, the command that uses it
docs/RESTRUCTURE.md                       the plan to move both pages onto ES modules, step by step; where it stands
LOCAL-SETUP.md                            one-time setup on a new machine and the checks that prove it works
raw/                                      the raw inputs (git-ignored)
.venv/                                    Python environment for the fit scripts (git-ignored)
CHANGELOG.md                              per-version changes
```

## Rules of the road

- The app's visible copy never mentions technical internals: no file names, no "data/systems.json", no function names. Data sources are listed only in the Settings drawer, in a collapsed section. System descriptions in `systems.json` are shown to visitors under each choice, so they are written in hockey terms too, never with parameter names. The About dialog explains how the game works in hockey terms.
- Copy is plain and factual. No em dashes. Short sentences. Hockey vocabulary, not marketing.
- Every number a hockey person might question lives in `data/`, not in the script. If you add a threshold to the engine, put it in `physics.json` or `systems.json` with a `desc`, and read it from `PH` or `SYS`.
- Pages are served over HTTP and fetch their data; opening them from disk is not supported (decided 2026-10-14). After editing anything in `data/` or a game file, run `node tools/smoke.js`: it fails if any page cannot load its data. Do not add external scripts or stylesheets beyond the Google Fonts link already there.
- The sim's page loads `style.css?v=` and `src/main.js?v=` stamped with the sim version, and every import in `src/` carries the same stamp (the worker passes its own on), so a visitor never mixes files from two deploys. Bump them all with `VERSION`; `smoke.js` fails if any disagrees or an import has none.
- The engine (`src/engine/`) never touches the page: no `document`, no `window`, no drawing. Anything the page shows comes from its state or its events (`log`, `fx`, `final`, `reset`).
- The engine never calls `Math.sin`, `cos`, `tan`, `atan2`, `exp`, `log`, `pow`, `hypot` or `**`: browsers and Node compute those differently in the last bit, which changes how seeded games end. Use `detmath.js` (add a function there if you need one). `Math.abs`, `min`, `max`, `floor`, `round`, `sign` and `sqrt` are exact everywhere and fine.
- Balance is measured, not eyeballed. Before shipping an engine change, run `node tools/smoke.js` (no script errors), `node tools/shifts.js` and `node tools/rules.js`, and `node tools/lab.js` and `node tools/lab.js --nhl` (100 games each, about 40 s, in Node). The report compares each club with the league and with the saved reference; a seeded run reproduces exactly, so any change from the reference is the engine's doing. The reference keeps a fingerprint of every game, so "identical" means all 100 games finished exactly as before. For a change to how games start or reset, also run `node tools/lab.js --games 20 --order` (every game must match when replayed in reverse order). For a change to Play Review or the expected-goal model, run `node tools/review.js`. Re-save the reference with `--save` only for an intended change, and say so in the commit. A system or aggression effect is real only when its interval in `--compare` or `--sweep` excludes zero; judge by expected-goal differential first, since records need thousands of games to separate settings.
- Anything inferred or mocked (positions at a real shot, replay movement) is labeled on the page and never feeds a measured or calibrated number. `docs/MODELING.md` keeps the three kinds apart.
- Raw inputs (MoneyPuck CSVs, NHL JSON) stay out of the repo (`raw/` is ignored); the fitted model, the ratings extract and the compact game file go in. `docs/RAW-INPUTS.md` lists the exact inputs, where to download each and the command for each script; run `xg_fit.py` with `.venv/bin/python` (pandas, scikit-learn). Re-run the script, not the numbers, when the data changes. All three scripts reproduce the committed files byte for byte from those inputs (`mp_extract.py --check` proves it for the ratings file; for the other two, `git status` stays clean after a run). Do not hand-edit their outputs.
- The expected-goal formula lives in two places, the engine (`xgModel`) and the review page; change both or neither.
- Test a strategy plays the engine's own `tick` and `newGame`, in background workers that import the same engine (`runJobs`, `src/lab/worker.js`) or on the page when workers are unavailable (`runInPage`); it has no engine logic of its own. Do not add a second way to play a game. A seeded game must play identically in a worker, on the page and in `tools/lab.js` (Node); `node tools/lab.js --games 20 --pool` proves it.
- The engine is balanced at the NHL-average multipliers (every slider at 1.0, the tick mark). The build defaults in `defaults.json` deliberately run hotter (acceleration 2.3, speed 1.3, cruise 1.15, shot volume 2) because it is more fun to watch. Calibrate at 1.0, then check that the defaults still look right.

## Shipping a version

The site has its own version (the home page footer and the Site section of the changelog); each project keeps its own number. Bump the site version on every commit that changes anything under `public/` or ships a set of changes, and the project version only when that project changed (its card badge and, for the sim, its page footer). A repo-only fix with nothing under `public/` (a `.gitignore` line, a doc typo) can go in without a version.

1. If the sim changed, bump `const VERSION = '0.xx'` near the top of `public/bruins-vs-canadiens/src/main.js` and every `?v=0.xx` stamp (`grep -rn '?v=' public/bruins-vs-canadiens`: two in `index.html`, one per import in `src/`).
2. Add a section to `CHANGELOG.md` and update the summary line at its top (`Site 0.xx = sim 0.yy + Play Review 0.z`).
3. Update `public/index.html`: the card badge of any project that changed (`<span class="ver">v0.xx</span>`) and the footer's site version.
4. Update the version in "What this repo is" above, the "State" section below and the first line of `docs/ROADMAP.md`.
5. Run `node tools/smoke.js`, plus the engine checks above if the engine changed.
6. One commit with what changed and the version numbers in the subject, for example `Shots decided by the expected-goal model (sim 0.34, site 0.42)`, then push. pmcdonough.com serves `public/` through Cloudflare.

## Working with Claude Code

Run Claude Code from the repo root so this file loads automatically. `LOCAL-SETUP.md` has the one-time setup; the first command of a session is `node tools/smoke.js` (the pages load their data and the sim runs).

The engine, `src/engine/sim.js`, is about 1,200 lines and the page, `src/main.js`, about 840. Their sections are marked with `// ---------- Name ----------` comments and `docs/ENGINE.md` names the functions, so search for those rather than reading the whole file. The data lives only in `data/*.json`; the pages no longer carry copies of it.

The context that matters is in this file, `docs/ENGINE.md`, `docs/MODELING.md` and `docs/ROADMAP.md`. Until site 0.40 the repo was built in claude.ai chat and each version arrived as a full-repo zip, so the history is one commit per site version with a few upload-splitting commits around 0.39 and 0.40. Keep the one-commit-per-version habit.

## State (site 0.53)

All checks pass, all over HTTP: `node tools/smoke.js`, `node tools/lab.js` (both levels: all 100 games identical to the reference), `node tools/lab.js --games 20 --order --pool`, `node tools/review.js`, `node tools/calibration.js`, `node tools/shifts.js`, `node tools/rules.js`, and all three data scripts reproduce their committed files from `raw/`. References in `tools/baselines.json` are from sim 0.43 (re-saved for the engine's own math; the averages are within a fifth of an interval of the sim 0.38 references they replace), 100 games at each level, saved from Node; the page's workers play all 200 identically; `docs/ENGINE.md` has the first full sweep of the Bruins cards and what it says about the engine. The restructure in `docs/RESTRUCTURE.md` is under way: steps 0 (the safety net) and 1 (CSS, script and data out of the single file) are done, and step 2 is under way: the engine is its own module, plays the same game for a seed in Node and every browser, and the engine tools run in Node. Next in step 2: split `engine/sim.js` into modules. Roadmap item 0 is a long-shift bug found along the way. The next engine work, by priority, is in `docs/ROADMAP.md`; the first candidate is defense that allows the real number of chances.
