# patrick-site

Personal site for sharing interactive models and side projects, mostly built with AI coding tools. Everything is static and runs in the browser. The site is served from `public/`.

```
public/
  index.html                       home page: simulations and experiments
  bruins-vs-canadiens/
    index.html                     the hockey engine, single file, no build step
    data/                          the data that drives it (see below)
CHANGELOG.md                       version history for the projects
```

To run locally, serve `public/` with any static server, for example `npx serve public` or `python3 -m http.server --directory public 8000`. The hockey page also works when opened straight from disk; see the note on data loading below.

## Bruins vs Canadiens

A 5-on-5 hockey engine, not a scripted animation. Real 2025-26 rosters with every skater rated from his stat line, shots graded by location against MoneyPuck expected-goal rates, goalies stopping pucks at their actual save percentages by danger tier, and skating calibrated to NHL EDGE tracking. Each team runs selectable systems that can be changed mid-game, and a built-in reality check grades every game against how the real teams played.

Plain HTML, CSS and JavaScript on a 2D canvas. No libraries, no build step. The current version number is shown in the page footer and in the `VERSION` constant at the top of the script.

### What the engine models

**Players.** Four forward lines, three defense pairs and two goalies per club, with jersey numbers and 2025-26 stat lines. Each skater gets four ratings (shoot, pass, def, skate) derived from MoneyPuck per-60 rates and percentiles, with a fallback formula from the basic stat line for players with too few minutes. Top speed and acceleration are scaled from the skate rating against NHL EDGE burst and top-speed benchmarks.

**Decisions.** A carrier decides each tick whether to shoot, pass, carry or dump, based on shot quality from his location, lanes to the net and to teammates, pressure, and the team's chosen systems. Shots are classified in-tight, slot, perimeter or point, and every attempt is tagged with a danger tier that maps to a league expected-goal value.

**Systems.** Formations are team-relative coordinates in `data/systems.json`: four forechecks (1-2-2, 2-1-2, 1-3-1 trap, left wing lock), three breakouts (up the boards, stretch pass, reverse), four zone entries (headman, carry wide, chip and chase, dump and chase), three offensive-zone structures (cycle low, umbrella, crash the net), two defensive-zone coverages (zone, man-on-man), three power plays (1-3-1, umbrella, overload) and three penalty kills (passive box, diamond, aggressive box). Each club's coaching card sits above its bench and changes take effect on the next play.

**Pace.** Once a team has possession in its own zone the forwards burst north ahead of the puck and the carrier wheels out with speed; on the rush all three forwards are at full effort. The cycle rotates corner, half wall and net front every few seconds so nobody stands still in the offensive zone.

**Line changes and fatigue.** Forwards and pairs change separately, on the fly only when the carrier is through the neutral zone or the other team is retrieving deep in its own end, never off a loose puck or while defending. Shift length is not a hard rule: after about 30 seconds a skater loses top speed, acceleration and hands, and is gassed by 65 seconds. A unit stuck in its own zone plays tired, which is where goals against come from. Each bench has two doors, forwards through the door at the attacking end and defense through the other, swapping when the teams change ends. Stoppage changes follow the visitors-first rule with the home team getting the last change, and the team that iced the puck cannot change.

**Goalies.** A goalie is drawn and modeled as a line squared to the puck. A shot that crosses the line is a save with probability equal to that goalie's real 2025-26 save percentage for the shot's danger tier; rebounds are steered to the corners, and the goalie freezes the puck more often with traffic in the crease.

**Rules and officials.** Offside with the tag-up rule, hybrid icing judged at the dots, icing waived while shorthanded, minor penalties with power plays, too-many-men bench minors on bad changes, and goalie freezes. Three officials work NHL mechanics: the referee at the goal line in the zone, the lead linesman on the blue line for offside, the trail linesman on the red line for icing.

**Reality check.** The Advanced tab compares the simulation's per-game rates (shot attempts, shots on goal, goals, expected goals, blocks, misses, danger-tier mix, penalties, faceoff percentage, goalie freezes, offsides, icings) with each club's real 2025-26 rates and the league average, and can batch ten headless games to average them and show the win record. Cells more than 50 percent off the real rate are flagged. That table is the engine's to-do list.

### The data that drives it

Everything a hockey person might question lives in `public/bruins-vs-canadiens/data/`, not in the engine.

| File | What it holds |
|---|---|
| `rosters.json` | Lineups for both clubs, every player's 2025-26 stat line, jersey numbers, injuries, and a `sources` list with the URL each fact came from |
| `ratings.json` | The formulas that turn a stat line into the skater and goalie ratings, with weights, clamps and the precedence rule between MoneyPuck-derived and stat-line ratings |
| `systems.json` | Formations as team-relative coordinates for every system, zone-entry and dump parameters, clearing rules, breakout timing, offensive-zone motion, line rotation patterns, shift targets, change windows and the late-game bench-shortening rule, with references |
| `physics.json` | Skating speed and acceleration (NHL EDGE-calibrated), effort, fatigue, pass and shot speeds and accuracy, puck friction and board restitution, goalie coverage and save model, shot blocking, turnover and penalty rates, officials' speeds, rink geometry, and the offside and icing benchmarks, with references |
| `moneypuck-2025.json` | Extract of MoneyPuck's 2025-26 skaters, goalies and teams files for the two rosters: per-60 rates, percentiles, derived ratings, goalie save percentage by danger tier, team and league per-game benchmarks used by the reality check |
| `defaults.json` | Build defaults for the engine multipliers and both teams' systems, in the format the Advanced tab's Export button produces |

When the page is served over HTTP it fetches these files, so edits take effect on reload. When it is opened directly from disk, browsers block `fetch`, so the page falls back to copies embedded in the HTML. The Data sources panel in the Advanced tab says which copy is in use. To change the build defaults, adjust the sliders and systems, click Export, and overwrite `defaults.json` and the embedded copy.

Formation coordinates are in feet and team-relative: `fx` runs from the team's own goal line (0) up ice (64 own blue line, 89 red line, 114 far blue line, 178 far goal line); `fy` runs across the ice 0 to 85 with 42.5 at center. The engine mirrors them for whichever end the team is attacking.

### Sources

MoneyPuck 2025-26 skaters, goalies, lines and teams downloads (ratings, danger tiers, save percentages, per-game benchmarks). NHL EDGE tracking for skating speed and burst benchmarks. Hockey-Reference 2025-26 regular-season statistics for the stat-line fallback ratings. League offside and icing rates, line-change guidance and shift-length norms are cited per file in each `references` block.

### Controls

Game tab: pause, 1x / 3x / 8x speed, new game, Effects (skate trails, puck streaks, hit and block ripples, save flash, goal light) and Sticks. Rosters tab: who is on the ice, time on ice and current shift, goals and blocks, with each player's stat line on hover. Advanced tab: the reality check, engine settings with a tick at the NHL-calibrated value, save and export, and data sources.

### Versioning

Bump `VERSION` in the script, add a line to `CHANGELOG.md`, and update the version badge on the home page card.
