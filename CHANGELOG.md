# Changelog

The site is versioned as a whole; each project keeps its own number too. Site 0.77 = sim 0.64 + Play Review 0.10. Site versions before 0.31 tracked the sim's number.

## Site

### 0.77
- Sim 0.64 (fixes from an outside review of the Game plan lab). No change to play. The lab's headline and game order live in a small module of their own with a unit test (`tools/test/lab.test.js`, 15 tests now). `docs/ENGINE.md` explains the lopsided games under man-on-man.

### 0.76
- Sim 0.63 (Game plan lab: test titles, fold and remove, the run card). No change to play.

### 0.75
- Sim 0.62 (Watch balance, pinned shifts). `tools/lab.js --param cfg.accel=1.5` tries a multiplier. References re-saved at both levels.

### 0.74
- Sim 0.61 (pass coverage, first pass). The home page says a quarter more chances, not a third. References re-saved at both levels.

### 0.73
- Home page: Play Review's card is gone (the page stays at its address, linked from the sim's card as the first prototype). The sim's card spans the page, its picture a banner, with a short section each on the Game plan lab, Watch a game, Review this game and how it is built.

### 0.72
- Sim 0.60 (shots hit the net at the league's rate). `tools/xg_fit.py` also writes the on-net share by danger tier (`onNetByTier`); re-run, the rest of `xg-model.json` is unchanged. References re-saved at both levels.

### 0.71
- Sim 0.59 (zone coverage plays the carrier from the inside). References re-saved at both levels.

### 0.70
- Sim 0.58 (man coverage plays the carrier from the inside). References re-saved at both levels.

### 0.69
- Sim 0.57 (every goal beats a save roll). Lab games open on the Watch rink. References re-saved at both levels. A unit test checks every goal beat a save roll (fails on 0.56).

### 0.68
- A GitHub Action (`.github/workflows/checks.yml`) runs the checks on every push: unit tests and both reference levels (Node only), then the smoke test, the order and pool checks and Play Review's reference in headless Chromium.
- `tools/lab.js` exits 1 when the same games as the reference finish differently (not with `--save` or `--param`), so CI fails on an unannounced change to play. Repeated `--param` flags now add up; before, only the last applied, which invalidated two of the experiments behind sim 0.56's notes (corrected in `docs/ROADMAP.md`; re-measured, the conclusions held except one that is now marked untested).
- Under the hood mentions the GitHub checks.

### 0.67
- Sim 0.56 (angling on the rush). `tools/lab.js --param` also takes systems.json values (`--param systems.defensiveZone.zone.slotCoverage.maxFx=44`). References re-saved at both levels.

### 0.66
- Sim 0.55 (What if he passed). Under the hood describes snapshots and the what-if.

### 0.65
- Sim 0.54 (Sim to the final horn).
- Under the hood (`public/under-the-hood/`): the site's architecture and stack, the engine's tick, how a seed plays the same game everywhere, the models, the checks, shipping, and how it was built with Claude. Reached only from an easter egg, the site version in the home page footer, and kept out of search engines.

### 0.64
- Sim 0.53 (Review this game). Home page: the sim's card mentions the review; Play Review's card calls itself the early prototype the review grew from.

### 0.63
- Sim 0.52 (Find the best option).

### 0.62
- Sim 0.51 (the Game plan lab's results read more plainly; every shot attempt is filed). The page no longer scrolls sideways on a phone in the lab. `tools/lab.js` counts a teammate's block in unblocked attempts; both references re-saved for the block counts alone (every goal, shot and expected goal identical).

### 0.61
- Documentation sweep, in the apps and in the repo. Home page: the sim's card points to how the models work. Repo: `docs/MODELING.md` gains a technical summary of the engine as a model (state and time, kinematics, the decision policy, the outcome models, calibration, the lab's inference) and a table of what full tracking data would change in each model; `README.md` gains a modeling section; `docs/XG-MODEL.md` and `docs/PLAY-REVIEW.md` gain their own tracking sections; stale details fixed across `README.md`, `MODELING.md` (save scale, file locations, the lab's statistics), `XG-MODEL.md` (file locations, sim 0.29 numbers labeled), `PLAY-REVIEW.md`, `ENGINE.md` (the 0.35 system effects flagged for a re-run), `ROADMAP.md` and `LOCAL-SETUP.md`.

### 0.60
- Sim 0.49 (the Game plan lab reads top to bottom).

### 0.59
- Sim 0.48 (the Game plan lab). Home page card describes the lab and links to it. `tools/calibration.js` runs a ten-game baseline in the lab.

### 0.58
- Sim 0.47. `tools/bump.js` sets a project's version and every `?v=` stamp that carries it in one command.

### 0.57
- Sim 0.46. A new unit test plays the two seeds that froze and fails if the puck sits loose and still for more than 5 seconds or a shift runs past 3 minutes.

### 0.56
- Play Review 0.9 (restructure step 4). `tools/smoke.js` checks both projects' version stamps, including Play Review's imports from the sim.

### 0.55
- Sim 0.45 (restructure step 3). Unit tests: `node --test tools/test` (8 tests, about 20 s): a seed plays the same game whatever came before it, a new game keeps nothing from the last one, every random draw in a seeded game comes from its generator, no icing on a shorthanded team, the plan drawer offers only defined systems, the engine's math within one unit in the last place, and the expected-goal model against the fit script's grid. Each of the first three was checked by breaking the engine on purpose and watching it fail.

### 0.54
- Sim 0.44 (restructure step 2 done: the engine split into modules).

### 0.53
- Sim 0.43. The engine's checks run in Node with no browser: `tools/engine.js` sets the engine up the way a fresh visit to the page does, and `lab.js` (in child processes, 100 games in about 40 s), `shifts.js`, `rules.js` and `nhl-average.js` use it. `shifts.js`, `rules.js` and `nhl-average.js` are seeded now, so their output reproduces. Playwright is needed only for `smoke.js`, `calibration.js`, `review.js` and `lab.js --pool`, which checks that the page's workers play every seed exactly as Node does.
- References in `tools/baselines.json` re-saved for sim 0.43 (see the sim entry): 93 of 100 games at the build defaults and 87 of 100 at the NHL tick are unchanged; the largest move in any average is a fifth of its interval.

### 0.52
- Sim 0.42 (restructure step 2, first part: the engine in its own module). `tools/smoke.js` checks the version stamp on every import as well as on the page.

### 0.51
- Restructure step 1 (`docs/RESTRUCTURE.md`): the pages are served over HTTP only and no longer carry copies of their data. Sim 0.41, Play Review 0.8.
- `tools/build.py` is retired: there is nothing left to embed. `tools/smoke.js` now also loads the home page and Play Review and fails on any data file that does not load or parse, and checks the sim's version stamps.
- `tools/lab.js --pool` plays the seeds in the page's own background workers and fails unless every game matches.

### 0.50
- Restructure step 0, the safety net (plan in `docs/RESTRUCTURE.md`). The checks now load the pages over HTTP, the way a visitor does, from a small server inside each tool (`tools/serve.js`; `node tools/serve.js` also serves `public/` for a browser). The saved references keep a fingerprint of every game, so `tools/lab.js` says "identical" only when all 100 games finish exactly as before, and names the seeds that changed otherwise. `--order` replays the seeds in reverse order on one page and fails if any game changes. `tools/review.js` fingerprints every shot Play Review scores. Both levels were re-saved with fingerprints; the averages were identical before the re-save, so no game changed.
- Play Review 0.7.

### 0.49
- Sim 0.40.

### 0.48
- Sim 0.39.

### 0.47
- Home page: the Bruins vs Canadiens card describes the strategy test (two plans through the same 100 games, a plain verdict), sight lines and the check against the real teams; its art shows a plan B result instead of a record. The GitHub link in the header is gone; each card keeps its source link.

### 0.46
- Sim 0.38 (penalty kill, redesign phase 3). The home page card opens the sim on Watch, with Test a strategy as the second link.

### 0.45
- Sim 0.37 (the redesign, phase 2: Test a strategy).

### 0.44
- Sim 0.36 (the redesign, phase 1). The home page card opens Test a strategy.

### 0.43
- Sim 0.35. `tools/lab.js` gains `--param` to try a `physics.json` value without editing it, and its report flags changes from the reference again (a misplaced comment had switched the counter off in 0.42).

### 0.42
- Sim 0.34. `tools/lab.js`: parallel, seeded, reproducible headless matchups with confidence intervals, a report against the league and a saved reference (`tools/baselines.json`), and paired comparisons and sweeps. First sweep of every Bruins card recorded in `docs/ENGINE.md`.

### 0.41
- Link previews work: the Open Graph tags and share image moved from an unserved root `index.html` into `public/`. The stale root copy and `assets/` are gone.
- Work moves to Claude Code. `LOCAL-SETUP.md` covers setup on a new machine; `docs/RAW-INPUTS.md` (moved from the ignored `raw/README.md`) lists every raw input, its URL and the command that uses it. CLAUDE.md drops the chat-drop workflow.
- Engine baselines re-measured at sim 0.33 over twenty games at the NHL-average tick; they held. `xg-model.json` rewritten in the script's own key order so a refit leaves `git status` clean.

### 0.40
- Home page card copy rewritten for a general reader.

### 0.39
- `tools/mp_extract.py` rebuilds the MoneyPuck ratings extract from the season CSVs and reproduces the committed file exactly (`--check`). The drop zip now carries `raw/` with every input file and a README; `raw/` is git-ignored. `xg_fit.py` pins the on-net share to the latest season so a refit reproduces the committed model.

### 0.38
- Handoff pass: `docs/ROADMAP.md` (state of each project and next steps, with the product brief summarized), CLAUDE.md state-at-handoff and commit conventions, stale references to the old Advanced-tab batch fixed, root `.gitignore`.

### 0.37
- Home page: the Bruins vs Canadiens card art is the rink again, a Bruins rush with trails and sticks, with a score strip and a lab record chip above it.

### 0.36
- Sim 0.33.

### 0.35
- Sim 0.32. One card for the sim, leading with the matchup lab; the separate Matchup Lab card is gone.

### 0.34
- Sim 0.31 (matchup lab, shootouts, records). Matchup Lab card on the home page.

### 0.33
- Play Review 0.6.

### 0.32
- Play Review 0.5.

### 0.31
- Sim 0.30, Play Review 0.4, modeling guide, home page copy.

### 0.30
- Sim 0.30, Play Review 0.1.

## Play Review

### 0.10
- The method note says the shot scoring is the sim's own model and code, and what tracking data would change for the review: observed positions, fitted pass and pressure numbers, an expected-goal model that sees the goalie and screens, and the real play in the replay.

### 0.9
- Scores shots with the sim's own code: the expected-goal model (`engine/xg.js`), the rink (`engine/rink.js`) and the engine's math, imported from the sim instead of copied. The rule that the formula lived in two places is gone.
- The page splits like the sim's: `index.html` (markup, 44 lines), `style.css` and `src/main.js` (a module), with `?v=` stamps.
- Every shot scores exactly as before to nine decimals (`tools/review.js`); the engine's math differs from the built-ins only far below that.

### 0.8
- Fetches its data only; the embedded copies of the expected-goal model, the systems and the game file are gone (the page is 461 lines, from 1,276). Every shot scores exactly as before (`tools/review.js`).

### 0.7
- A test hook for `tools/review.js` (the scored shots, read-only). Nothing visible changes.

### 0.6
- The replay respects offside: attackers without the puck hold at the blue line until the puck crosses it, then skate in over the next 0.7 s. Before this, rush clips started teammates inside the zone ahead of the puck.

### 0.5
- One rink instead of two: the real play with the model's alternative as a green ghost on the same clock, or either read alone. Puck streaks follow the puck's own path and sticks no longer reach for a puck in flight.

### 0.4
- Three scenarios: pass worth more, drive worth more (walk in 15 ft, cut toward the middle, corridor and pressure charged, closing man assumed beaten and labeled as such), and right call (shots that beat every alternative). The replay's right panel follows the scenario.
- "How this is scored" is collapsed by default.

### 0.3
- Replay times are ice time: lead-in and after are game-clock seconds, playback speed (0.25x, 0.5x slow motion by default, 1x real time) stretches them on screen, and the readout counts ice time. Skaters and the carrier move at real speeds for the whole lead-in, so a rush clip starts in the neutral or defensive zone and the view widens to show it.

### 0.2
- Replay: a mock reconstruction of the seconds around each shot, with a configurable lead-in (2 to 8 s) and 3 s after. The puck runs from the real preceding event to the real shot, skaters travel from plausible starts to their inferred spots (rush or in-zone scenario), the left panel plays the real result and the right panel plays the pass and the one-timer. Play, pause, replay, scrub, 0.5x and 1x. Drawn in the sim's style: numbered skaters, sticks, trails, puck streak, goalie line, goal light.
- Home page card copy updated for both projects.

### 0.1
- First version: Montreal 3 at Boston 4 (Jan 24, 2026) loaded from the NHL play-by-play and shift chart; every unblocked shot scored by expected goals against the best pass from the same spot; teammates and defenders inferred from the clubs' systems; top ten per club with side-by-side rinks and a method note. Single file: the model, systems and game data are embedded with a fetch-first fallback.

## Bruins vs Canadiens

### 0.64
- Game plan lab: the baseline's headline leads with chances. When the two teams are even on chances it says so, and puts a points edge down to finishing and goaltending; a points share inside the normal swing from luck is called that. Chances and points are each judged by their 95% range, as the tests are, so the sentence never contradicts the record.
- A test's game list starts with the games that show its verdict: a clear cost lists the games where the change hurt most first, a clear edge the ones where it helped most.
- After a reload the Games count matches the saved baseline, and its time comes back until a test replaces it.
- Watch: the penalty box and scorekeeper labels narrow to fit when the condensed font has not loaded.
- Checked, no change: two 10-goal games for Montreal in 50 when the Bruins played man-on-man. Nothing runs away in a blowout; man-on-man gives up too many chances, and the engine never pulls a starter or plays score effects (`docs/ENGINE.md`, Lopsided games).

### 0.63
- Game plan lab: a test is named for what it changed instead of Test 1, Test 2: the choice itself for one change (Bruins forecheck: 1-3-1 trap), the choices for two or three, a count past that (Bruins: 7 changes to the plan); both teams' changes when both plans changed. The hint above the buttons names it too.
- Every test and ranking card can be folded to its title and one-line answer, or removed, with an undo until the next run. Folding is remembered with the results; removing the test of the current plans lets them be tested again.
- The run card has room to breathe: what to do next on top in normal text, the run buttons (Test first once there is a baseline), the progress bar only while something runs, then Watch these plans and Reset below a divider.

### 0.62
- Watch is balanced again: the build default for acceleration comes down from 2.3 to 1.8 times the NHL rate. At 2.3 every defender recovered almost at once, man coverage gained the most from it, and Montreal took 74% of the points. Each multiplier set back to 1 in turn showed acceleration was the cause (the others moved the split by a few points). At 1.5 Boston led 60 to 46 and games ran over 4 goals a team. Skaters get up to speed a little less suddenly; top speed and the rest are unchanged.
- Fixed: pinned shifts. Since the coverage fixes of 0.58 to 0.61 the man on a carrier held a stick length inside him even on the wall, where the carrier is no threat, so nobody took the puck and the pinned team could not get it out or change: shifts over two minutes went from about 1 a game at the build defaults to 4, the longest past five minutes (a unit test caught one of 184 s). Now he contains a carrier in the middle of the ice from a stick length and closes to 1.5 ft, still inside, on the wall or below the goal line (`systems.json` `defensiveZone.carrierPressure`). Shifts over two minutes about 2.4 a game at the build defaults, none over three; 5.5 at the NHL settings (8 before). Letting a tired unit clear under more pressure was tried and made it worse: icings tripled, and an icing team cannot change.
- Recalibrated: `goalie.tierGoalScale` 1.05 to 1.02 (goals 3.08 a team at the NHL settings).
- At the build defaults, 100 games: Boston 57% of the points, Montreal 49%; goals 3.7 and 3.6 a game. At the NHL settings: Boston 62%, Montreal 46%; expected goals 3.89 and 4.23 (league 3.13).

### 0.61
- Measured first: 70 to 80% of medium- and high-danger shots come off a pass caught within 2.5 s, and when the pass leaves, the receiver's nearest defender is a median 12 to 14 ft away. The biggest single source for both clubs is a forward 10 to 20 ft out at even strength, about 5 a game each.
- Man coverage sags further toward the net off a man far out: up to 20 ft between him and the net instead of 15 (`systems.json` `defensiveZone.man.maxCushionFt`). At the NHL settings Boston's expected goals 4.35 to 3.76 and medium-danger shots 16.3 to 13.1. Playing men tighter (6 and 9 ft) was much worse; 25 ft reached the league rate but cut Boston's shots on goal to 20 a game.
- Zone coverage picks up a defenseman who comes down: the center's slot man and the defensemen's net-front man can be a defenseman (before, only forwards counted). No measurable change on its own; kept because it is right.
- Recalibrated: `goalie.tierGoalScale` 0.92 to 1.05 (goals 3.03 a team at the NHL settings, league 3.08). Above 1 because both clubs' goalies allowed about 10% fewer goals than expected in 2025-26.
- At the NHL settings, 100 games: expected goals 3.76 and 4.03 (league 3.13); Boston 66% of the points, Montreal 44%. At the build defaults Montreal takes 74% of the points.
- Shifts: mean 51 s, p90 78 s at the build defaults (target 45 to 50 and 70 to 75).

### 0.60
- Shots hit the net at the league's rate for their danger tier: 62.6% low, 68.5% medium, 78.1% high (MoneyPuck 2025-26, tiered by the sim's own expected-goal model; defensemen and forwards alike). A shot on net is aimed inside the posts, a miss goes just wide of one (`physics.json` `shot.aim`). Before, an aiming error that grew with distance put close forwards' shots on net 93 to 99% of the time and point shots 27 to 51%.
- The save roll divides a shot's expected goals by its own tier's on-net share instead of the overall 65%. With the old aim, a close chance scored at about 1.4 times its expected rate and a point shot well under it, so a club that shot from in close (Boston) converted far better than one that shot from the point (Montreal): 0.80 against 0.68 goals per expected goal in 0.59, while the real clubs were 1.08 and 1.04. Now 0.73 and 0.70.
- Recalibrated: `goalie.tierGoalScale` 0.74 to 0.92 (goals 3.06 a team at the NHL settings, league 3.08). It is above its original 0.72 because both clubs' goalies save more than the league, which the old accuracy hid.
- At the NHL settings, 100 games: Boston 63% of the points, Montreal 43% (real 61% and 65%); expected-goal share 51 / 49. At the build defaults goals rise to 2.4 and 3.0 a game (2.3 in 0.59) and Montreal takes 67% of the points. A one-timer or a hurried shot no longer misses more often than any other; shot accuracy by shooter is now carried only by the finishing multiplier in expected goals.

### 0.59
- Zone coverage plays the puck carrier from the inside too, the same stick length as man coverage (`systems.json` `defensiveZone.zone.carrierGoalSideFt`, 5 ft). At the NHL settings, 100 games: Montreal's expected goals against Boston 4.97 to 4.09 and its medium-danger shots 16.8 to 12.2; both clubs now about a third above the league in expected goals (60 to 90% at sim 0.57). Boston 61% of the points (real 61%), Montreal 48% (real 65%). For Montreal, zone now gives up about 0.8 expected goals a game fewer than man.
- Recalibrated: `goalie.tierGoalScale` 0.68 to 0.74 (goals 3.07 a team, league 3.08).
- At the build defaults the points split evenly again (Boston 55%, Montreal 57%; Montreal had 77% in 0.58), but goals are low there, about 2.3 a team a game.
- Shifts a little longer again: mean 52 s, p90 78 s at the build defaults (51 and 76 in 0.58; target 45 to 50 and 70 to 75).

### 0.58
- Man-on-man coverage plays the puck carrier from the inside. The man on the carrier used to skate straight at the puck, and man coverage has no second defender stepping into the shooting lane, so a carrier who got by him had a clear path to the net: on Boston's medium-danger shots against Montreal's man coverage the shooter's own defender was goal-side only 22% of the time, and on high-danger shots 5%. Now he plays a stick length between the carrier and the net (`systems.json` `defensiveZone.man.carrierGoalSideFt`, 5 ft).
- Found while chasing Boston's 76% of the points at sim 0.57: goals on shots were close to even, and switching Montreal to zone on the same games took Boston's expected goals down by 2 a game. Not goaltending: goals that beat the goalie without a shot come to about 0.1 a team a game.
- At the NHL settings, 100 games: expected goals Boston 6.00 to 4.28, Montreal 5.09 to 4.98; Boston's medium-danger shots 22.6 to 16.0 and high-danger 5.5 to 3.3 (league 8.1 and 3.4). Boston 59% of the points, Montreal 53% (real 61% and 65%); Boston's expected-goal share 47%, the same as the real season. Man against zone for Montreal, same games: no difference in expected-goal differential (it was 2 a game). Tightening the cushion on the men away from the puck instead made it worse.
- Recalibrated: `goalie.tierGoalScale` 0.57 to 0.68, goals back at the league rate (3.03 a team, league 3.08).
- Shifts run a little longer: mean 51 s and p90 76 s at the build defaults (47 and 72 before; target 45 to 50 and 70 to 75).
- At the build defaults Montreal now takes 77% of the points (64% before): at that speed its man coverage holds Boston to 3.6 expected goals. The lab plays at the NHL settings, so only Watch sees it.

### 0.57
- Fixed: a puck the defending team touched last (a rebound drifting back, a deflection or a block off a defender) crossed the goal line with no save roll. Found from a lab game that ended 12-3: five of the twelve went in that way. Over the 100 reference games at the NHL settings it was 192 of 627 goals, about three in ten. Now every puck that crosses the line gets its roll; one his own team touched last is saved like any loose puck (98.5% slow, about 95% hard).
- Recalibrated: `goalie.tierGoalScale` 0.39 to 0.57, which lands goals at the league rate again (3.14 a team at the NHL settings, league 3.08). Part of what had pulled it down from 0.72 was these free goals. With every puck facing the goalie, the two teams split differently: at the NHL settings Boston 3.66 goals and Montreal 2.62, Boston 76% of the points; the comparison with the real teams shows it.
- Any lab game opens on the Watch rink: the baseline card and every test card have a picker (a test's games sorted by how much the test changed them for the coached team) and open the game with the baseline or the test plans at the NHL settings, ticking at the lab's fixed step so it plays exactly as it did in the lab; a note says so and confirms the final matches. Sim to the final horn goes straight to its review. Touching the Watch plans or sliders, or New game, hands the rink back to them.

### 0.56
- Angling on the rush. A puck carrier could skate through a defenseman: skaters only nudge apart, so a defenseman standing up at the line did not stop or turn him, and most of the sim's extra chances were rushes that ended with the shooter inside every defender. Now, from just before the blue line, a defender who is goal-side of the carrier and in his way takes away the inside: the carrier's route bends to the outside of him (`physics.json` `angling`). A defender who stays with him gets the usual poke-check chance.
- At the NHL settings, 100 games: expected goals Boston 5.99 to 5.68, Montreal 5.41 to 5.08; high-danger shots 5.95 to 4.97 and 4.86 to 4.06; goals 3.38 and 2.99 (league 3.08); offsides 9.2 to 6.2 a game (target about 6). At the build defaults, icings 20 to 17 a game. Shift lengths unchanged (mean 47 s, p90 72 s). References re-saved at both levels for this change.
- The neutral-zone gap numbers moved to data (`physics.json` `gapControl`, unchanged values).

### 0.55
- What if he passed, in the shot review: for a shot with a pass available, the game is rebuilt at the instant before the release on a separate engine, and the pass he passed up and the shot he took are each played out `review.whatIf.runs` (200) times for `horizonSec` (5) seconds or until the whistle, with the same fresh random numbers for both, so each pair differs only by the choice. The card gives net chances for each (expected goals for minus against), goals in the runs, how often the pass arrived and the receiver got a shot away, and a verdict from the 95% range of the paired difference. When the played-out pass is worth much less than the read said, it says why: the read prices an instant one-timer. If he passed, above the rink, replays one typical run of the pass. About two seconds a shot.
- Engine: `snapshot()` and `restore(snap)` (the whole game state, restorable into any engine; the generator's state rides along), `reseed(seed)`, and `force(player, { kind })`, a carrier's next decision once. Watch games are now seeded (a random seed each game) so they can be rebuilt; they play as before. Two new unit tests: a restored snapshot plays on exactly as the game did, in the same engine and another; a forced decision happens once and a reseed changes what follows. Both references identical.

### 0.54
- Sim to the final horn, beside New game: plays the rest of the game at once, the same ticks the rink would play, a few thousand a frame (about two seconds), then scrolls to the shot review.

### 0.53
- Review this game, Play Review's first step into the sim. When a Watch game ends, a panel under the rink judges every shot by the shooter's own read at the release: his look at the net (after a defender in his lane or on him) against his best pass, the values he decided with. Verdicts: better pass missed (a pass worth `shotDecision.xgChoice.passMustBeatBy` times the shot and at least `review.minGapXg` more), close call, right call. Each team gets a count, the goals left on the table and its share of right calls; a strip shows every shot of the game, Bruins above and Canadiens below; a list filters by verdict, goals and team. A shot opens on its own rink, zoomed to the ice the play used, frozen at the release with the sight lines, why he shot (his look beat his passes, a throw from the outside, the shot he had, held too long, breakaway, one-timer), his shot's value and what cut it, the best pass and what it was made of, and what happened. Play the lead-up runs the six seconds before at 0.5x or 1x, holds on the release, then two seconds after. Every shooter folds out a table. The review only listens: the game plays exactly as before (both references identical).
- Engine: a `shot` event at each release, before any block, with the shooter and why he shot (`shoot(from, oneTimer, why)`); `readLook` also returns the parts of each value (his look before the lane and pressure, whether the lane was open and he was covered tight, and the best pass's look, arrival chance and coverage). Neither draws a random number.
- The sight lines are drawn by one function for the live rink and the review (`paintSight`). New data: `physics.json` `review` (minGapXg, leadSec, afterSec, sampleHz).

### 0.52
- Rank every option is now Find the best option, and says what it is for: which forecheck, breakout or other choice suits the coached team against this opponent, and whether the choice matters at all. The intro names both teams, says the rest of the baseline plan stays as it was and changes since the baseline are left out, and the button gives the option count and the time. The result leads with a sentence (the best option and by how much, the baseline's already best, or the choice barely matters), drops the repeated baseline labels, and a clear winner gets a button that puts it in the plan. Its progress shows beside the button.
- A difference that rounds to zero shows no sign (0.00, not −0.00).

### 0.51
- Every shot attempt is filed as on goal, missed or blocked. A shot a skater caught cleanly in flight was counted as an attempt and nothing else, about 1 a game for the Bruins and 3.5 for the Canadiens at the baseline plans. A defender's catch is now a blocked shot, and so is a teammate's in the lane, as NHL scoring counts it. Only the counts changed: every game plays exactly as before.
- The real-teams comparison is titled as the baseline's and says tests are not graded against the real teams. Each team gets a Sim and a Real column, the sim number in bold with its verdict, so a match no longer reads as one number.
- A test's records group each team's baseline and test with a change row between them, the coached team first.
- Once there is a baseline, Test against the baseline is the main button and Rerun the baseline the outlined one; a disabled button reads Tested or says why on hover, and the hint says a rerun clears the tests. The hint links to the test that ran the current plans.
- A result still too close to call shows its number dimmed, so the clear one stands out.
- Each aggression slider shows its level and value, and the baseline's once it moved.
- Focus rings show for the keyboard only; records tables no wider than they need; on a phone the real-teams table drops the row descriptions and scrolls inside its box.

### 0.50
- How it works gains two sections. The models, technically: time and motion, the rule-based decision policy, the expected-goal model and its fit, the save roll and its calibration factor, the ratings, measured against calibrated against assumed numbers, and the Game plan lab's paired statistics. What full tracking data would change: movement, decisions, expected goals, goalies, systems and coverage, validation.
- Corrected: saves were described as the goalie's tier save rate; since 0.35 the save roll starts from the shot's expected goals. The penalty kill's long clear is described.

### 0.49
- The Game plan lab reads top to bottom, in one column: the Baseline card (a prompt before the first run, then the record and the comparison with the real teams), both teams' plans side by side (stacked on a phone), the buttons, then the tests.
- Testing is editing: change either plan, one choice or several, and Test against the baseline plays the plans as they are now through the baseline's games. Each test lists what changed for each team, and choices that differ from the baseline are marked in both plans. Rerun the baseline makes the current plans the new baseline. Each button is clickable only once something changed since the run it would repeat. The single "try a change" picker is gone; ranking every option of one choice stays, folded.
- The baseline and the tests are kept in the browser with the plans, so they are still there after watching a game or a reload (results from another sim version are dropped).
- Watch these plans in a game copies both lab plans to the Watch view and starts a game with them.

### 0.48
- Two views that share nothing but the engine. **Watch a game** is the game on the rink with its own plans (Edit plan) and its own settings, now a Settings button in the Watch controls, plus the box score, play by play and rosters, and a strip that explains the lab in three steps and opens it. The **Game plan lab** replaces Test a strategy and How real is it.
- The lab has its own plans for both teams, as compact grids (each choice's meaning is its hover text), remembered in the browser with a link to reset both to the original plans. The workflow reads top to bottom: set both plans, run the baseline (100 games at the NHL settings), then try a change, one choice and another option, or rank every option of one choice. A change plays only its own games, on the baseline's seeds, so it takes half the time a plan A and plan B run did, and each result stays listed under the baseline. Changing either plan marks the baseline out of date and asks for a new one before more tests.
- The comparison with the real 2025-26 teams (the old How real is it) is folded under the baseline and grades only the baseline's games. It no longer grades the game being watched, which runs at the faster Watch settings.
- The Watch plans and sliders no longer reach any test: only the plan drawer drives the game on the rink.

### 0.47
- The crease at the right-hand net was drawn behind the goal line; it is in front of the net now, like the left one. Drawing only.

### 0.46
- Fixed play freezing for up to a period, the cause of the long shifts on the roadmap. A pass that died just short of the far blue line counted as still on its way to its receiver, who was held onside 8 ft back; the defense played him instead of the puck, and a defender standing close by kept the dead-puck whistle from blowing. In about one game in ten at the build defaults nobody touched the puck again for minutes, and the line on the ice stayed out the whole time. A pass now counts as on its way only while it moves faster than 10 ft/s (`pass.inFlightMinFtPerSec` in `physics.json`); slower than that it is a loose puck and both teams go for it.
- In 80 seeded games the longest the puck now sits loose and still is 3 seconds (the dead-puck whistle), against up to 20 minutes before; shifts average 47 seconds with the longest at 140.
- References re-saved for this change. Every game changes, since dead passes are common, but no average moved by more than one combined interval; offsides, which a second version of the fix pushed up, did not move.

### 0.45
- Random numbers are passed in, not patched in. `sim.newGame(seed)` gives the game its own seeded generator (`src/engine/rng.js`) and every draw in the engine goes through it; `newGame()` without a seed uses `Math.random`. The tools, the strategy test's workers and its in-page fallback no longer replace `Math.random` to seed a game.
- Every game starts from freshly built teams, players, puck and clock: `newGame` rebuilds both teams from the rosters instead of resetting a list of fields, the list that missed a field twice before. Only the game plans, and the page's speed and pause, carry over.
- No game changes: both references identical game for game (so the old reset list was not hiding a leak); the order check and the worker cross-check pass.

### 0.44
- The engine is split by subject into modules in `src/engine/`: `rink.js`, `xg.js`, `rosters.js`, `officials.js`, `lines.js`, `formations.js`, `ai.js`, `physics.js` and `rules.js`, with `sim.js` keeping the game state, `newGame` and `tick` (118 lines, from 1,218). Each module installs its functions into one shared object and links to the others', so the code inside reads as it did in one file. The split was generated from the old file, with the names each piece borrows found by a linter rather than by hand.
- No game changes: both references identical game for game; the order check and the worker cross-check pass.

### 0.43
- The engine does its own trigonometry, exponentials and logarithms (`src/engine/detmath.js`, ports of fdlibm built from exact arithmetic) instead of `Math.sin`, `cos`, `atan2`, `exp`, `log`, `pow` and `hypot`. Browsers are free to compute those differently in the last bit, and they do: Chromium 156 and Node 26 disagree on a fifth of all inputs, so a seeded game could end differently in Node, in each browser and after a browser update. Now the same seed plays the same game everywhere. Each function is within one unit in the last place of the built-in.
- Every game shifts by a hair, so a few seeded games end differently: 7 of 100 at the build defaults and 13 of 100 at the NHL tick. No average moved by more than a fifth of its interval; the engine plays the same hockey.

### 0.42
- The engine moves out of the page's script into its own module, `src/engine/sim.js` (`createSim(DATA, opts)`, about 1,200 lines), which never touches the page. The page listens to it: the play by play, the end of a game and the visual effects (hits, hard saves, the goal light) come out as events, and the effects' timers run in the page's drawing loop instead of inside the engine's tick. `src/main.js` keeps the drawing, the controls and the two views, about 840 lines.
- Test a strategy's workers import the engine directly. The stand-in for the page that the workers used to run the whole page script behind is gone.
- When a browser cannot start workers, the strategy test's games now play on an engine of their own instead of borrowing the watched game's, so the game on the rink is paused and picks up where it was rather than restarting. `tools/lab.js --pool` checks this path too.
- No game changes: both references identical game for game; the order check and the worker cross-check pass for 20 seeds.

### 0.41
- The single file is split: `index.html` (markup, 249 lines, from 5,421), `style.css`, and the script as one ES module, `src/main.js`, with the `startSim` closure unchanged. Both load with a `?v=0.41` stamp so a visitor never mixes files from two deploys.
- The seven embedded data copies are gone; the page fetches `data/*.json` and says so plainly if it cannot.
- Test a strategy's workers are module workers (`src/lab/worker.js`): the same stand-in for the page as before, now in its own file, importing `main.js` with the same stamp instead of rebuilding the page's script from its text.
- No game changes: both references identical game for game, the order check and the new worker cross-check pass for 20 seeds.

### 0.40
- Sight lines explain themselves. The tag carries the same marks as the drawing (a yellow wedge for the shot, a blue dash for the pass), names the teammate the pass goes to, and says what the carrier will do by the rule he decides with: shooting, passing, or holding for a better play. The wedge is outlined to the two posts and the pass target is ringed. The legend under the rink says what each color means, and Sight lines has a glossary entry.
- 0.5x speed, for following sight lines.

### 0.39
- Test a strategy explains itself: plan A is your team as set, plan B the same team with the changes you want to try, and both play the other team through the same games, so a difference is the change and not easier games. Plan A, plan B and the same games have explainers and glossary entries.
- How it works, Using it, rewritten for the current page: Watch with sight lines and the game plans, Test a strategy with plan A and plan B, How real is it and Settings. The calibration section points at How real is it instead of the old Advanced tab.

### 0.38
- Penalty kill: there is no icing while shorthanded, so a killer with the puck in his own end or the neutral zone clears it the length of the ice within a beat, down the open lane closest to straight ahead, and lifts it over the sticks when every lane is covered. Only a breakaway or an odd-man rush up the neutral zone keeps it. Before, killers cleared only under pressure and only to just past the far blue line, so almost half the clears stopped short. Now about nine in ten reach past the far dots, and killers hold the puck under a second per power-play minute, down from about six.
- The penalty kill forechecks like one: in the power play's end one man pressures, the other forward waits high and the defensemen at our blue line; in the neutral zone a passive 1-3. It used to run the team's even-strength forecheck with four men.
- Power play converts about 20% over 30 games (league about 20%); even-strength numbers unchanged.
- The page always opens on Watch; a link with #test or #real opens those views.
- How real is it, redesigned: grouped rows (results, scoring, shot quality, defense, game flow), each with a plain reading, the sim's number next to that team's real one with an on target / above / below verdict, the league average, a count of numbers on target, and a button that plays 100 games to check.
- Glossary: every term has a ? explainer (chances, net chances, points %, too close to call, clear edge, danger tiers, attempts, blocks, possession, takeaways, penalty kill, NHL-realistic settings), and How it works lists them all. Box score labels in plain words.

### 0.37
- Test a strategy, redesigned. Pick the team you coach; plan A is that team as set, plan B a copy where any choice can change. Both plans play the opponent's plan in the same seeded games, and the result is a sentence and three verdicts (net chances, goal difference, points), each clear edge, too close to call or clear cost from its 95% interval. Rank every option for one choice on the same games. Edit links sit under each team's name.
- Runs play in background workers on every spare core: 100 games a plan in about a minute on an eight-core machine, where the page alone took about 4 minutes for 100. Runs always use the NHL-realistic settings, and the game on the Watch view keeps playing. If a browser cannot start workers, the games run on the page.
- Every game now depends only on its seed. `newGame` picked the opening lines before resetting the clock, period, score and penalty boxes, so a game opened with whatever line the end of the last one called for; the line indexes, man-coverage marks, slot assignments and a shot flag also carried over. Since 0.34 seeded runs had reproduced only when played in the same order; now a seed plays the same game in any order, in a worker, on the page and in `tools/lab.js`. References re-saved; the numbers barely moved.
- The step 2 copy said 100 games take about a minute, which was only true from 0.37 on; it now says a minute or two.

### 0.36
- Redesign, phase 1. A header says what this is in one line and links three steps (set each team's plan, simulate the games, see what changes) into the strategy test, with How it works for the long explanation. Three views replace the four tabs: Watch, Test a strategy and How real is it, with the settings behind a gear.
- Watch: a scoreboard with shots, the share of chances (with an explainer) and the power-play state; the rink; each team's game plan as a sentence in its team color with Edit plan, which opens both plans in a drawer with every choice explained under it; box score, play by play and rosters folded below.
- Sight lines, a new effect: the puck carrier's open look at the net, the shadow each defender casts over it, his best pass (bold when it beats the shot) and both values. It draws the same read the player decides with and changes nothing in the game.
- Test a strategy runs 100 games by default; fewer cannot separate most settings.
- Play is unchanged: both 100-game references are identical.

### 0.35
- Shoot or pass is decided by the expected-goal model: a carrier with a look worth at least 0.12 (an open wrist shot from about 20 ft straight on) shoots unless a teammate's look, discounted for the pass, is clearly better; a defender in the lane or on him lowers his look. The slot and in-tight rules are gone. Open shooters in the slot used to pass three times out of four.
- Every puck that reaches the goal line between the posts gets a save roll. Pucks that slipped past where the goalie stood used to go in without one.
- A pass on its way to a teammate keeps both teams in their structure; the defense used to treat every pass as a loose puck and leave the receiver.
- Man-on-man: the man on the puck carrier is the one who pressures him, marks hold when attackers cross, and each defender plays between his man and the net with a cushion. It still gives up more than zone coverage, but about two expected goals a game less than before.
- Zone coverage picks up any attacker in the slot first, the defensemen stand closer to the middle, and own-zone defenders skate hard to their man.
- Sticks within 5 ft get a piece of passes going by, and a touch that does not control a pass knocks it off line. In the offensive zone a receiver settles the puck (0.35 s) before his next pass.
- Goalie scale 0.39 (was 0.72) keeps goals at the league rate; the sim still creates 60 to 90% more expected goals than the league, shown unscaled in the reports.

### 0.34
- Every game starts from the same state. `newGame` now resets player and goalie positions and momentum, the per-player burst, sprint and rushed flags, the dump and line-change timers and the puck, which used to carry over from the previous game. Play is unchanged; a lab run's games are now independent and a seeded run reproduces exactly.

### 0.33
- Lab tab compressed: each part is a collapsible section with a one-line summary (the matchup in brief, the record of the last run, how many reality-check cells are off, what was swept). Matchup and Record open by default; the reality check, the sweep and the caveat are collapsed. The record table folds the 95% interval under the win percentage so it fits without scrolling.

### 0.32
- Lab tab reorganized: the matchup (both cards side by side), the run, the record, the reality check and the sweep, each under its own heading. The reality check moved here from Advanced and reads the last lab run; the separate ten-game batch is gone. Advanced is the last tab and holds only engine settings and data sources.
- Reality check gains record and points percentage rows against each club's final 2025-26 record (in `rosters.json`).
- Fixed the batch record showing NaN for the visitors.
- A result whose cards have changed since the run says so.

### 0.31
- Matchup lab (Lab tab, also at `#lab`): play the two clubs against each other 10 to 100 times with the systems on the cards and report W-L-OTL, win and points percentage with a 95% interval, goals, expected goals and shots for and against per game; sweep every option for one card with everything else held; stop a run early.
- Games tied after overtime go to a shootout (three shooters each, then sudden death, chance scaled by shooting and the goalie's quality in tight), so every game has a winner.
- Records are wins, losses and overtime or shootout losses: a session record on the Game tab, the ten-game batch record on the Advanced tab, and the lab.
- About: overtime and shootout, the session record, the lab.

### 0.30
- Hover text on the coaching cards: every system choice explains itself, the dropdown shows the current choice's explanation, and the aggression dial says what it changes. Power-play, penalty-kill and aggression descriptions added to the systems data.
- About: a new section listing every system with its description, and what the aggression dial does.

### 0.29
- Expected-goal model fit on two seasons of MoneyPuck shots (`tools/xg_fit.py`, `data/xg-model.json`) replaces the distance-box danger tiers: every shot gets its own probability from distance, angle, shot type, rebound and strength, times the shooter's finishing. Tiers now follow MoneyPuck's xG thresholds.
- Goalie save roll uses the shot's xG scaled by the goalie's real tier save rate; `goalie.tierGoalScale` retuned to 0.72.
- Shot decisions retuned to the real mix (in-tight, slot, probabilistic and stuck rates down; breakaway detection stricter and parameterized) so attempts and the danger-tier split match league rates at the NHL-average settings.
- About and the Data sources panel describe the model; `tools/build.py` embeds it.

### 0.28
- About dialog rewritten to cover the current engine: carrier reads, breakout burst and rush, cycle motion, hard dump, forecheck and coverage, fatigue effects, hybrid icing, calibration at the NHL-average tick.

### 0.27
- A tired skater no longer swaps himself out while the puck is in his own zone, even when it is loose and far from the bench.
- Repo: CLAUDE.md, engine notes, build history, data-embedding build script and headless checks under `tools/`.

### 0.26
- Sticks toggle, independent of Effects; with sticks off, skaters show a short heading tick.

### 0.25
- Version number in the page footer.
- Two doors per bench: forwards change through the door at the attacking end, defense through the door at the defending end, swapping when the teams change ends. Bench seating and on-deck players follow the doors.

### 0.24
- Effects layer with its own toggle: skate trails on fast skaters, puck streak on hard shots and passes, ripples on takeaways and blocked shots, save flash, goal light with the scorer picked out. Sticks with blades that point at the puck when it is close.

### 0.23
- Pace sweep: the cycle rotates corner, half wall and net front every few seconds; all forwards at full effort on the rush; small off-puck drift in every offensive-zone formation; 1-2-2 forecheck moved to the tops of the circles.

### 0.22
- Breakout burst: forwards leave their support spots and skate north ahead of the puck once the team has possession; the carrier wheels out with speed.

### 0.21
- Situational change windows replace the loose-puck trigger: change only when our carrier is through the neutral zone or the other team is retrieving deep in its own end, never off a loose puck or while defending.
- Shift fatigue: after 30 seconds a skater loses top speed, acceleration and hands, fully gassed at 65 seconds. Fatigue ring on tired skaters, shift seconds on the roster sheet. Gassed units clear the puck and take the first half-decent window after 85 seconds.

### Earlier
- Real 2025-26 rosters, MoneyPuck-derived ratings, goalie save percentages by danger tier, NHL EDGE-calibrated skating.
- Selectable systems on coaching cards above each bench, engine settings with NHL-average ticks, save and export of defaults.
- Rules: tag-up offside, hybrid icing, penalties and power plays, goalie freezes by crease pressure, three officials with lead and trail mechanics.
- Reality check against real team and league rates with a ten-game batch and win record.
- All driving data externalized to JSON with sources.
