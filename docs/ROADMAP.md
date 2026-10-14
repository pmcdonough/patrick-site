# Roadmap

Where each project stands at site 0.41 and what comes next, in priority order. The product thinking behind Play Review is in the product brief (a Claude doc, https://claude.ai/code/artifact/c3d91c78-39ac-48bb-8d5b-bd518179cb7d); its substance is summarized here so the repo stands on its own.

## The idea, in one paragraph

A hockey engine whose decisions are tuned to public data is only a toy until it can be checked against what real players did. The path is: real game events in (done, from the NHL play-by-play and shift chart), the model's alternative for each decision out (done for shots versus passes and drives), then validation of those alternatives against a season of real decisions, then tracking data so the positions stop being inferred. Each step makes the matchup lab more believable, because the lab is only as good as the decision model under it.

## Bruins vs Canadiens (sim 0.33)

1. Decide shots from the expected-goal model instead of the geometric shot quality (`shotDecision` in `physics.json`, `carrierThink` in the engine). `docs/XG-MODEL.md` describes the gap. Recalibrate at the NHL-average tick afterward (`node tools/calibration.js`, `node tools/nhl-average.js`).
2. Defensive coverage that produces the real danger-tier mix (the sim has too many medium-danger looks; `tierGoalScale` compensates). Fixing coverage, not the scale, is the right move.
3. Overtime at three-on-three. Overtime is five minutes at full strength now; the lab's OTL counts would shift a little.
4. Validate system effects. The lab compares strategies inside the model; nothing says a 1-2-2 moves a real game the way it moves a simulated one. The honest first step is a season of real team results against the systems each club is known to run, which needs observed systems per club (item 5 in `docs/MODELING.md`).
5. Mobile layout and a follow-the-puck camera, discussed and parked early (`docs/HISTORY.md` item 11).

## Matchup lab (inside the sim)

1. Two-dimension sweeps (our forecheck against each of their breakouts) as a grid of win percentages.
2. Save and compare runs: keep the last few results so two card settings can sit side by side without re-running.
3. A per-game log for a run (score, OT or SO, shots) that can be exported, so a result can be checked outside the page.
4. Faster runs: 4,000 ticks per animation frame is a compromise between speed and a responsive page; a Web Worker would let a 100-game run finish in the background.

## Play Review (0.6)

From the brief, in order:

1. Zone-entry review: the next play type after shots. Was the carry, chip or dump the best entry given who was back? Needs the same inference the shot review uses plus the entry events in the play-by-play.
2. Decision-agreement validation: score a season of real shots with the pass and drive alternatives and measure how often the model's preferred choice matches what the real player did, by situation. This is the number that says whether the model is worth listening to.
3. A game picker (any game ID through `tools/game_load.py`, the file name as a query parameter) and a per-player view (one skater's shots across games).
4. Observed systems per club for inference, replacing the hard-coded `OZ` table at the top of the page's script.
5. Tracking data. The replay and the inferred positions are placeholders for it; everything is built so real frames would replace them without changing the scoring.

## Known weaknesses

`docs/MODELING.md` keeps the list, in order of how much each matters. Read it before choosing what to work on.
