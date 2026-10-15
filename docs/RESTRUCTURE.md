# Restructure plan: the sim and Play Review as modules

Status: steps 0 (site 0.50), 1 (site 0.51), 2 (sites 0.52 to 0.54) 3 (site 0.55) and 4 (site 0.56) done; step 5 next. Step 4 imports `xg.js`, `rink.js` and `detmath.js` from the sim's `engine/` folder rather than moving them to `public/shared/`: they are engine code, and inside the sim's folder their own imports carry the sim's stamp. Of the unit tests listed in step 3, two are not written: one save roll per shot and the penalty-kill clear distance need a hook inside `movePuck` or a long statistical run; `tools/lab.js` and the step 0 references cover them for now. Step 2 landed a little differently from the layout below: the game state stayed in `engine/sim.js` (no `state.js`), the officials got their own module, the engine's math is `engine/detmath.js`, and `rink.js` and `xg.js` sit in `engine/` until step 4 decides how Play Review shares them. Written at site 0.49, sim 0.40, Play Review 0.6.

The sim is one HTML file of about 5,400 lines: 250 of CSS, 230 of markup, 2,900 of embedded data (the expected-goal model alone is one 93,000-character line) and 2,000 of script, all of it inside one `startSim(DATA)` closure. Play Review is the same shape at 1,300 lines. This plan moves both onto plain ES modules served over HTTP, in steps that each ship on their own and each prove the engine still plays the same hockey.

## Why

- **The engine cannot run without a browser.** Every tool, `tools/lab.js` included, starts Chromium to call `tick()`. With the engine as a module, the tools import it in Node: faster, simpler, and testable with `node:test`.
- **The workers run behind a stand-in page.** Test a strategy loads the page's whole script into each worker behind a Proxy that swallows every element access (`WORKER_PRELUDE`). It is verified identical to the page, but it is a workaround. With the engine as a module, the worker imports it.
- **The expected-goal formula lives twice.** The engine and Play Review each carry `xgModel`, under a rule to change both or neither. One shared module ends the rule.
- **The file is hard to work in.** Searches hit the embedded data, a change to the expected-goal model is a diff of one 93,000-character line, and every change touches the same file.

## Decisions already made

- **Served over HTTP only.** Opening a page from disk is dropped (decided 2026-10-14). Pages fetch `data/*.json`; the embedded copies and their sync in `tools/build.py` go away.
- **Native ES modules, no bundler to start.** Browsers load `import` and module workers directly. Add esbuild only for a measured need: first load over 1 second on a normal connection, more than about 40 module files, or a reason to minify.
- **No framework, no TypeScript to start.** It is a canvas app with plain controls. JSDoc with `// @ts-check` gives type checking without a compile step if we want it.
- **Hosting does not change.** Cloudflare keeps serving `public/` from git. Source files live under `public/` so they are served as they are; there is no build output to commit.
- **Engine behavior does not change.** No tuning, no rules, no new features in any step of this plan. Every step must leave `node tools/lab.js --nhl` and `node tools/lab.js` saying "identical to the reference".

## Target layout

```
public/
  shared/
    xg.js                 xgModel, xgTier, finishing lookup: the one copy, used by the sim and Play Review
    rink.js               rink geometry constants (RW, RH, goal lines, blue lines, net size), toFx/toRink helpers
  bruins-vs-canadiens/
    index.html            markup only: header, views, drawers, About; one <link> and one <script type="module">
    style.css             the CSS, as it is today
    data/*.json           unchanged
    src/
      main.js             loads data, creates the sim, wires the UI, starts the frame loop
      version.js          VERSION, and the stamp every import path carries
      engine/             no access to the page at all: runs in a browser, a worker or Node
        sim.js            createSim(DATA, options) and tick: the public face of the engine
        state.js          teams, game, puck, newGame and its resets
        rosters.js        buildRosters, mkSkater, mkGoalie (ratings from the data files)
        lines.js          rotation patterns, buildUnit, stoppage and on-the-fly changes, matchLines
        formations.js     formationSpot, manMarks, slot coverage, penalty-kill slots
        ai.js             assignTargets, carrierThink, readLook, lookXg, pass, shoot, chip, clears
        physics.js        movePlayers, movePuck, saves, rebounds, freezes, keepOnIce, keepOffNets
        rules.js          offside, icing, penalties, box releases, period ends, overtime, shootout
        rng.js            seeded generator (the same mulberry the tools use)
      lab/
        jobs.js           runJobs: the worker pool, the queue, the in-page fallback
        worker.js         module worker: imports the engine, plays a job, posts a row
        stats.js          mean, 95% intervals, paired differences, verdicts
      ui/
        render.js         canvas drawing: rink, benches, players, sticks, effects, sight lines, officials
        hud.js            scoreboard strip, box score, play by play, roster sheets
        views.js          view switching, the three steps, drawers, explainers, glossary terms
        plans.js          game-plan drawer, plan sentences, saved plans, engine settings sliders
        test.js           Test a strategy: plan A and plan B, run, rank, results
        real.js           How real is it
  play-review/
    index.html, style.css, src/main.js ... and imports ../../shared/xg.js
tools/
  serve.js                a small static server inside the tool process, for the Playwright checks
  lab.js, shifts.js, rules.js, nhl-average.js   import the engine in Node; no browser
  smoke.js, calibration.js                      Playwright against served pages: the page itself
```

