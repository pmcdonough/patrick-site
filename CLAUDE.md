# CLAUDE.md

Project memory for anyone (or any Claude session) working on this repo. Read this first, then `docs/ENGINE.md` before touching the hockey engine.

## What this repo is

A static personal site in `public/`. The main project is the Bruins vs Canadiens hockey engine at `public/bruins-vs-canadiens/index.html`: one HTML file, plain JavaScript on a 2D canvas, no libraries, no build step, driven by the JSON files in `public/bruins-vs-canadiens/data/`. Its tabs are Game, Rosters, Lab (the matchup lab and the reality check) and Advanced (engine settings, data sources). The second project is Play Review at `public/play-review/`, built on the same data and models.

Versions: the site has one (home page footer, `CHANGELOG.md` Site section) and each project has its own (card badge; the sim's page footer and `VERSION` constant). As of this writing: site 0.41, sim 0.33, Play Review 0.6.

## Layout

```
public/index.html                         home page (card for each project, version badge, link preview tags)
public/assets/share.png                   the 1200x630 link preview image
public/bruins-vs-canadiens/index.html     the engine: CSS, markup, embedded data copies, script
public/bruins-vs-canadiens/data/*.json    the data that drives it (rosters, ratings, systems, physics, moneypuck-2025, defaults, xg-model)
public/play-review/index.html             shot versus pass review of a real game; embeds xg-model, systems and its game file (fetch first, embedded fallback)
public/play-review/data/game-*.json       one file per game, from tools/game_load.py
tools/build.py                            re-embeds data/*.json into index.html; --check verifies
tools/xg_fit.py                           fits data/xg-model.json from MoneyPuck shot CSVs
tools/mp_extract.py                       builds data/moneypuck-2025.json from the MoneyPuck season CSVs; --check diffs against the committed file
tools/game_load.py                        NHL play-by-play + shift chart JSON -> play-review game file
tools/*.js                                headless Playwright checks (smoke, calibration, nhl-average, shifts, rules)
docs/ENGINE.md                            how the engine is organized, invariants, tuning knobs, lessons learned
docs/HISTORY.md                           what was built before version numbers existed, in order
docs/XG-MODEL.md                          the expected-goal model and how the engine scores shots with it
docs/PLAY-REVIEW.md                       the review page's pipeline, reconstruction, scoring and replay
docs/MODELING.md                          index of every model: measured, calibrated or inferred, and where it lives
docs/ROADMAP.md                           where each project stands and what comes next, in priority order
docs/RAW-INPUTS.md                        every raw input file: what it is, its URL, retrieval date, the command that uses it
LOCAL-SETUP.md                            one-time setup on a new machine and the checks that prove it works
raw/                                      the raw inputs (git-ignored)
.venv/                                    Python environment for the fit scripts (git-ignored)
CHANGELOG.md                              per-version changes
```

## Rules of the road

- The app's visible copy never mentions technical internals: no file names, no "data/systems.json", no function names. Data sources are listed only in the Advanced tab, in a collapsed section. The About dialog explains how the game works in hockey terms.
- Copy is plain and factual. No em dashes. Short sentences. Hockey vocabulary, not marketing.
- Every number a hockey person might question lives in `data/`, not in the script. If you add a threshold to the engine, put it in `physics.json` or `systems.json` with a `desc`, and read it from `PH` or `SYS`.
- After editing anything in `data/` or a game file, run `python3 tools/build.py` so the embedded copies in both pages match. Pages fetch their data over HTTP and fall back to the embedded copies from `file://`.
- Every page must keep working when opened from disk as a single file. Do not add external scripts or stylesheets beyond the Google Fonts link already there.
- Balance is measured, not eyeballed. Before shipping an engine change, run `node tools/smoke.js` (no script errors), `node tools/shifts.js` and `node tools/rules.js`, and for anything touching shots or goalies, `node tools/calibration.js`. Compare against the baselines in `docs/ENGINE.md`.
- Anything inferred or mocked (positions at a real shot, replay movement) is labeled on the page and never feeds a measured or calibrated number. `docs/MODELING.md` keeps the three kinds apart.
- Raw inputs (MoneyPuck CSVs, NHL JSON) stay out of the repo (`raw/` is ignored); the fitted model, the ratings extract and the compact game file go in. `docs/RAW-INPUTS.md` lists the exact inputs, where to download each and the command for each script; run `xg_fit.py` with `.venv/bin/python` (pandas, scikit-learn). Re-run the script, not the numbers, when the data changes. All three scripts reproduce the committed files byte for byte from those inputs (`mp_extract.py --check` proves it for the ratings file; for the other two, `git status` stays clean after a run). Do not hand-edit their outputs.
- The expected-goal formula lives in two places, the engine (`xgModel`) and the review page; change both or neither.
- The matchup lab reuses the game loop (`playGames`); it has no engine logic of its own. Do not add a second way to play a game.
- The engine is balanced at the NHL-average multipliers (every slider at 1.0, the tick mark). The build defaults in `defaults.json` deliberately run hotter (acceleration 2.3, speed 1.3, cruise 1.15, shot volume 2) because it is more fun to watch. Calibrate at 1.0, then check that the defaults still look right.

## Shipping a version

The site has its own version (the home page footer and the Site section of the changelog); each project keeps its own number. Bump the site version on every commit that changes anything under `public/` or ships a set of changes, and the project version only when that project changed (its card badge and, for the sim, its page footer). A repo-only fix with nothing under `public/` (a `.gitignore` line, a doc typo) can go in without a version.

1. If the sim changed, bump `const VERSION = '0.xx'` near the top of the script in `public/bruins-vs-canadiens/index.html`.
2. Add a section to `CHANGELOG.md` and update the summary line at its top (`Site 0.xx = sim 0.yy + Play Review 0.z`).
3. Update `public/index.html`: the card badge of any project that changed (`<span class="ver">v0.xx</span>`) and the footer's site version.
4. Update the version in "What this repo is" above, the "State" section below and the first line of `docs/ROADMAP.md`.
5. Run `python3 tools/build.py --check` and `node tools/smoke.js`, plus the engine checks above if the engine changed.
6. One commit with what changed and the version numbers in the subject, for example `Shots decided by the expected-goal model (sim 0.34, site 0.42)`, then push. pmcdonough.com serves `public/` through Cloudflare.

## Working with Claude Code

Run Claude Code from the repo root so this file loads automatically. `LOCAL-SETUP.md` has the one-time setup; the first commands of a session are `python3 tools/build.py --check` (data and pages agree) and `node tools/smoke.js` (the page runs).

The sim's script is about 1,500 lines after the embedded data. Its sections are marked with `// ---------- Name ----------` comments and `docs/ENGINE.md` names the functions, so search for those rather than reading the whole file. The embedded data copies are generated by `tools/build.py`; never edit them by hand, edit `data/*.json` and rebuild.

The context that matters is in this file, `docs/ENGINE.md`, `docs/MODELING.md` and `docs/ROADMAP.md`. Until site 0.40 the repo was built in claude.ai chat and each version arrived as a full-repo zip, so the history is one commit per site version with a few upload-splitting commits around 0.39 and 0.40. Keep the one-commit-per-version habit.

## State (site 0.41)

All checks pass: `python3 tools/build.py --check`, `node tools/smoke.js`, `node tools/calibration.js`, `node tools/shifts.js`, `node tools/rules.js`, and all three data scripts reproduce their committed files from `raw/`. Baselines in `docs/ENGINE.md` were re-measured at sim 0.33. Nothing is half-done. The next piece of work, by priority, is in `docs/ROADMAP.md`; the first candidate is deciding shots from the expected-goal model.
