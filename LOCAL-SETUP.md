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
node tools/smoke.js                   # ends with "ERRORS: []"
```

`smoke.js` serves `public/`, plays a full game headless, loads the home page and Play Review, and fails on any script error or any data file that does not load. It also checks that the sim's `?v=` stamps match its version.

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
node tools/serve.js                   # or: python3 -m http.server --directory public 8000
# open http://localhost:8000/  http://localhost:8000/bruins-vs-canadiens/#test  http://localhost:8000/play-review/
```

The pages need a server: opened straight from disk they cannot load their data or modules.

Things to click once: each of the three steps in the header; Edit plan and change a choice; Sight lines on and off; Test a strategy, Games 10, change a plan B choice, Run plan A and plan B, then How real is it; Rank the options for one choice; Play Review, pick a shot, play the replay. The browser console should stay clean.

The live site at pmcdonough.com serves `public/` through Cloudflare.

## 7. Baselines

`docs/ENGINE.md` has the numbers the engine hits and how they compare with the league. Re-measure after any engine change:

```
node tools/lab.js --nhl         # 100 games at the NHL-average tick: report vs league and the saved reference
node tools/lab.js               # the same at build defaults
node tools/shifts.js            # shift-length distribution and change windows
node tools/rules.js             # offsides and icings per game against league rates
node tools/lab.js --games 20 --order   # every game identical when replayed in reverse order on one page
node tools/review.js            # every shot Play Review scores, against its reference
```

The checks serve `public/` themselves and load the pages over HTTP, so no server needs to be running. A seeded `lab.js` run reproduces exactly, and the reference keeps a fingerprint of every game, so "identical to the reference" means all 100 games finished exactly as before. To test a system: `node tools/lab.js --nhl --compare MTL.fore=131` or `--sweep BOS.entry`.

## 8. Working on it from Claude Code

Start Claude Code from the repo root so `CLAUDE.md` loads automatically. It has the rules (visible copy never mentions internals, every number lives in data, every page is served over HTTP, balance is measured not eyeballed) and the shipping checklist.

The routine for any change:

```
# edit public/bruins-vs-canadiens/src/main.js, style.css, index.html and/or data/*.json
node tools/smoke.js
node tools/lab.js --nhl          # for any engine change; also tools/lab.js at build defaults
```

Then follow "Shipping a version" in `CLAUDE.md`: bump the versions, add a changelog section, one commit with the version numbers in the subject, push.

What to work on next is in `docs/ROADMAP.md`.
