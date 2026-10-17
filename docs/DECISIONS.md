# Decisions

The decisions that shape the repo, each with when it was made, why, and what it costs. The newest are at the bottom. When a decision changes, add a new entry that replaces the old one rather than editing it, so the reasoning stays visible.

Each entry: **Decision.** Context. Consequences.

## Site

### 1. Static files only, no server (from the start)

**Everything runs in the visitor's browser from static files.** The projects are simulations and models; none needs a server, and a static site costs nothing and has nothing to keep patched. What a visitor keeps lives in their own `localStorage`. The cost: no accounts, no sharing of results except by link, and every computation has to be fast enough on a phone.

### 2. No build step, no framework, no runtime dependencies (from the start; confirmed at the restructure, site 0.51)

**The files in `public/` are exactly what the browser runs: HTML, CSS and ES modules.** The site has to keep working for years without upkeep, and a dependency tree is what breaks. Anyone can read the code with View Source. The cost: no TypeScript, no minification, and shared code has to be imported by path (decision 6). `tools/build.py`, which made a single-file version, was retired in site 0.51.

### 3. Pages are served over HTTP and fetch their data (2026-10-14)

**Opening a page from disk is not supported.** Fetching `data/*.json` and loading modules needs HTTP. A single file that worked from disk was kept for a while and dropped, because it meant every data file had to be inlined by a build. `tools/serve.js` serves `public/` locally, and every page check starts its own server.

### 4. Every file carries a `?v=` version stamp (site 0.51)

**Each page loads its files, and each module its imports, with its project's version in the URL.** Cloudflare's Worker already makes browsers revalidate every file, so stamps are not for caching; they make sure a visitor never mixes files from two deploys mid-push. `tools/bump.js` sets them, and `tools/smoke.js` fails if one disagrees or an import has none.

### 5. A site version and a version per project (site 0.31)

**The site is versioned on every commit that changes `public/`; each project only when it changes.** Visitors see each project's version on its card and in its footer. The changelog summary line says which project versions make up a site version. One commit per site version, with the versions in the subject.

### 6. Shared code is imported across folders, never copied (site 0.56; Three.js at site 0.94)

**Play Review imports the sim's `xg.js`, `rink.js` and `detmath.js`; Ring Kart imports Cathedral Lab's copy of Three.js.** Two copies of the expected-goal formula could disagree on a shot, and two copies of Three.js would load twice. The cost: one project's version stamp appears in another's imports, so `bump.js` updates those links too.

### 7. Three.js is the one library, vendored (site 0.85)

**Cathedral Lab's 3D needs WebGL, and writing a renderer is not the point of the project.** Three.js r128 is kept in `public/cathedral-lab/src/vendor/` and served from the site with Cathedral Lab's stamp, not from a CDN, so the site depends on nothing outside itself. The only change to the vendored files is OrbitControls' import path. `src/vendor/README.md` says how to upgrade.

### 8. Old addresses keep working (sim 0.66, Cathedral Lab 0.7)

**A renamed project keeps its folder, or leaves a forwarding page.** The Hockey Strategy Lab still lives at `/bruins-vs-canadiens/`; `/keystone/` forwards to `/cathedral-lab/`. Links people have shared must not break. Older changelog entries keep the name they had.

## Data and models

### 9. Every number someone might question lives in data, with a description and a source (v0.28)

**Engine thresholds live in `physics.json` and `systems.json`, never in code.** The product idea is a model a hockey person can question: they should be able to find a number, see where it came from and change it without reading code. The cost is one more lookup per number in the code (`PH.x.y`), and the discipline to write a `desc` for each.

### 10. Raw inputs stay out; the scripts and their compact outputs go in (v0.29)

**MoneyPuck CSVs and NHL JSON are kept in `raw/` (ignored); `tools/*.py` and their JSON outputs are committed.** The raw files are large and not ours to redistribute. Each script reproduces its committed output byte for byte from the inputs listed in `docs/RAW-INPUTS.md`, so the data can be audited. Outputs are never edited by hand.

### 11. Measured, calibrated and inferred numbers are kept apart (sim 0.50)

**`docs/MODELING.md` labels every model by kind; anything inferred is labeled on the page and never feeds a measured or calibrated number.** A model that mixes guesses into its measurements cannot be checked. Play Review's inferred positions and mocked replay movement say so on screen.

### 12. Shoot or pass is decided by the expected-goal model (sim 0.35)

**The carrier compares his own look with the best pass, both priced by the same model the stats use.** The earlier rate-based rules had players passing up open looks. The cost: the engine's chance count now honestly shows how many looks its defense gives up (20 to 30% too many), and one calibration factor keeps goals at the league rate while that is fixed (decision 14).

### 13. The engine is balanced at the NHL settings; Watch runs hotter (re-set in sim 0.62)