## The seam: what the engine takes and gives

Today the engine reads the page in a few places and writes to it in a few more. After step 2 it does neither:

| Today | After |
|---|---|
| Tactics read from the dropdowns (`readTactics`) | `sim.setTactics(teamIndex, { fore, brk, entry, oz, dz, pp, pk, agg })`; the UI calls it on every change |
| Engine settings set by the sliders | `sim.cfg`, a plain object the UI writes to |
| `log()` writes the play by play (16 calls) | `sim.on('log', (text, cls) => ...)`; the UI renders it |
| `recordResult` writes the session record into the page | `sim.on('final', result => ...)` |
| `fxRing`, the save flash and the goal light are set from inside the puck code | `sim.on('fx', (kind, data) => ...)`; effects state lives in the renderer |
| `fxTick` runs inside `tick` (trails, ring timers) | runs in the renderer each frame; it draws no random numbers, so moving it does not change any game |
| `window.__noDrift` debug flag in the formations | `createSim(DATA, { drift: false })` |
| State in closure variables the drawing code reaches into | `sim.state` (`teams`, `game`, `puck`), read-only by convention for the UI |

`window.rinkSim` stays as a test hook that points at the same object.

## Steps

Each step is a site version, ships on its own, and keeps the site working. The checks listed are the bar for calling a step done.

### Step 0: the safety net

