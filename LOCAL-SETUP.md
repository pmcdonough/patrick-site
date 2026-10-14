# Local setup and verification

One-time setup of the repo on a Mac, then the checks that prove everything from the chat drops arrived, then the routine for working on it from Claude Code. Run everything from the repo root unless a step says otherwise.

## 1. Clone and lay out the folders

```
cd ~/Projects            # or wherever you keep code
git clone https://github.com/pmcdonough/patrick-site.git
cd patrick-site
```

Put the raw inputs beside the code, not in git:

```
mkdir -p raw
# unzip into raw/: skaters.csv, goalies.csv, teams.csv, lines.csv, shots_2024.csv, shots_2025.csv,
# play-by-play-2025020812.json, shiftcharts-2025020812.json, README.md
# (from patrick-site-v0.39.zip's raw/ folder plus raw-shots_2024.zip and raw-shots_2025.zip)
ls raw
```

Confirm git ignores it:

```
cat .gitignore            # should list raw/, node_modules/, package-lock.json, __pycache__/, .DS_Store
git status --short        # raw/ must not appear
```

If `raw/` shows up as untracked, `.gitignore` did not make it to GitHub. Create it with those five lines and commit it. If `raw/` is already tracked on GitHub from the web upload, untrack it once:

```
git rm -r --cached raw
git commit -m "Untrack raw inputs"
```

## 2. Install the tools

Python (pandas and scikit-learn for the model fit; the other scripts use the standard library):

```
pip3 install -r tools/requirements.txt
```

Node and Playwright for the headless checks (once):

```
cd tools
npm install
npx playwright install chromium
cd ..
```

## 3. Did everything arrive?

Each line has an expected result. Anything else means a file from a drop is missing or stale.

```
grep -o "Site v0\.[0-9]*" public/index.html          # Site v0.39
grep -o "const VERSION = '[0-9.]*'" public/bruins-vs-canadiens/index.html   # '0.33'
grep -o 'class="ver">v[0-9.]*' public/index.html     # v0.33 and v0.6
head -3 CHANGELOG.md                                  # mentions Site 0.39 = sim 0.33 + Play Review 0.6
ls docs                                               # ENGINE.md HISTORY.md MODELING.md PLAY-REVIEW.md ROADMAP.md XG-MODEL.md
ls tools                                              # build.py calibration.js game_load.py harness.js mp_extract.py nhl-average.js
                                                      # package.json requirements.txt rules.js shifts.js smoke.js xg_fit.py
ls public/bruins-vs-canadiens/data                    # defaults moneypuck-2025 physics ratings rosters systems xg-model (.json)
ls public/play-review/data                            # game-2025020812.json
```

Then the two checks that matter most:

```
python3 tools/build.py --check        # "stale embedded copies: sim none; play review none"
node tools/smoke.js                   # ends with "ERRORS: []"
```

`build.py --check` proves the data files and the copies embedded in both pages agree. `smoke.js` plays a full game headless and fails on any script error.

## 4. Does the data reproduce?

This proves the raw inputs and the scripts match the committed files. Nothing should change.

```
python3 tools/mp_extract.py raw --check                                   # "0 fields differ from the committed file"
python3 tools/game_load.py raw/play-by-play-2025020812.json raw/shiftcharts-2025020812.json
python3 tools/xg_fit.py raw/shots_2024.csv raw/shots_2025.csv            # about a minute
git status --short                                                        # clean, or only whitespace in xg-model.json
```

If `git status` shows `xg-model.json` changed, run `git diff --stat` on it; a one-line formatting diff is fine, a coefficient change is not. `git checkout` the file to restore it either way.

## 5. Does the site run?

Served (the pages fetch their data over HTTP):

```
python3 -m http.server --directory public 8000
# open http://localhost:8000/  http://localhost:8000/bruins-vs-canadiens/#lab  http://localhost:8000/play-review/
```

From disk (the pages fall back to embedded data): double-click `public/bruins-vs-canadiens/index.html` and `public/play-review/index.html`. The sim's Advanced tab, Data sources, says which copy is in use.

Things to click once: Lab tab, Games 10, Run this matchup (about 45 seconds), then open Reality check; Sweep one card; Play Review, pick a shot, play the replay. The browser console should stay clean.

## 6. Baselines, worth re-measuring once

The baselines in `docs/ENGINE.md` are from sim 0.29. Nothing since should have moved them, but nobody re-measured after the lab was added. Run these and update that section if the numbers drifted:

```
node tools/calibration.js       # ten-game matchup at build defaults: record and reality check
node tools/nhl-average.js       # six games with every multiplier at 1.0 (the calibrated tick)
node tools/shifts.js            # shift-length distribution and change windows
node tools/rules.js             # offsides and icings per game against league rates
```

At the NHL-average tick expect roughly 21 to 27 shots on goal, 3.5 to 4.3 goals, 3 offsides and 5 icings per team per game, mean shift about 49 s.

## 7. Working on it from Claude Code

Start Claude Code from the repo root so `CLAUDE.md` loads automatically. It names the rules (visible copy never mentions internals, every number lives in data, every page works from disk, balance is measured not eyeballed) and the shipping checklist.

The routine for any change:

```
# edit public/bruins-vs-canadiens/index.html and/or data/*.json
python3 tools/build.py           # re-embed data into both pages after any data edit
python3 tools/build.py --check
node tools/smoke.js
node tools/calibration.js        # for anything touching shots, goalies or decisions
```

Shipping a version (also in CLAUDE.md): bump `const VERSION` in the sim page if the sim changed, bump the site version in `public/index.html`'s footer every drop, update the card badge if a project changed, add a section to `CHANGELOG.md`, commit everything together with the version numbers in the subject, push.

What to work on next is in `docs/ROADMAP.md`; the first candidate is deciding shots from the expected-goal model instead of the geometric shot quality.

## 8. Housekeeping worth doing on the first local session

- Move `raw/README.md` to `docs/RAW-INPUTS.md` so the source map lives in the repo, not only in the ignored folder.
- Decide what the root `index.html` and `assets/` on GitHub are for (they are not from the drops) and either keep them or remove them.
- Delete the `raw/` folder that reached GitHub from the web upload if step 1 did not already.
- Save the two shot zips somewhere safe; they are the only inputs over 25 MB and the only ones not in `raw/README.md`'s download instructions by direct link (MoneyPuck's download page has them).