**Every multiplier at 1.0 is the calibrated game, and the Game plan lab always plays there. Watch's defaults run faster** (acceleration 1.8, speed 1.3, cruise 1.15, shot volume 2) because a realistic pace is slow to watch on a small rink. The defaults are checked for balance too: at acceleration 2.3 Montreal's man coverage took three quarters of the points, so it came down to 1.8 in sim 0.62.

### 14. One visible calibration factor instead of hidden tuning (sim 0.35 on)

**`goalie.tierGoalScale` scales every save roll so goals match the league, and its history is recorded with every value and why.** The engine creates too many chances; hiding that by quietly tuning several numbers would make the reality check lie. One factor, in plain sight, shows the gap and shrinks as the defense improves (0.39 to 0.98 so far).

## The engine

### 15. The engine never touches the page (sim 0.42, the restructure)

**`src/engine/` has no `document`, no `window`, no drawing; it exposes state and emits events.** That lets the same engine run in the page, in workers, on a second instance for the review, and in Node for the checks. The cost: anything the page shows has to come from state or an event, so a new display sometimes needs a new event.

### 16. Modules share one object through `install(S)` (sim 0.44)

**Each engine module adds its functions to a shared object and links to the others after all are installed.** The engine was one closure; this split it into files without rewriting how the code calls itself, and lets modules call each other in any direction. The cost is that a function's home is not obvious from its call, which `docs/ENGINE.md` (Where things live) answers.

### 17. A game depends only on its seed (sim 0.45)

**`newGame(seed)` gives the game its own generator and builds everything fresh; the engine never calls `Math.random`.** Without this a strategy comparison is not fair and no check can say "nothing changed". Unit tests check that a seed plays the same game whatever ran before it and that every draw is seeded.

### 18. The engine does its own math (sim 0.43)

**No `Math.sin`, `cos`, `atan2`, `exp`, `log`, `pow`, `hypot` or `**` in the engine; `detmath.js` computes them from exact arithmetic.** Browsers and Node may round those differently in the last bit, and that changed how 2 of 20 seeded games ended. Now a seed plays the same game in Node, Chromium, Firefox and WebKit. Cathedral Lab and Ring Kart replay no seeds and use `Math` freely.

### 19. All game state hangs off four roots (sim 0.55)

**`teams`, `puck`, `game` and `officials` hold everything; no module keeps state in its own variables.** That makes `snapshot()` and `restore()` exact, which What if he passed needs: it rebuilds the instant before a shot on a second engine and plays both choices out. A unit test fails if any module keeps state of its own.

### 20. One way to play a game (sim 0.37)

**The lab, the review and the Node tools all call the engine's own `newGame` and `tick`.** A second implementation, however small, would drift. The lab plays in workers, or on an engine of its own on the page when workers are not available, and `--pool` proves the workers match Node.

## Product

### 21. Watch and the Game plan lab are separate (sim 0.48)

**The lab has its own plans and always plays at the NHL settings; Watch's plans and sliders drive only the game on the rink.** Mixing them meant a visitor's slider change silently altered a strategy test. The cost: a button to copy the lab's plans to Watch.

### 22. The lab judges a change on the same games (sim 0.37)

**A test replays the baseline's seeds, and every verdict is a paired 95% interval: a clear edge, too close to call, or a clear cost.** Ten games cannot separate two close strategies, and a record needs thousands; net chances separate in about 100. The verdict never says more than the interval allows (decision 23).

### 23. The baseline leads with chances (sim 0.64, from the outside review)

**The headline states the chance balance first and attributes a points edge without one to finishing and goaltending.** A headline that led with points told people a plan worked when it was a lucky run.

### 24. Play Review moves into the sim (sim 0.53 on; its own view in 0.68)

**The shot review continues inside the sim as Review a game, where positions are exact; Play Review stays as the real-game prototype.** On a real game the other skaters' positions have to be inferred; in the sim they are known, so the review can be judged and played out. Play Review lost its home card in site 0.73 and is linked from the sim's.

### 25. Printing is the browser's job (sim 0.69)

**Print or save as PDF builds a report for the browser's print dialog; the page makes no PDF.** A PDF library would be the second dependency for a feature every browser already has. Review a game prints only the shot on screen, on one page (sim 0.70).

### 26. No goalie-interference call (sim 0.71)

**Attackers are kept out of the crease and off the goalie instead of a rule that waves off goals.** In the measured games no goal was scored with an attacker on the goalie, so the call would never fire. The NHL has not whistled a man for simply being in the crease since 1999.

## Process

### 27. Balance is measured, not eyeballed (sim 0.34; fingerprints per game at site 0.50)

**Every engine change runs 100 seeded games at each of two settings against saved references with a fingerprint per game.** A reference is re-saved only for an intended change, and the commit says so. GitHub runs the same checks on every push (site 0.68).

### 28. The rules live in `CLAUDE.md` (site 0.41)

**The rules of the road, the checks for each change and the shipping checklist are in one file that every Claude Code session loads.** The code is written by Claude across many sessions; one written set of rules is what makes them work alike. Anything learned the hard way goes into Lessons learned in `docs/ENGINE.md`.
