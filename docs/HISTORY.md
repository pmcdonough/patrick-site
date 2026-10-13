# Build history before version numbers

The engine was built in one long iterative session in October 2026, request by request, before a version number existed (the first numbered build is 0.21 in `CHANGELOG.md`). This is the order things were added and why, so the reasoning is not lost.

1. **Rink and systems.** A top-down animated rink with two teams and selectable systems. Players were generic dots, the rules were loose.
2. **Real rules.** Offside, icing and penalties added after the first review noted they were missing.
3. **Zone entries done the real way.** The first entry logic held the carrier at the blue line. Replaced with real strategy: headman the puck to the lead forward, carry wide, chip and chase, dump and chase, each selectable.
4. **Nets, officials, more shots.** Players stopped skating through nets. Three officials added (referee plus two linesmen) with a whistle visualization. Shot rate raised.
5. **Bruins vs Canadiens.** Real rosters with skill from stat lines, home and away benches, line changes on the fly researched from NHL shift norms: four forward lines, three pairs, top units play most.
6. **Line-change mechanics.** Unit staggering (forwards first, defense on the next window), solo changes, the next unit standing at the gate, overlap on the change, too-many-men bench minors, no change for the icing team, home team's last change with line matching, late-game bench shortening, power-play and penalty-kill units.
7. **Tracking-data pace.** Linesmen moved to lead/trail mechanics. Player movement aligned to NHL EDGE tracking: top speed, bursts, cruising effort. 1x speed set to real NHL pace, then raised again after it still looked slow.
8. **Shots versus shots on goal.** Attempts, blocks and misses modeled separately so shot volume is NHL-like while shots on goal stay around 28 to 32.
9. **Goalie as a line.** The goalie drawn and modeled as a line squared to the puck; a shot crossing the line is a save. Then smoothed so it stops twitching.
10. **Engine settings.** Sliders for acceleration, velocity and more, plus connecting plays and breakaway passes.
11. **Single-file download, mobile question.** A standalone HTML build. Mobile layout considered; a follow-the-puck camera was discussed and parked.
12. **Externalize the data.** Every driving number moved into JSON files with sources, with the product idea in mind: any NHL team, replay of real tracking data, AI-suggested alternatives to real plays.
13. **Shooting decisions and freezes.** Rules for when the carrier shoots (in-tight, slot must-shoot, perimeter through traffic, point shots) after players were seen passing up open looks. Goalie freezes driven by crease pressure. Bench labels moved above the players.
14. **Chip and chase, cycle low.** Fixed entries and systems that were not taking effect.
15. **MoneyPuck.** 2025-26 skaters, lines, goalies and teams files loaded: ratings from per-60 rates and percentiles, goalie save percentage by danger tier, team and league per-game benchmarks for calibration.
16. **Save and export.** Buttons to save current settings as defaults, export them, and bake the exported values into the build. Sliders centered on the build defaults with a tick at the NHL-average value. Settings apply live.
17. **Power-play freeze bug.** Everyone stopped moving during a power-play setup; fixed with the stuck rule and off-puck drift.
18. **Code sweep and layout.** Technical sweep, panel reorganization, the big text block replaced by an About dialog that includes the product vision.
19. **In-tight shooting.** A player alone in front with the puck now shoots.
20. **Hard dump and chase.** The dump became a hard rim around the boards to the far corner with a forward sprinting to beat the defense to it.
21. **Calibration explained, batch win record, Advanced tab.** The reality check explained in the app, ten-game batch with win record, calibration and settings grouped under Advanced, every technical mention removed from the app's copy, data sources listed only under Advanced and collapsed.
22. **Offsides and icings to real rates.** Rules researched and the engine adjusted until both matched league statistics.
23. **Coaching cards.** Systems controls moved above the rink beside each bench as real-time coaching cards.
24. **Change windows and fatigue** (became 0.21). Researched when teams change on the fly; the loose-puck change trigger was found to be the cause of lines peeling off during possession; fatigue model added so shift length is a consequence, not a rule.
