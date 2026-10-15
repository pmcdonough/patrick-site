# Play Review

The first slice of the counterfactual play-review product described in the product brief: one real game, every unblocked shot scored by expected goals against the best pass the model saw from the same spot, with a replay of the seconds around each shot. Version 0.6, at `public/play-review/`.

## What it shows

Montreal 3 at Boston 4, January 24, 2026, TD Garden, NHL game 2025020812. For each club, the ten shots where a pass was worth more than the shot taken, ranked by the gap in expected goals, with the real shot on the left and the model's alternative on the right. Header stats: shots scored, how many had a better pass option (gap over 2 points), expected goals by team, goals.

## Data pipeline

1. `play-by-play.json` from `https://api-web.nhle.com/v1/gamecenter/2025020812/play-by-play` (public, no key). 316 events with coordinates in the NHL frame (x from -100 to 100, y from -42.5 to 42.5), the players involved, the strength code and which end the home team defends.
2. `shiftcharts.json` from `https://api.nhle.com/stats/rest/en/shiftcharts?cayenneExp=gameId=2025020812`. 748 shifts with start and end times by period.
3. `python3 tools/game_load.py play-by-play.json shiftcharts.json` writes `public/play-review/data/game-2025020812.json`: the 40 dressed players, 108 shot attempts (38 on goal, 37 missed, 26 blocked, 7 goals) each with its coordinates converted to an attacking frame (feet from the goal line the shooter is attacking, feet off the midline), the event before it, the strength, and the skaters on the ice for both teams from the shift chart.
4. The page loads that file plus the sim's `xg-model.json` and `systems.json` over HTTP. `node tools/review.js` checks that it scores every shot as in its saved reference.

## Reconstruction

Public data places the shooter and the puck. Nobody else. The page infers the other nine skaters:

- Teammates go to the spots of the offensive-zone system the sim runs for that club (Boston cycle low, Montreal umbrella, from `systems.json`), mirrored to the puck side, with roles assigned from NHL position codes. A teammate who would stand on the shooter is nudged aside.
- Defenders go to the sim's zone-coverage spots in their own frame, then react the way the engine's coverage does: a defenseman boxes out the net-front man goal-side, the center plays goal-side of the slot man, and the nearest free defender closes on the shooter.
- The goalie sits 2.5 ft out, slightly toward the shooter's side.

Every rink panel is labeled "inferred positions" and the method note says so in words.

## Scoring

Shot taken: the sim's own xG model (`bruins-vs-canadiens/src/engine/xg.js`, with its rink and math, so the two pages can never disagree) with the real shot type (NHL type names mapped to MoneyPuck's), the strength from the situation code, and a rebound flag when the previous event was a shot by the same team within 3 seconds, times the shooter's finishing.

Each teammate: xG of a one-timer (type SNAP) from his inferred spot, times his finishing, times a pressure factor (0.6 with a defender within 4 ft, 0.85 within 8 ft), times the chance the pass arrives (0.96 minus 0.0045 per foot, floor 0.4, times 0.45 if a defender is in the lane), times 0.9 for the one-timer having to get off. The best teammate's value minus the shot's xG is the gap, shown in points (hundredths of a goal).

Shots from more than 75 ft out and shots with fewer than three teammates on the ice are left out.

## Scenarios

Added in 0.4. Three views of the same scored shots, chosen with the tabs above the list.

Pass worth more: shots ranked by how much the best pass option beat the shot taken (the original scenario).

Drive worth more: was walking the puck 15 ft closer, cutting 6 ft toward the middle for a better angle (or away from the man closing on the shooter if he is on that side), and shooting from there worth more? The page cannot see how close that man really was, so the drive assumes the cut beats him and charges for everyone else: the chance of arriving with the puck is 88% minus 30 points per other defender in a 4.5 ft corridor, and the look from the new spot keeps 60% with another defender within 4 ft and 85% within 8. Tips and deflections are excluded because nobody chose to shoot from there. Read a high gap as: if he had a step, the walk-in was worth it. Under the inference most drives are close to even with the shot, which is itself a finding: from the same lane, 15 ft of distance buys roughly what the turnover risk costs.

