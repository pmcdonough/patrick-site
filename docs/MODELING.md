# Modeling guide

Every model in this repo, what it is built on, how it was fit or tuned, and where the numbers live. Read this to know which parts are measured, which are calibrated, and which are inferred or mocked. The other docs go deeper: `ENGINE.md` for the code, `XG-MODEL.md` for the expected-goal fit, `PLAY-REVIEW.md` for the review page.

| Model | What it answers | Built on | How it was set | Lives in |
| --- | --- | --- | --- | --- |
| Player ratings | How good is each skater at shooting, passing, defending, skating; each goalie by danger tier | MoneyPuck 2025-26 skaters, lines, goalies files; Hockey-Reference stat lines as fallback | Formulas on per-60 rates and percentiles, shrunk for small samples; the recipe is in `tools/mp_extract.py` and `data/ratings.json` | `tools/mp_extract.py`, `data/ratings.json`, `data/moneypuck-2025.json`, `rosters.json` |
| Skating physics | Top speed, acceleration, braking, cruising effort, bursts | NHL EDGE public benchmarks (top speeds 19 to 23 mph, bursts per game) | Calibrated: speed = 27 + 6 times the skate rating in ft/s, acceleration 21 ft/s² | `data/physics.json` skater |
| Fatigue | How a shift wears a skater down | Line-change and shift-length guidance (NHL.com, coaching references) | Set by hand: fades from 30 s, gassed at 65 s, speed down 25%, acceleration 35%, hands 60% worse | `physics.json` skater.fatigue |
| Decision model | When the carrier shoots, passes, carries, chips, dumps or clears; what everyone else does | Coaching references for systems; tuned against MoneyPuck league rates | Rules in code, thresholds in data; since 0.35 shoot-or-pass is decided by the expected-goal model, the volume rules retuned to the low-danger mix | `systems.json`, `physics.json` shotDecision, engine `carrierThink` and `formationSpot` |
| Systems | Where the five skaters stand in each forecheck, breakout, entry, zone shape, coverage, power play and penalty kill | Coaching references cited in the file | Drawn as team-relative coordinates; described per option | `systems.json` |
| Line changes | When a unit changes and who goes through which door | NHL.com and coaching guides on changing on the fly | Change windows and shift targets as data; stoppage rules in code | `systems.json` deployment |
| Rules and officials | Offside, hybrid icing, penalties, freezes; where the three officials stand | NHL rulebook; league offside and icing rates per game | Rules in code; rates matched to benchmarks in `physics.json` rulesBenchmarks | engine, `physics.json` |
| Expected goals | How likely a shot scores, from where and how it was taken | 237,055 MoneyPuck unblocked shots, 2024-25 and 2025-26 | Logistic regression, holdout log loss 0.226 (MoneyPuck 0.218); dataset means for unmeasured features | `tools/xg_fit.py`, `data/xg-model.json` |
| Shooter finishing | Does this shooter beat or trail his expected goals | Same shot files, shooters with 60 or more shots | (goals + k) / (xG + k), k = 40 shots at the league rate, clamped 0.6 to 1.6 | `xg-model.json` shooters |
| Goalie save | Does the goalie stop this shot | MoneyPuck goalie save percentage by danger tier | Goal probability = xG over the league on-net share, times the goalie's tier goal rate relative to the league, times 0.72 | engine save roll, `physics.json` goalie |
| Reality check | Is the sim producing the real game's rates | MoneyPuck team and league per-game rates, league offside and icing rates | Compared over the last lab run (or the current game); cells more than 50% off are flagged; record and points % against each club's final record | Lab tab, `moneypuck-2025.json`, `rosters.json` record |
| Shootout | Who wins a game tied after overtime | League shootout conversion rate (about a third), shooter ratings, goalie high-danger save rate | Three shooters a side then sudden death; chance = league rate scaled by shooting and goalie quality in tight, clamped 8% to 70% | engine `shootout`, `physics.json` game.shootout |
| Matchup lab | Which systems win more against the opponent's systems | The engine itself, played many times | Monte Carlo over 10 to 100 games; W-L-OTL, win and points % with a 95% Wilson interval, goals, xG and shots per game; one-card sweeps. Unvalidated: system effects have not been checked against real results | Lab tab, engine `playGames` |
| Game ingestion | Where each real shot was taken, by whom, with whom on the ice | NHL play-by-play and shift chart | Coordinate conversion to an attacking frame; on-ice from shift windows | `tools/game_load.py`, `play-review/data/game-*.json` |
| Position inference | Where the other nine skaters probably were at a real shot | The sim's systems and coverage rules | Teammates on the club's offensive-zone spots, defenders on zone coverage with box-out, slot and pressure rules | `play-review/index.html` reconstruct |
| Pass scoring | Was a pass worth more than the shot | The xG model on the receiver's inferred spot | Receiver one-timer xG, times completion (0.96 minus 0.0045 per ft, 0.45 through a lane), times pressure (0.6 within 4 ft, 0.85 within 8), times 0.9 | `play-review/index.html` score |
| Drive scoring | Was walking the puck in worth more than the shot | The xG model at a spot 15 ft closer and 6 ft toward the middle | Arrival chance 0.88 minus 0.3 per other defender in the corridor, times pressure at the new spot; the closing man is assumed beaten and the page says so | `play-review/index.html` score, `RP_DRIVE` |
| Replay | What the seconds around the shot looked like | The real preceding event and shot, the inferred spots | Mock movement in ice time at real skating and carrying speeds, scenario-based starts, puck from the previous event, real result and the alternative as a ghost on one rink; slow motion is playback, not the clock | `play-review/index.html` buildClip and frame |

