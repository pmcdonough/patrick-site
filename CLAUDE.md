# CLAUDE.md

Project memory for anyone (or any Claude session) working on this repo. Read this first, then `docs/ENGINE.md` before touching the hockey engine.

## What this repo is

A static personal site in `public/`. The main project is the Bruins vs Canadiens hockey engine at `public/bruins-vs-canadiens/index.html`: one HTML file, plain JavaScript on a 2D canvas, no libraries, no build step, driven by the JSON files in `public/bruins-vs-canadiens/data/`.

## Layout

```
public/index.html                         home page (card for each project, version badge)
public/bruins-vs-canadiens/index.html     the engine: CSS, markup, embedded data copies, script
public/bruins-vs-canadiens/data/*.json    the data that drives it (rosters, ratings, systems, physics, moneypuck-2025, defaults, xg-model)
public/play-review/index.html             shot versus pass review of a real game; embeds xg-model, systems and its game file (fetch first, embedded fallback)
public/play-review/data/game-*.json       one file per game, from tools/game_load.py
tools/build.py                            re-embeds data/*.json into index.html; --check verifies
tools/xg_fit.py                           fits data/xg-model.json from MoneyPuck shot CSVs (not in the repo; download from moneypuck.com)
tools/game_load.py                        NHL play-by-play + shift chart JSON -> play-review game file
tools/*.js                                headless Playwright checks (smoke, calibration, nhl-average, shifts, rules)
docs/ENGINE.md                            how the engine is organized, invariants, tuning knobs, lessons learned
docs/HISTORY.md                           what was built before version numbers existed, in order
docs/XG-MODEL.md                          the expected-goal model and how the engine scores shots with it
docs/PLAY-REVIEW.md                       the review page's pipeline, reconstruction, scoring and replay
docs/MODELING.md                          index of every model: measured, calibrated or inferred, and where it lives
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
- Raw inputs (MoneyPuck CSVs, NHL JSON) stay out of the repo; the fitted model and the compact game file go in. Re-run the fit script, not the numbers, when the data changes.
- The expected-goal formula lives in two places, the engine (`xgModel`) and the review page; change both or neither.
- The engine is balanced at the NHL-average multipliers (every slider at 1.0, the tick mark). The build defaults in `defaults.json` deliberately run hotter (acceleration 2.3, speed 1.3, cruise 1.15, shot volume 2) because it is more fun to watch. Calibrate at 1.0, then check that the defaults still look right.

## Shipping a version

The site has its own version (the zip name and the Site section of the changelog); each project keeps its own number. Bump the site version on every drop, and the project version only when that project changed.

1. Bump `const VERSION = '0.xx'` near the top of the script in `index.html`.
2. Add a section to `CHANGELOG.md`.
3. Update the badge in `public/index.html` (`<span class="ver">v0.xx</span>`).
4. Run `python3 tools/build.py --check` and `node tools/smoke.js`.
5. Commit the page, the data folder and the changelog together.

## Working with Claude

Chat (claude.ai): attach `index.html` and the data files you are changing, or paste the relevant function. The script is about 1,500 lines after the embedded data; the sections are marked with `// ---------- Name ----------` comments and `docs/ENGINE.md` names the functions, so point at those rather than pasting the whole file.

Claude Code (CLI): run it from the repo root so this file loads automatically. Useful first commands: `node tools/smoke.js` to confirm the page runs, `python3 tools/build.py --check` to confirm data and page agree.

Either way, the context that matters is in this file, `docs/ENGINE.md` and `docs/HISTORY.md`. The chat transcript that produced the engine is not needed to continue it.