Right call: shots that beat every alternative (best pass and the drive) by the most, so the review is not only criticism. In this game about half the shots are the right call by this measure.

The replay's alternative follows the tab: the pass and one-timer, or the walk-in and shot, or whichever alternative scored higher on the right-call tab.

## Replay

Added in 0.2. The replay is a mock reconstruction drawn in the sim's style, not tracking, and every panel says so. Its inputs are real: the preceding event's type, location and time, the shot's location, type and result, and who was on the ice. Everything between those anchors is synthesized.

Views. One rink, three views: the default shows the real play with the model's alternative as a green ghost on the same clock from the moment of the shot (the pass or the walk-in, the ghost puck, the look it would have been), and the other two show either read alone. Side-by-side panels were dropped in 0.5 because two clips at once were hard to follow.

Timeline. All times are ice time, game-clock seconds relative to the shot. The lead-in is configurable from 2 to 8 seconds (default 5) and the clip runs 3 seconds after. Playback speed stretches ice time on the wall clock: 0.25x, 0.5x (slow motion, the default) and 1x (real time); the readout counts ice time, so in slow motion it ticks slowly. Play, pause, replay and a scrubber. Both panels share the clock; they are identical until the shot and diverge at zero.

Scenario. If the preceding event was outside the offensive zone, or was a faceoff, takeaway, giveaway or hit in the top of the zone, the clip is a rush; otherwise it is an in-zone clip. Skaters move at real speeds for the whole lead-in, so where they start is where that speed puts them `lead` seconds earlier: on a rush, forwards at 20 to 27 ft/s and defensemen at 17 to 23 ft/s with a slight lane angle, back-checkers at 18 to 25 ft/s, which means a 5 second lead-in starts in the neutral or defensive zone and the view widens to show it; in a cycle, everyone drifts at about 5 ft/s around his spot. Each skater arrives at his inferred spot shortly before the shot, the pressuring defender last. Offside is enforced: the clip finds when the puck crosses the attacking blue line, holds every attacker without the puck at the line until then, and lets them in over the next 0.7 s. The shooter and the carrier are exempt because their positions come from the real events. Movement between positions is eased (slow, fast, slow), with velocities derived for stick direction and skate trails. Sticks reach for the puck only when it is on the ice near them, never for a puck in flight, and the streak behind a moving puck follows its own path.

Puck. The puck starts at the real preceding event's location and is carried at 22 ft/s (about 15 mph). If that event is more than 45 ft from the shooter, the nearest teammate carries it and passes about a second before the shot at 70 ft/s; otherwise the shooter carries it himself. If the event is farther than the carry speed covers in the lead-in, the carry is already under way when the clip opens.

After the shot. The real play: the puck travels at 90 ft/s (120 for a slap shot) and the real result plays: a goal lights the lamp, a save stops at the goalie and rebounds to the corner, a miss goes wide and around the boards. The alternative (ghost, or alone in its view): the pass travels at 70 ft/s to the receiver, he releases a one-timer a quarter second later, and the puck reaches the net with the look's expected-goal value as the label. No result is invented for the alternative.

Nothing in the replay feeds the scoring. The scoring uses the shot's real location and the inferred spots; the replay only animates them.

Constants are at the top of the replay block (`RP`): lead-in bounds, seconds after, pass, shot and carry speeds, rush and back-check skating speeds, in-zone drift speed.

## What it proves and does not

It proves the pipeline end to end: real events in, scored alternatives out, on the rink people have already seen. It does not prove the alternatives, because the teammates' positions are a guess from the system, and the top of the list is dominated by one pattern: a point shot when a net-front pass to a well-placed teammate scores higher. Sometimes that is the right criticism of the play and sometimes the net-front man was not open at all. That is exactly the question the validation step and tracking data answer. Read the list as ten clips to pull, not ten verdicts.

## Running another game

Grab the two NHL files for any game ID, run `tools/game_load.py`, and change the `get('data/game-2025020812.json')` line in the page (or make it a query parameter, which is the obvious next step). The systems used for inference are hard-coded per club near the top of the script (`OZ`); other clubs need an entry there.

## Next

In priority order from the brief: zone-entry review (the next play type), decision-agreement validation on a season of shots, a game picker and per-player view, and then the conversation about tracking data.
