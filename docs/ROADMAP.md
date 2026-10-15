# Roadmap

Where each project stands at site 0.58 and what comes next, in priority order. The product thinking behind Play Review is in the product brief (a Claude doc, https://claude.ai/code/artifact/c3d91c78-39ac-48bb-8d5b-bd518179cb7d); its substance is summarized here so the repo stands on its own.

## The idea, in one paragraph

A hockey engine whose decisions are tuned to public data is only a toy until it can be checked against what real players did. The path is: real game events in (done, from the NHL play-by-play and shift chart), the model's alternative for each decision out (done for shots versus passes and drives), then validation of those alternatives against a season of real decisions, then tracking data so the positions stop being inferred. Each step makes the matchup lab more believable, because the lab is only as good as the decision model under it.

## Bruins vs Canadiens (sim 0.47)

1. Defense that allows the real number of chances. Since 0.35 the carrier takes every look the expected-goal model says is worth it, so the sim's chance volume is now honest, and it is 60 to 90% above the league (mostly medium-danger looks off passes into the slot); `tierGoalScale` 0.39 keeps goals realistic in the meantime. What is left is not one bug: defenders already outnumber attackers in the slot when the pass goes; they lose the receiver on the catch and on the rush. Candidates: a stick on the receiver at the catch, rush defense (backcheckers picking up the late man), and box-out battles at the net. Each step is measured with `tools/lab.js --nhl` against the league column; `tierGoalScale` should climb back toward 0.72 as the gap closes.
2. System effects that are still wrong (`docs/ENGINE.md`, System effects): man-on-man gives up about two expected goals a game more than zone; crashing the net lowers expected goals for; aggression and the power-play systems do nothing measurable. Each has a `tools/lab.js --sweep` command to re-check it.
3. Icings run high at the build defaults (Boston about 10 a game), a side effect of the extra pressure in its own zone.
4. Overtime at three-on-three. Overtime is five minutes at full strength now; the lab's OTL counts would shift a little.
5. Validate system effects. The lab compares strategies inside the model; nothing says a 1-2-2 moves a real game the way it moves a simulated one. The honest first step is a season of real team results against the systems each club is known to run, which needs observed systems per club (item 5 in `docs/MODELING.md`).
6. Mobile layout and a follow-the-puck camera, discussed and parked early (`docs/HISTORY.md` item 11).

## Matchup lab (Test a strategy)

Since 0.37 the lab compares plan A and plan B (and since 0.38 How real is it reads in plain terms, with a glossary) on the same seeded games in background workers, leads with net chances and labels each verdict; the old items for chance-first results, NHL-realistic runs and faster runs are done.

1. Two-dimension sweeps (our forecheck against each of their breakouts) as a grid of net chances.
2. Save and compare runs: keep the last few results so two plans can sit side by side without re-running.
3. A per-game log for a run (score, OT or SO, shots) that can be exported, so a result can be checked outside the page.

## Play Review (0.9)

From the brief, in order:

1. Zone-entry review: the next play type after shots. Was the carry, chip or dump the best entry given who was back? Needs the same inference the shot review uses plus the entry events in the play-by-play.
2. Decision-agreement validation: score a season of real shots with the pass and drive alternatives and measure how often the model's preferred choice matches what the real player did, by situation. This is the number that says whether the model is worth listening to.
3. A game picker (any game ID through `tools/game_load.py`, the file name as a query parameter) and a per-player view (one skater's shots across games).
4. Observed systems per club for inference, replacing the hard-coded `OZ` table in `public/play-review/src/main.js`.
5. Tracking data. The replay and the inferred positions are placeholders for it; everything is built so real frames would replace them without changing the scoring.

## Engineering

Follow-ons from the restructure (`docs/RESTRUCTURE.md`), none urgent:

1. A GitHub Action that runs `node --test tools/test` and `node tools/lab.js --nhl` on every push, so a change that alters games without a re-saved reference is caught before it is live. The engine checks need only Node.
2. The two unit tests step 3 left unwritten: one save roll per shot, and the penalty-kill clear distance. Both need a small hook inside `movePuck` (an `fx`-style event for a save roll and for a clear would do).

## Known weaknesses

`docs/MODELING.md` keeps the list, in order of how much each matters. Read it before choosing what to work on.
