# Local setup

One-time setup of the repo on a Mac, the checks that prove it works, and the routine for working on it from Claude Code. Run everything from the repo root unless a step says otherwise.

## 1. Clone

```
cd ~/code                 # or wherever you keep code
git clone https://github.com/pmcdonough/patrick-site.git
cd patrick-site
```

## 2. Install the tools

Python, in a virtual environment (pandas and scikit-learn for the model fit; the other scripts use the standard library):

```
python3 -m venv .venv
.venv/bin/pip install -r tools/requirements.txt
```

Node and Playwright for the headless checks:

```
cd tools
npm install
npx playwright install chromium
cd ..
```

`.venv/`, `tools/node_modules/` and `raw/` are git-ignored.

## 3. Raw inputs (only to refit or re-ingest)

The pages and checks run without them. To rebuild the data, put the source files in `raw/` at the repo root. `docs/RAW-INPUTS.md` lists every file, the URL it comes from, the date it was retrieved and the command that uses it. Keep a copy of the two MoneyPuck shot files somewhere safe; they are 136 MB together and MoneyPuck can revise them.

## 4. Does it work?

```
python3 tools/build.py --check        # "stale embedded copies: sim none; play review none"
node tools/smoke.js                   # ends with "ERRORS: []"
```

`build.py --check` proves the data files and the copies embedded in both pages agree. `smoke.js` plays a full game headless and fails on any script error.

The version numbers should agree with the top of `CHANGELOG.md`:

```
head -3 CHANGELOG.md                                                        # Site 0.xx = sim 0.yy + Play Review 0.z
grep -o "Site v0\.[0-9]*" public/index.html                                 # the site version
grep -o "const VERSION = '[0-9.]*'" public/bruins-vs-canadiens/index.html   # the sim version
grep -o 'class="ver">v[0-9.]*' public/index.html                            # sim, then Play Review
```

## 5. Does the data reproduce?

With `raw/` in place, each script rebuilds its committed file. Nothing should change:

```
python3 tools/mp_extract.py raw --check                                     # "0 fields differ from the committed file"
python3 tools/game_load.py raw/play-by-play-2025020812.json raw/shiftcharts-2025020812.json
.venv/bin/python tools/xg_fit.py raw/shots_2024.csv raw/shots_2025.csv      # a few seconds
git status --short                                                          # clean
```

## 6. Does the site run?

Served (the pages fetch their data over HTTP):

```
python3 -m http.server --directory public 8000
# open http://localhost:8000/  http://localhost:8000/bruins-vs-canadiens/#lab  http://localhost:8000/play-review/
```

From disk (the pages fall back to embedded data): open `public/bruins-vs-canadiens/index.html` and `public/play-review/index.html` directly. The sim's Advanced tab, Data sources, says which copy is in use.

Things to click once: Lab tab, Games 10, Run this matchup (about 45 seconds), then open Reality check; Sweep one card; Play Review, pick a shot, play the replay. The browser console should stay clean.

The live site at pmcdonough.com serves `public/` through Cloudflare.

## 7. Baselines

`docs/ENGINE.md` has the numbers the engine hits and how they compare with the league. Re-measure after any engine change:

```
node tools/lab.js --nhl         # 100 games at the NHL-average tick: report vs league and the saved reference
node tools/lab.js               # the same at build defaults
node tools/shifts.js            # shift-length distribution and change windows
node tools/rules.js             # offsides and icings per game against league rates
```

A seeded `lab.js` run reproduces exactly, so "identical to the reference" means the engine plays the same games as before. To test a system: `node tools/lab.js --nhl --compare MTL.fore=131` or `--sweep BOS.entry`.

## 8. Working on it from Claude Code

Start Claude Code from the repo root so `CLAUDE.md` loads automatically. It has the rules (visible copy never mentions internals, every number lives in data, every page works from disk, balance is measured not eyeballed) and the shipping checklist.

The routine for any change:

```
# edit public/bruins-vs-canadiens/index.html and/or data/*.json
python3 tools/build.py           # re-embed data into both pages after any data edit
python3 tools/build.py --check
node tools/smoke.js
node tools/lab.js --nhl          # for any engine change; also tools/lab.js at build defaults
```

Then follow "Shipping a version" in `CLAUDE.md`: bump the versions, add a changelog section, one commit with the version numbers in the subject, push.

What to work on next is in `docs/ROADMAP.md`.
