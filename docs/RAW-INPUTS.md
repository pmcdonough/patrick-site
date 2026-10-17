# Raw inputs

The source files the repo's data was built from. They live in `raw/` at the repo root, which is git-ignored because the shot files are 136 MB. Download each file below into `raw/` under the name shown when you want to refit or re-ingest. Every script reproduces its committed output exactly from these files, so running them is safe: a clean `git status` afterward means nothing changed.

| File | What it is | From | Retrieved | Used by |
|---|---|---|---|---|
| `skaters.csv` | MoneyPuck 2025-26 regular season, one row per skater per situation (all, 5on5, 5on4, 4on5, other) | https://moneypuck.com/data.htm, season downloads | 2026-10-12 | `tools/mp_extract.py` |
| `goalies.csv` | MoneyPuck 2025-26 goalies, same layout, with shots and goals by danger tier | same | 2026-10-12 | `tools/mp_extract.py` |
| `teams.csv` | MoneyPuck 2025-26 teams: for and against totals by situation | same | 2026-10-12 | `tools/mp_extract.py` |
| `lines.csv` | MoneyPuck 2025-26 forward lines and defense pairs | same | 2026-10-12 | not read by any script today; it informed the line combinations in `rosters.json` |
| `shots_2024.csv` | MoneyPuck 2024-25 shots, one row per unblocked shot (119,870 rows) | https://moneypuck.com/data.htm, shot data | 2026-10-13 | `tools/xg_fit.py` |
| `shots_2025.csv` | MoneyPuck 2025-26 shots (119,271 rows) | same | 2026-10-13 | `tools/xg_fit.py` |
| `play-by-play-2025020812.json` | NHL play-by-play for game 2025020812, Montreal at Boston, January 24, 2026 | https://api-web.nhle.com/v1/gamecenter/2025020812/play-by-play | 2026-10-13 | `tools/game_load.py` |
| `shiftcharts-2025020812.json` | NHL shift chart for the same game | https://api.nhle.com/stats/rest/en/shiftcharts?cayenneExp=gameId=2025020812 | 2026-10-13 | `tools/game_load.py` |
| `ring/raceway.json` | Every `highway=raceway` way round the Nürburgring from OpenStreetMap, with geometry: the Nordschleife's 52 named segments among them | Overpass API, https://overpass-api.de/api/interpreter, query `way["highway"="raceway"](50.31,6.92,50.39,7.02);out tags geom;` (send a User-Agent, or it answers 406) | 2026-10-17 | `tools/ring_track.py` (fetches it if missing) |
| `ring/laguna-raceway.json` | Every `highway=raceway` way round Laguna Seca from OpenStreetMap (the lap is eight one-way segments; the pit lane is left out) | Overpass API, query `way["highway"="raceway"](36.576,-121.764,36.594,-121.742);out tags geom;` | 2026-10-17 | `tools/circuit_track.py laguna` (fetches it if missing) |
| `ring/laguna-elev.json` | Heights of Laguna's 144 points from the USGS 10 m elevation model | https://api.opentopodata.org/v1/ned10m | 2026-10-17 | `tools/circuit_track.py laguna` |
| `ring/elev.json` | Heights of the lap's 384 points from the EU-DEM 25 m model, keyed by latitude and longitude | https://api.opentopodata.org/v1/eudem25m, 100 points a request | 2026-10-17 | `tools/ring_track.py` (fetches what is missing) |

MoneyPuck data is free for non-commercial use with credit to MoneyPuck.com. The NHL API is public and needs no key. OpenStreetMap data is © OpenStreetMap contributors under the ODbL; EU-DEM is from the Copernicus programme, served by Open Topo Data. Ring Kart's Nordschleife is drawn from both, scaled to a third and smoothed; Laguna Seca from OpenStreetMap and the USGS's 10 m model, served by Open Topo Data.

## Commands (from the repo root)

```
python3 -m venv .venv && .venv/bin/pip install -r tools/requirements.txt

# Ring Kart's lap -> public/ring-kart/data/track.json (standard library only; fetches into raw/ring/ what is missing)
python3 tools/ring_track.py --check         # 'track.json matches its inputs' means it reproduces
python3 tools/ring_track.py                 # writes the file
python3 tools/circuit_track.py laguna --check   # Laguna Seca -> public/ring-kart/data/laguna.json, the same way

# ratings and benchmarks -> public/bruins-vs-canadiens/data/moneypuck-2025.json
python3 tools/mp_extract.py raw --check      # prints every field that would change; 0 means it reproduces
python3 tools/mp_extract.py raw              # writes the file

# expected-goal model -> public/bruins-vs-canadiens/data/xg-model.json (about a minute)
.venv/bin/python tools/xg_fit.py raw/shots_2024.csv raw/shots_2025.csv

# play-review game file -> public/play-review/data/game-2025020812.json
python3 tools/game_load.py raw/play-by-play-2025020812.json raw/shiftcharts-2025020812.json

# then check that both pages load it
node tools/smoke.js
```

## Refreshing for a new season

Download the four season files and the shot file for the new season into `raw/`, add the new season's record to `rosters.json` (the `record` block per club), update the lineups in `rosters.json`, and run the three commands above. `mp_extract.py` only keeps players named in `rosters.json`, matched by MoneyPuck name (`mpName` in the extract); a new player needs his `mpName` set once. Then recalibrate at the NHL-average tick (`node tools/calibration.js`, `node tools/nhl-average.js`) and compare with the baselines in `docs/ENGINE.md`.

## Another game for Play Review

Fetch the two NHL URLs with the new game ID, save them in `raw/` with the ID in the name, run `game_load.py`, and point the page's `get('data/game-....json')` line at the new file (`docs/PLAY-REVIEW.md`).
