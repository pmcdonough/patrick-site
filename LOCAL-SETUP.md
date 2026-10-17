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

Node (version 22 or later) for the engine checks, and Playwright for the checks that load the pages:

```
cd tools
npm install
npx playwright install chromium
npx playwright install firefox webkit   # optional: only tools/browsers.js uses them
cd ..
```

`.venv/`, `tools/node_modules/` and `raw/` are git-ignored.

## 3. Raw inputs (only to refit or re-ingest)

The pages and checks run without them. To rebuild the data, put the source files in `raw/` at the repo root. `docs/RAW-INPUTS.md` lists every file, the URL it comes from, the date it was retrieved and the command that uses it. Keep a copy of the two MoneyPuck shot files somewhere safe; they are 136 MB together and MoneyPuck can revise them.

## 4. Does it work?

```
node --test tools/test               # the unit tests: "fail 0" (about 25 s)
node tools/smoke.js                   # ends with "ERRORS: []"
```

The unit tests run the engine in Node. `smoke.js` serves `public/` itself, plays a full game in headless Chromium, loads the home page, Play Review and both Cathedral Lab pages (the 3D build has to start its 3D graphics), and fails on any script error, any data file that does not load, or any `?v=` version stamp that disagrees with its project's version.

The version numbers should agree with the top of `CHANGELOG.md`:

```
head -3 CHANGELOG.md                                                              # Site 0.xx = sim 0.yy + Play Review 0.z + Cathedral Lab 0.w
grep -o "Site v0\.[0-9]*" public/index.html                                       # the site version
grep -o "const VERSION = '[0-9.]*'" public/bruins-vs-canadiens/src/main.js        # the sim version
grep -o "const VERSION = '[0-9.]*'" public/play-review/src/main.js                # the Play Review version
grep -o "const VERSION = '[0-9.]*'" public/cathedral-lab/src/main.js public/cathedral-lab/arch-lab/src/main.js   # Cathedral Lab, both pages
grep -o 'class="ver">v[0-9.]*' public/index.html                                  # the card badges: sim, then Cathedral Lab
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
# open http://localhost:8000/  http://localhost:8000/bruins-vs-canadiens/#lab  http://localhost:8000/play-review/
#      http://localhost:8000/cathedral-lab/  http://localhost:8000/cathedral-lab/arch-lab/
```

The pages need a server: opened straight from disk they cannot load their data or modules.

Things to click once: Edit plan and change a choice; Sight lines on and off; Settings; Open the Game plan lab, Games 10, Run the baseline, open the comparison with the real teams, change a choice and Test against the baseline, rank every option for one choice, go to Watch and back (the results stay), Watch these plans in a game; Play Review, pick a shot, play the replay. Cathedral Lab: Start building, Next step a few times, a bag, Color by load, Cutaway, tap a stone; the arch lab: Build to keystone, Strike centering, each Try this. The browser console should stay clean.

The live site at pmcdonough.com serves `public/` through Cloudflare.

## 7. The full set of checks

`docs/ENGINE.md` has the numbers the engine hits and how they compare with the league. The "Checks" table in `CLAUDE.md` says which to run for which change; all of them:

```
node --test tools/test          # unit tests
node tools/smoke.js             # the pages load and run, the version stamps agree
node tools/lab.js --nhl         # 100 games at the NHL-average tick: report vs league and the saved reference
node tools/lab.js               # the same at build defaults
node tools/lab.js --games 20 --order --pool   # every game identical replayed in reverse order, and in the page's own workers
node tools/shifts.js            # shift-length distribution and change windows
node tools/rules.js             # offsides and icings per game against league rates
node tools/review.js            # every shot Play Review scores, against its reference
node tools/calibration.js       # a ten-game baseline in the Game plan lab through the page's controls
node tools/browsers.js          # the same seeded games in Chromium, Firefox and WebKit as in Node
```

`lab.js`, `shifts.js`, `rules.js`, `nhl-average.js` and the unit tests run the engine in Node; the others load the pages in a browser, serving `public/` themselves, so no server needs to be running. A seeded `lab.js` run reproduces exactly, and the reference keeps a fingerprint of every game, so "identical to the reference" means all 100 games finished exactly as before. To test a system: `node tools/lab.js --nhl --compare MTL.fore=131` or `--sweep BOS.entry`.

## 8. Working on it from Claude Code

Start Claude Code from the repo root so `CLAUDE.md` loads automatically. It has the rules (visible copy never mentions internals, every number lives in data, the engine never touches the page and draws every random number from the game's own generator, balance is measured not eyeballed), the checks for each kind of change, and the shipping checklist.

The routine for any change: edit (the engine in `public/bruins-vs-canadiens/src/engine/`, the sim's page in its `src/main.js`, `style.css` and `index.html`, the data in `data/*.json`), run the checks from the table in `CLAUDE.md`, then follow "Shipping a version": bump the versions and stamps, add a changelog section, one commit with the version numbers in the subject, push.

What to work on next is in `docs/ROADMAP.md`.