## Three kinds of number

Measured numbers come straight from a source and can be checked against it: a player's save percentage by tier, the league's shots per game, a shot's coordinates. They are cited in the data file that holds them.

Calibrated numbers are chosen so the sim reproduces a measured number: skating speeds against EDGE, decision rates against the danger-tier mix, `tierGoalScale` against goals per game. Each one is in a data file with a description that says what it was tuned to, and `docs/ENGINE.md` records the baselines they produce.

Inferred and mocked numbers are the engine's or the page's own guesses where no data exists: where the other skaters stood at a real shot, and how everyone moved in the seconds around it. The review page labels every panel that shows one, and nothing inferred feeds back into a measured or calibrated number.

## Provenance rules

The raw inputs (MoneyPuck CSVs, NHL JSON) are not committed; the scripts that turn them into the compact JSON files are (`tools/mp_extract.py`, `tools/xg_fit.py`, `tools/game_load.py`), and the outputs carry a `sources` block with the file names, row counts and terms. Each script reproduces its committed output exactly from the inputs listed in `docs/RAW-INPUTS.md`. Refitting means re-running the script, never editing the numbers. The expected-goal formula is implemented twice, in the engine and in the review page, and both read the same `xg-model.json`.

## Known weaknesses, in order of how much they matter

1. The sim's shot mix has more medium-danger looks than the real game; the goal scale compensates and the reality check shows it. Fixing it means better defensive coverage, not a different scale.
2. The review page's inferred positions make the net-front pass look available more often than it is. Tracking data is the fix; until then the page says so on every panel.
3. The decision model decides when to shoot from a geometric shot quality, not from the xG model. Switching it is the natural next engine change.
4. The replay is a reconstruction for the eye, with no claim to accuracy beyond the real event locations and the real result.
5. Systems are drawn from coaching references, not from either club's observed play; a pre-scout product needs observed systems per opponent.
6. The matchup lab compares strategies inside the model only. A difference between two rows is what the engine thinks, and the engine's system effects have not been validated against real results. The interval shows the model's own sampling noise, not its bias.
