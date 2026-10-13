# Changelog

The site is versioned as a whole; each project keeps its own number too. Site 0.34 = sim 0.31 + Play Review 0.6. Site versions before 0.31 tracked the sim's number.

## Site

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
