# Play Review

The first slice of the counterfactual play-review product described in the product brief: one real game, every unblocked shot scored by expected goals against the best pass the model saw from the same spot. Version 0.1, at `public/play-review/`.

## What it shows

Montreal 3 at Boston 4, January 24, 2026, TD Garden, NHL game 2025020812. For each club, the ten shots where a pass was worth more than the shot taken, ranked by the gap in expected goals, with the real shot on the left and the model's alternative on the right. Header stats: shots scored, how many had a better pass option (gap over 2 points), expected goals by team, goals.

## Data pipeline

1. `play-by-play.json` from `https://api-web.nhle.com/v1/gamecenter/2025020812/play-by-play` (public, no key). 316 events with coordinates in the NHL frame (x from -100 to 100, y from -42.5 to 42.5), the players involved, the strength code and which end the home team defends.
2. `shiftcharts.json` from `https://api.nhle.com/stats/rest/en/shiftcharts?cayenneExp=gameId=2025020812`. 748 shifts with start and end times by period.
3. `python3 tools/game_load.py play-by-play.json shiftcharts.json` writes `public/play-review/data/game-2025020812.json`: the 40 dressed players, 108 shot attempts (38 on goal, 37 missed, 26 blocked, 7 goals) each with its coordinates converted to an attacking frame (feet from the goal line the shooter is attacking, feet off the midline), the event before it, the strength, and the skaters on the ice for both teams from the shift chart.
4. The page loads that file plus the sim's `xg-model.json` and `systems.json` over HTTP when served, and falls back to copies embedded in the page when opened from disk, the same way the sim does. `tools/build.py` keeps the embedded copies current.

## Reconstruction

Public data places the shooter and the puck. Nobody else. The page infers the other nine skaters:

- Teammates go to the spots of the offensive-zone system the sim runs for that club (Boston cycle low, Montreal umbrella, from `systems.json`), mirrored to the puck side, with roles assigned from NHL position codes. A teammate who would stand on the shooter is nudged aside.
- Defenders go to the sim's zone-coverage spots in their own frame, then react the way the engine's coverage does: a defenseman boxes out the net-front man goal-side, the center plays goal-side of the slot man, and the nearest free defender closes on the shooter.
- The goalie sits 2.5 ft out, slightly toward the shooter's side.

Every rink panel is labeled "inferred positions" and the method note says so in words.

## Scoring

Shot taken: the xG model with the real shot type (NHL type names mapped to MoneyPuck's), the strength from the situation code, and a rebound flag when the previous event was a shot by the same team within 3 seconds, times the shooter's finishing.

Each teammate: xG of a one-timer (type SNAP) from his inferred spot, times his finishing, times a pressure factor (0.6 with a defender within 4 ft, 0.85 within 8 ft), times the chance the pass arrives (0.96 minus 0.0045 per foot, floor 0.4, times 0.45 if a defender is in the lane), times 0.9 for the one-timer having to get off. The best teammate's value minus the shot's xG is the gap, shown in points (hundredths of a goal).

Shots from more than 75 ft out and shots with fewer than three teammates on the ice are left out.

## What it proves and does not

It proves the pipeline end to end: real events in, scored alternatives out, on the rink people have already seen. It does not prove the alternatives, because the teammates' positions are a guess from the system, and the top of the list is dominated by one pattern: a point shot when a net-front pass to a well-placed teammate scores higher. Sometimes that is the right criticism of the play and sometimes the net-front man was not open at all. That is exactly the question the validation step and tracking data answer. Read the list as ten clips to pull, not ten verdicts.

## Running another game

Grab the two NHL files for any game ID, run `tools/game_load.py`, and change the `get('data/game-2025020812.json')` line in the page (or make it a query parameter, which is the obvious next step). The systems used for inference are hard-coded per club near the top of the script (`OZ`); other clubs need an entry there.

## Next

In priority order from the brief: zone-entry review (the next play type), decision-agreement validation on a season of shots, a game picker and per-player view, and then the conversation about tracking data.
