# Roadmap

Where each project stands at site 0.70 and what comes next, in priority order. The product thinking behind Play Review is in the product brief (a Claude doc, https://claude.ai/code/artifact/c3d91c78-39ac-48bb-8d5b-bd518179cb7d); its substance is summarized here so the repo stands on its own.

## The idea, in one paragraph

A hockey engine whose decisions are tuned to public data is only a toy until it can be checked against what real players did. The path is: real game events in (done, from the NHL play-by-play and shift chart), the model's alternative for each decision out (done for shots versus passes and drives), then validation of those alternatives against a season of real decisions, then tracking data so the positions stop being inferred. Each step makes the Game plan lab more believable, because the lab is only as good as the decision model under it.

## Bruins vs Canadiens (sim 0.58)

1. Defense that allows the real number of chances. At sim 0.58, at the NHL settings, expected goals are 35 to 60% above the league (Boston 4.3, Montreal 5.0, league 3.1), mostly medium-danger looks: about 16 per team per game against 8; high-danger looks are near the league (3.3 and 4.0 against 3.4). Sim 0.58 fixed the biggest single cause: in man-on-man coverage nobody played the puck carrier from the inside (the man on him skated at the puck, and man coverage has no shot fronter), so a carrier who got by him had a clear path; on Boston's medium-danger shots against it the shooter's own defender was goal-side only 22% of the time. Playing the carrier from a stick length inside took Boston's expected goals from 6.0 to 4.3 and Montreal's coverage from the worst in the sim to even with zone. A tighter cushion on the men without the puck (6 ft or less) made it worse, not better. Zone coverage's carrier pressure still goes straight at the puck, with the fronter covering the lane; that is the next thing to check. Earlier findings: Measured in 0.56 (`docs/ENGINE.md`): about two thirds of the medium-danger shots come within 4 seconds of a zone entry, most after a clean breakout with the other team's defensemen already back, and on most of them no defender is closer to the net than the shooter. The first cause, a carrier skating through a defenseman, is fixed (angling, 0.56: high-danger chances down about 16%, offsides at the NHL settings from 9.2 to 6.2 a game). Ruled out, measured on top of angling: a wider neutral-zone gap (14 ft: expected goals within 1%), a wider gap read earlier (no better, more offsides), a bigger slot box (34 to 44 ft deep and 16 to 22 ft wide: slightly worse), and a slower puck carrier (the engine's 95% already matches the one published figure, about 5% slower with the puck in youth sprint tests). Not yet measured: holding the gap into our own zone for the first seconds of a rush (the first try passed two `--param` flags and only the last one applied, a `tools/lab.js` bug fixed in site 0.68). Also ruled out after site 0.68, each against the 0.56 reference: tighter slot coverage (goalSideFt 1.5, stickFt 6), sprinting sooner to a coverage spot (no effect: within 4 ft braking sets the speed anyway), longer sticks in passing lanes (6.5 ft: within noise), and the defender breaking on the catch point while a pass is in the air (medium-danger flat, expected goals slightly up). What these show: on the passes that become medium-danger shots the receiver is usually 12 ft or more from the nearest defender when the pass leaves, often with a defender assigned to him who has not closed, so nothing that acts at the catch or in the lane can reach him. Still open, and bigger: why coverage is that far off before the pass (the attackers' spots and drift pulling defenders out of the slot, or assignments switching), and whether the offensive systems put too many attackers in the medium-danger band. Start with a trace of one assigned defender over the five seconds before such a pass. `tierGoalScale` keeps goals realistic in the meantime (0.68 since sim 0.58; 0.57 in 0.57, when a bug that let about three goals in ten in with no save roll was fixed) and should climb back toward 0.72 as the gap closes.
2. System effects that are still wrong (`docs/ENGINE.md`, System effects): crashing the net lowers expected goals for; aggression and the power-play systems do nothing measurable. Each has a `tools/lab.js --sweep` command to re-check it.
3. The build defaults (the faster Watch settings) now favor Montreal heavily: about three quarters of the points (64% before sim 0.58), because its man coverage holds Boston to 3.6 expected goals at that speed. The lab plays at the NHL settings, where the split is close to the real one, so this only affects Watch. Icings also run high at the build defaults (Boston about 10 a game), a side effect of the extra pressure in its own zone.
4. Overtime at three-on-three. Overtime is five minutes at full strength now; the lab's OTL counts would shift a little.
5. Validate system effects. The lab compares strategies inside the model; nothing says a 1-2-2 moves a real game the way it moves a simulated one. The honest first step is a season of real team results against the systems each club is known to run, which needs observed systems per club (item 5 in `docs/MODELING.md`).
6. A follow-the-puck camera for small screens, discussed and parked early (`docs/HISTORY.md` item 11). The pages themselves work on a phone; the rink is just small.
7. Tracking data. Each model has a specific use for it (`docs/MODELING.md`, What full tracking data would change); the first to swap would be coverage, since it is the engine's biggest error, then the expected-goal and save models.

## Game plan lab

Since 0.48 the lab is its own view with its own plans, and since 0.49 it reads top to bottom: the baseline, both plans side by side, then tests of the edited plans through the same games, all kept in the browser.

1. Two-dimension sweeps (our forecheck against each of their breakouts) as a grid of net chances.
2. A per-game log for a run (score, OT or SO, shots) that can be exported, so a result can be checked outside the page.

## Review this game (in the sim since 0.53)

Play Review is moving into the sim: after a Watch game, every shot judged by the shooter's own read, with exact positions (`src/review.js`). Next, in order:

1. Done in 0.55: What if he passed. It found that the read overprices passes: it values a pass as an instant one-timer, but played out the receiver often gets no shot away (4 to 40% of runs in the first games looked at), so many "better pass missed" shots come out about even. The carrier decides with the same read, so this is also an engine question: either receivers should one-time more often when the read says so, or the read should price the pass as it plays. Measure it across games before changing either.
2. Other decisions: entries (carry, chip, dump against who was back), passes that were picked off, and holds that ended in a turnover, each judged the same way.
3. A per-player view across games in a session. (The review for the lab's games is done in 0.57: any lab game opens on the Watch rink.)

## Play Review (0.10, the real-game prototype)

From the brief, in order:

1. Zone-entry review: the next play type after shots. Was the carry, chip or dump the best entry given who was back? Needs the same inference the shot review uses plus the entry events in the play-by-play.
2. Decision-agreement validation: score a season of real shots with the pass and drive alternatives and measure how often the model's preferred choice matches what the real player did, by situation. This is the number that says whether the model is worth listening to.
3. A game picker (any game ID through `tools/game_load.py`, the file name as a query parameter) and a per-player view (one skater's shots across games).
4. Observed systems per club for inference, replacing the hard-coded `OZ` table in `public/play-review/src/main.js`.
5. Tracking data. The replay and the inferred positions are placeholders for it; everything is built so real frames would replace them without changing the scoring.

## Engineering

Follow-ons from the restructure (`docs/RESTRUCTURE.md`), none urgent:

1. Done in site 0.68: a GitHub Action (`.github/workflows/checks.yml`) runs the unit tests, both reference levels, the smoke test, the order and pool checks and Play Review's reference on every push; a game that differs from its saved fingerprint fails it.
2. The two unit tests step 3 left unwritten: one save roll per shot, and the penalty-kill clear distance. Both need a small hook inside `movePuck` (an `fx`-style event for a save roll and for a clear would do).

## Known weaknesses

`docs/MODELING.md` keeps the list, in order of how much each matters. Read it before choosing what to work on.