- **Per-game fingerprints.** `tools/baselines.json` holds means to three decimals today. Add a hash of every game's final numbers to the reference, so a change that nudges one game in a hundred is caught too. `--save` writes it; the report prints "identical" only when every hash matches.
- **Order independence as a check.** `node tools/lab.js --games 20 --workers 1` against `--workers 3` must give the same rows. It caught two bugs in 0.34 and 0.37; make it part of the routine.
- **A served-page harness.** `tools/serve.js` serves `public/` from inside the tool process (my sandbox's `python3 -m http.server` refused connections twice). `tools/harness.js` loads pages over HTTP instead of from the file's text.
- **Play Review fingerprint.** A dump of every shot it scores (xG of the real shot and of each alternative) to compare before and after step 4.
- Checks: everything passes as today; references re-saved with fingerprints.

### Step 1: move the pieces out, change no logic

- CSS to `style.css`. Markup stays in `index.html`. The script moves to `src/main.js` as one module, `startSim` closure intact.
- Delete the seven embedded data blocks and the embed step; the loader fetches `data/*.json` only. `tools/build.py` shrinks to a data check (valid JSON, the schema fields present) or is retired.
- Workers: `src/lab/worker.js` installs the same stand-in as today and imports `main.js`. Still the workaround, now in its own file.
- Version-stamped imports: every import path carries `?v=` from `version.js`, so a visitor never mixes a new `engine.js` with an old `ui.js` after a deploy.
- Checks: references identical with fingerprints; smoke over HTTP; workers match `tools/lab.js` for 20 seeds; the page loads with no errors on the live site after the push.

### Step 2: the engine comes out of the closure

This is the big step, about 1,300 lines of engine. Done in this order, each a separate commit that keeps the references identical: `shared/rink.js` and `shared/xg.js`, then `rosters.js`, `state.js`, `rules.js`, `lines.js`, `formations.js`, `ai.js`, `physics.js`, and last `sim.js` with `tick`. Shared state moves from closure variables to one context object the engine modules receive.

- The seam above: tactics and settings in, events out.
- The worker imports `engine/sim.js` directly; `WORKER_PRELUDE` and the stand-in are deleted.
- `tools/lab.js`, `shifts.js`, `rules.js` and `nhl-average.js` import the engine in Node and drop Playwright. Keep one cross-check: 20 seeds played by the page's workers must match the Node run.
- Checks: references identical; order independence; the cross-check; smoke; a lab.js timing before and after (Node should be faster).

### Step 3: randomness and fresh state, made structural

- **Seeded generator passed in.** Today seeding works by replacing the global `Math.random` in three places (`tools/lab.js`, the worker, the in-page runner). The engine gets `rng` from `createSim`; its 28 draws and the `rnd` helper call it. Watching a game passes `Math.random`. The draws stay in the same order, so seeded games stay identical.
- **Fresh state per game.** `newGame` resets a list of fields, and twice a field was missed. Build each game's mutable state from one factory instead, so nothing can leak. If the references change here, that is a leak the reset list was hiding; find it before re-saving.
- **Unit tests** with `node:test`: same seed same game in any order; the reset leaves no field behind; `xgModel` against values from the fit file; icing waived while shorthanded; the penalty-kill clear goes past the far dots; a shot gets one save roll.
- Checks: references identical (or explained and re-saved); `node --test` passes.

### Step 4: Play Review on the shared modules

- Play Review moves to `index.html`, `style.css` and `src/`, imports `shared/xg.js` and `shared/rink.js`, and fetches its data. The rule "the expected-goal formula lives in two places" comes out of CLAUDE.md.
- Its hard-coded `OZ` table stays for now (it is roadmap work, not restructure work).
- Checks: the Play Review fingerprint from step 0 is identical; the page loads with no errors.

### Step 5: docs and rules

- CLAUDE.md: the single-file and open-from-disk rules, the "re-embed after a data edit" rule, the layout, the check routine.
- LOCAL-SETUP.md: a local server is required; the new checks (`node --test`, the Node tools).
- README, ENGINE.md (file structure, the seam, where each function lives), MODELING.md (xG in one place), XG-MODEL.md, RAW-INPUTS.md (no re-embed step).
- Checks: a fresh clone follows LOCAL-SETUP.md to a passing run.

## Found along the way

- **Math differs between JavaScript engines.** At step 2 the first Node run differed from Chromium in 2 of 20 games. Chromium 156 and Node 26 return different last bits from `Math.sin`, `cos`, `atan2`, `exp` and `log` for a fifth of all inputs, and other browsers use other libraries. Sim 0.43 gives the engine its own versions (`engine/detmath.js`), built from exact arithmetic; the references were re-saved once for it. Only `+ - * /`, `Math.sqrt` and the rounding and comparison functions are exact by the language's rules.
- **Worker threads are slower than processes here.** Eight Node worker threads in one process ran at about half speed each; eight child processes do not. `tools/lab.js` uses child processes.

## Risks and how each is caught

| Risk | Caught by |
|---|---|
| A random draw moves, so every seeded game changes | the per-game fingerprints, at the commit that moved it |
| State leaks from one game to the next | order independence, and in step 3 the reset test |
| The engine still reads the page somewhere | running it in Node: there is no `document`, so it fails at once |
| A visitor's browser mixes old and new files after a deploy | version-stamped import paths |
| The engine gets slower | lab.js timing before and after each step |
| Play Review scores shots differently | its fingerprint |
| The tools break mid-way | each step updates the tools it touches and runs all of them |

## Not in this plan

Engine tuning, the defense work at the top of the roadmap, new features, a framework, TypeScript, a bundler (see the criteria above), and CI. A GitHub Action running the Node checks on every push is a small follow-on once step 2 lands.

## Size

Step 0 and step 1 are small, a session together. Step 2 is the bulk of the work, one to two sessions. Steps 3, 4 and 5 are a session together. Nothing visible changes for a visitor at any point, other than a faster strategy test if Node and module workers turn out quicker.

## Open questions

- **Which Cloudflare product serves the site.** Answered 2026-10-15: a Cloudflare Worker named `patrick-site` with static assets only (no script, no bindings), deployed from `pmcdonough/patrick-site` on every push, with `pmcdonough.com` as a custom domain and `patrick-site.patrickmcdonough.workers.dev` as its default address. Workers static assets read a `_headers` file at the root of the assets directory, so step 1 could add `public/_headers` with short cache times as a second guard on top of stamped imports. It turned out not to be needed: the Worker already serves every file, scripts and data included, with `Cache-Control: public, max-age=0, must-revalidate`, so browsers check for a new copy on every load. The stamps cover the moment of a deploy itself. The repo has no Wrangler config file, so the build settings (the assets directory) live in the dashboard under the Worker's Settings, Build; the new files are all under `public/`, so nothing there needed to change.
- **`tools/build.py` after step 1.** Retired at step 1. `tools/smoke.js` loads every page over HTTP and fails on a data file that does not load or parse; step 3's `node --test` can check the data's shape.
