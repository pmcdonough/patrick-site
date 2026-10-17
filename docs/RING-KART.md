# Ring Kart

A kart-style race round the Nürburgring Nordschleife in real cars, drawn like a 1970s Saturday-morning cartoon. Version 0.5 (site 0.100), live at `/ring-kart/`. You start outside the Ring in the Touristenfahrten queue behind Porsches, GTIs and a few fun old cars, tap your ticket at the barrier, and race the cars that went in ahead of you to the gantry.

This file is the whole reference for the project: what it is, how it is put together, the API of each module, the design system, how it was built and why it is the way it is, and recipes for building on it. The site-wide rules (static files, version stamps, plain copy, one commit per version, the checks) are in `CLAUDE.md` and `docs/ARCHITECTURE.md`; Ring Kart follows all of them.

## Contents

1. What the player sees
2. Architecture
3. The modules and their APIs
4. The data model
5. The tracks (and the Nordschleife)
6. Driving and the AI
7. The cars
8. The look: design system
9. The page: session, input, camera, HUD, sound
10. Invariants
11. Checks
12. How it was built
13. How to build on it
14. Limits and what comes next
15. Real lap times

## 1. What the player sees

1. **Pick how much help and a car**: Beginner, Intermediate or Expert (section 6 has what each does), then VW Golf GTI, Porsche 911 GT3 RS, Ford Bronco Sasquatch (the owner's family truck: the GT3 RS's figures, engine and DRS under an open, lifted Bronco with the family aboard and a reggae soundtrack), Honda Civic Type R, Mazda MX-5 (NA) or Volvo 240 Estate, each with bars for top speed, acceleration, grip and drift, and your best time in it on that mode. The camera circles your car in the queue. The picker shows the key map and the gas switch.
2. **The queue**: four rivals ahead of you, two fast cars (a GT3 RS and an AMG GT R) behind. The barrier lifts for one car every 2 s and the queue creeps up. At the front, Space, Enter, a tap or the A button lifts it for you.
3. **The race**: six rivals (two already through the gate) and the two chasers, through 22 slow cars doing the lap at their own pace and keeping right. Position counts who is furthest round; the clock runs from your barrier to the gantry, the real "bridge to gantry" time.
4. **On the way**: position top left; the gaps to the car ahead and behind top right; the pace note top centre (the next corner, Left or Right 1 to 6, and how far) with BRAKE when you are too quick for it; corner names as you reach them; and along the bottom the onboard telemetry strip, after the broadcast laps: the map, gear and speed, the revs as a row of rising bars to the car's redline (as on Porsche's own onboard broadcast) that flash at the change, in the GT3 RS the rear wing in profile with its DRS flap and a DRS chip (grey, ready, open), brake and gas bars, the clock in hundredths, the drift and turbo charge, and the height of the lap lit as far as you have come.
5. **The driver's hands**: a small inset above the strip's left end, as on a broadcast: the wheel turns with your steering, shift lights across it fill with the revs, the gear shows in its middle, and a paddle flicks on each change. Hidden on phones.
6. **The gantry**: your time, your place, the order with each car's time, a new best per car if you set one, and how far off the pro you were once you have watched the pro in that car.

**Watch a pro lap** (on the car picker, and after every race): your car alone on the lap, driven by the pro on the best line at the best speeds from the barrier to the gantry, filmed by a director who cuts between cameras like a TV broadcast: a fixed camera on the outside of each tight corner that turns and zooms to hold the car as it passes (with a whoosh), the helicopter on the long straights, low tracking shots beside the car, in front of it, behind it and on the bonnet, slow motion off every jump, and a camera past the gantry for the finish, in slow motion. The telemetry, the pace notes, the corner names and the best line run throughout. C switches between the director, behind and the bonnet; L hides the line; Esc or Stop ends it. At the end: the pro's time, then Drive it yourself (with the line on), Watch again, or Change car.

**The best line** (a switch on the picker, L, or Line on a phone): the pro's line painted on the road as inked chevrons, each stretch coloured for what your feet should be doing there: green gas, yellow coast, orange brake, red brake hard. A coach sticker on the left says the same a moment ahead, with the speed the line carries there. The colours are worked out for the car you pick, so they always match the pro in that car.

Controls, chosen so a lap that is all gas and brake sits under two hands:

| Key | Does |
|---|---|
| Up (or W) | Gas |
| Left, Right (or A, D) | Steer; eased in over about a sixth of a second, so a tap is a correction and a hold is full lock |
| Space | Brake; a tap is a dab, a hold is everything; never reverses |
| Down (or S) | Brake, and reverse from a standstill; let go and the car stops, or press Up to drive forward |
| Shift | Drift; hold through a corner, let go for a mini-turbo (blue, then orange) |
| E | Horn; slow traffic just ahead pulls over |
| Q | Look back, while held |
| G | Gas always on (also a switch on the picker) |
| C | Camera: behind, high, on the bonnet (on the pro lap: the director, behind, the bonnet) |
| L | The best line and the coach, on or off |
| R | Back on the road |
| X | DRS, in the GT3 RS and the Bronco: opens the wing flap on a straight; it shuts itself when you brake, turn or the straight ends |
| Esc or P, M, F | Pause, mute, full screen |

A gamepad works (stick, triggers, A for the ticket, bumpers or B to drift, Y for DRS, Start to pause). On a touch screen: Left and Right under the left thumb; under the right thumb a pedal block, Drift over Brake with a tall Gas beside them; small buttons down the right for DRS (in the GT3 RS), the camera, the line, the horn and a reset; tap the picture to tap your ticket. The buttons show only while you drive (on the pro lap only Camera and Line), and the stage fills the screen and scrolls into view when you start. The mouse and touchpad are deliberately not used to steer: a kart game wants steering, gas and drift held at once, which a touchpad cannot do, and dragging a mouse to steer is tiring over three minutes.

## 2. Architecture

Ring Kart is a static page with no build step: plain JavaScript modules, two JSON files, one stylesheet, and Three.js r128 imported from Cathedral Lab's vendored copy. The code is in three layers, and each may import only from the layers below it.

```
  page          src/main.js          the session, input, camera, HUD, the loop; window.ringKart for the checks
                     │
  browser       src/scene.js         the 3D world and cars (Three.js)      src/audio.js   the synthesized sound
                     │                                                           │
  pure          src/track.js         the road from the points               src/drive.js   physics, AI, gearbox
  (Node too)         │                src/line.js  the best line, its speeds and phases, the pro    │
  data          data/track.json      the traced lap, build settings          data/cars.json the cars, the race rules
```

- **Data** holds every number a person might question, each with a `desc`, as the hockey sim's data does: the traced points and how the lap is built, the cars' figures, and the race rules (queue, slipstream, mini-turbo, grass, the Armco, the rubber band, game gravity).
- **Pure** modules have no `document`, `window` or Three.js. They take plain objects and return plain objects, so `tools/test/ring-kart.test.js` builds the lap and drives every car round it in Node.
- **Browser** modules turn the pure state into pictures and sound. They never change game state.
- **The page** owns the session and the loop. It reads input, steps the pure physics, then draws.

The loop (`frame` in `main.js`): each animation frame is split into fixed physics steps of 1/120 s (`tick`), so the driving is the same at any frame rate; then `draw` moves the meshes to the cars, emits particles, places the camera, updates the HUD and the sound, and renders. Drawing only reads state. The game is not seeded: the queue's order and the traffic come from a seed made from the clock, and particles use `Math.random`. Unlike the hockey sim, nothing needs a race to replay exactly; the checks drive on autopilot and test outcomes (distance covered, a lap finished), not bit-for-bit results.

Units and coordinates: metres and seconds throughout; speeds in game m/s (times 3.6 is the km/h on the dial). The world is x east, z the other ground axis, y up. A car's heading `h` is `atan2(dz, dx)`; a mesh's `rotation.y` is `-h`. Along the road, a sample index `k` (every `track.ds`, 2 m) and a sideways offset `lat` (positive to the right) give a point with `pointAt(track, k, lat)`. Road curvature `curv[k]` is positive in a right-hander.

## 3. The modules and their APIs

### `src/track.js` (pure)

| Export | What it does |
|---|---|
| `buildTrack(T)` | From `track.json`: a centripetal Catmull-Rom curve through the points, scaled to the real length and then by `lengthScale`, sampled every `sample` metres. Returns `{ n, ds, L, x, z, y, h, curv, bank, marks, wallL, wallR, drsZone, width, verge, gateAt, crests }` (typed arrays of length `n`; `drsZone` marks where the road runs straight for the next 80 m) |
| `pointAt(track, k, lat)` | The point at sample `k`, `lat` metres right of the centre line, with its height (banking included) and heading |
| `locate(track, x, z, hint, span)` | The sample nearest a position, searching near `hint`; how a car knows where it is |
| `locateGlobal(track, x, z)` | The same over the whole lap, for a rescue |
| `cornerAt(track, k)` | The named corner a sample belongs to |

### `src/drive.js` (pure)

| Export | What it does |
|---|---|
| `makeCar(spec, track, k, lat)` | A car object at a place on the road (fields in section 4) |
| `step(car, dt, track, R, others)` | One physics step: speed, steering on a grip limit (more in a banked corner turned into, as `cornerSpeed` assumes), drift and mini-turbo, slipstream, DRS, grass, the Armco, hills, flight and landing. `R` is the `race` block of `cars.json` |
| `etiquette(car, dt, track, cars, E)` | The Ring's etiquette for an AI car: with a quicker car closing from behind, after the driver's own reaction time (`car.manners`), and only where the road ahead has no tight bend, it signals (`car.blink`) and makes room on the right. `driveAI` calls it when given `opts.etiquette` (`race.etiquette`) |
| `drs(car, track, want)` | DRS for a car that has it: opens the flap on `want` in a `drsZone`, shuts it on the brakes, past a little steering, in a drift or when the straight ends. Returns `'open'`, `'ready'` or `''` |
| `collide(cars)` | Bumps between cars, two circles each, heavier cars push lighter ones |
| `cornerSpeed(car, track, pace)` | The fastest the car can be going now and still make every corner within braking reach at `pace` of its grip. The AI drives to it; the page calls BRAKE against it |
| `nextCorner(track, k, ahead)` | The next corner as a co-driver calls it: `{ dir, grade, dist, len, tightens, at }`, grade 1 (a hairpin, radius under 16 m) to 6 (under 95 m) |
| `assist(car, track, M)` | The driving aids for the player, from a mode in `race.modes`: changes `car.input` before `step`, never the physics. The brake aid brakes to `cornerSpeed` at `M.brake` of the grip; the guard follows the car `M.guard.look` seconds ahead and, within `margin` of the Armco, blends in the AI's steering and brakes if the turn back needs more grip than there is. Returns how hard it worked, 0 to 1 |
| `driveAI(car, dt, track, cars, opts)` | Sets `car.input` for an AI car: speed from `cornerSpeed`, a line (the inside of what is coming for racers, the right for traffic), passing on the left. `opts.paceScale` is the rubber band |
| `gearbox(car, dt)`, `engineOf(spec)`, `BOXES` | The engine and gearbox the dials and the engine note share, from the car's `engine` in `cars.json`: called once a physics step for the car you hear, keeps `car.gb` (`gear`, `rpm`, `limiter`, and counts of changes `ups` and `downs`). Twin-clutch boxes change up at the redline in a few hundredths of a second and down one gear at a time under braking with a blip; a manual is slower, an old automatic slower and lazier. Sound and dials only: the physics drives the same in any gear |

### `src/line.js` (pure)

| Export | What it does |
|---|---|
| `racingPath(track, margin)` | The best line, the same for every car: a sideways offset per sample. Starts on the centre line and repeatedly pulls each point toward the middle of its neighbours (at reaches of 60, 32, 16 and 8 m), kept `margin` (1.2 m) inside the road edge, so it settles into out, apex, out. Stays central through the queue and the gate |
| `lineFor(track, lat, spec, pace)` | For one car: the line's curvature (over 24 m, and over 8 m where a corner is genuinely tight, so hairpins are not averaged away), the speed it can carry at each point (`pace` of its grip, 1.0 for the pro), a forward pass for accelerating out of each corner and a backward pass for braking into it, both from the car's own figures and `step`'s drag and hill terms, from a standstill. Each point gets a phase (`PHASE`: gas, coast, brake, hard), braking zones graded by how much speed they shed. Returns `{ lat, v, vc, phase, kap, ks, hd, x, z }` |
| `drivePro(car, dt, track, line)` | The pro: steers for the line's own curvature (feed-forward) and corrects for its distance and heading off the line; holds the line's speed a moment ahead; never brakes at a standstill (that would be reverse) |

The pro laps every player car without touching the grass or the Armco, within a few metres of the line, quicker than the AI (the GTI in 3:32, the GT3 RS in about 3:08).

### `src/scene.js` (browser, Three.js)

| Export | What it does |
|---|---|
| `buildWorld(scene, track)` | Road, verges, kerbs, Armco and posts, catch fences, the ground and fields, the forest, painted words, corner boards, the gate and the gantry. Returns `{ gate: { pivot, lamp } }` for the page to lift the barrier |
| `buildSky()`, `HORIZON` | The sky dome, the striped sun, the painted hills, the clouds; follows the camera. `HORIZON` is the fog colour |
| `carMesh(body)` | A car from its `body` (section 7). The group carries `wheels` (to spin), `tail` (the brake-light material) and `ink` (the outline, hidden on the bonnet camera) |
| `label(text)` | The name sprite over a car |
| `buildLine(track, lat)`, `PHASE_COLOURS` | The best line painted on the road, a ribbon of inked chevrons; `paint(phase)` recolours it for a car |
| `PAL`, `setInkFog(fog)` | The palette, and the fog the ink outline fades into |

### `src/audio.js` (browser, Web Audio)

`new Sound()`: `start()` on the first click or key (browsers require it), `update(car, mode, dt)` every frame (the engine from `car.gb`, tyres in a drift, wind with speed, whoosh on a turbo, thud on a bump), `hear(d, vr)` (where the listener is: the page passes the camera's distance and closing speed, for distance and the Doppler shift), `beep()`, `finish()`, `horn()`, `toggle()`, `quiet()`.

The engine note is synthesized from the car's engine, not recorded. A four-stroke fires each cylinder once every two turns, so the fundamental is the engine cycle (rpm / 120 Hz) and the loud partials are the firing order (the cylinder count times the cycle) and its multiples, with a little of every other partial for roughness; a flat-six keeps its high partials (the howl). Two copies a few cents apart, a soft clipper driven harder under load, a resonance and a low-pass that opens with revs and throttle. On each change up the ignition cuts (a crack in a PDK, a brap in a DSG); on each change down the throttle blips and the exhaust pops; off the throttle high in the revs it crackles; turbo cars whistle and sigh when you lift. The reference was an onboard GT3 RS lap: a 9,000 rpm flat-six on a seven-speed PDK.

### `src/main.js` (the page)

Marked sections: data, 3D, particles, cars, the session, the car picker, input, the gate, the loop, the pro lap, drawing (and the camera), the director, HUD, pace notes and the coach, sound, size. For the checks, `window.ringKart` exposes `VERSION`, `track`, `S`, `cars`, `player`, `line`, `shot` (the director's current shot), `keys`, `start()`, `watch()`, `ticket()`, `autopilot(on)` and `run(seconds)`, which steps the game without drawing so a whole lap takes a few seconds.

## 4. The data model

**`data/track.json`**: `build` (each `{ value, desc }`: `lengthScale` 0.33, `realLength` 20800, `heightScale` 0.42, `sample` 2, `width` 13, `verge` 4, `gateAt` 70) and `points`, 69 of `{ p: [east, north] in km, el: metres, name?, crest?, bank? }`.

**`data/cars.json`**: `stats` (what each figure means), `player` (5 cars with `id`, `name`, `note`), `rivals`, `chasers`, `traffic`, and `race`, the rules. A car is `{ name, vmax, accel, grip, brake, drift, mass, pace, body }`; `body` is `{ style, len, wid, hgt, color, trim, wing?, roofbox? }` with the real car's length, width and height in metres.

**A car at run time** (`makeCar`): position `x, y, z`, heading `h`, speed `v`, vertical speed `vy`, place on the road `k`, `s` (metres along) and `lat`; state `air`, `drift` (`{ dir, t }` or null), `boost`, `slipT`, `grass`, `scrape`, `landed`, `bump`, `slide`, `pitch`, `roll`; `input` `{ steer, gas, brake, drift }`. The page adds `role` (player, rival, chaser, traffic), `released`, `releasedAt`, `done`, `time`, `hidden`; the AI adds `ai` and, after a honk, `yieldT`.

**The session** (`S` in `main.js`): `mode` (pick, queue, race, done, pro, proDone), `timeScale` (slow motion on the pro lap), the clock `t`, the `queue`, the barrier, `raceStart` and `raceT`, the finishers, the corner banner, the camera mode, pause.

**Kept in the browser** (`localStorage`, prefix `ringkart.`, every read and write in try/catch): `car` (the last pick), `mode`, `lap2.best.<car id>` (Expert), `lap2.best.<mode>.<car id>` (Beginner and Intermediate), `lap2.pro.<car id>` (the pro's time, once watched), `sound`, `autoGas`, `line`. The `lap2.` times are on the real lap (0.8 on); the keys without it are from the hand-traced lap, a different length, and stay in the browser untouched.

## 5. The tracks

Three, listed in `data/tracks.json` and picked above the cars (switching reloads the page with `?t=`): the Nordschleife (`track.json`, format `ring`: the queue, the gate, traffic, the gantry), Laguna Seca (`laguna.json`, format `circuit`: three laps from a grid) and the Coast Road (`coast.json`, format `sprint`: from a grid to a finish). Each track file carries its `look` for `buildWorld`: `theme` (`forest` the Eifel's spruces and lollipop trees; `dry` golden grass and oaks; `coast` the sea to the left of the road a few metres below its lowest point, a beach, palms, no catch fences), the `words` painted on the road, the `start` and `finish` signs, and a `lighthouse`. Best times are kept per track (the Ring's under `lap2.`, the others under their id).

**Circuits.** `buildTrack` lays a closed loop out as one long road: `preN` points of the lap's end before the start line (the grid stands there), the loop `laps` times end to end, and `postN` points of run-off. It returns the start line `startK`, each lap's line `lineK`, the finish `finishK`, the samples in a lap `lapN`, and `drawA` to `drawB`, the one lap the world, the map and the height strip are drawn for. Because the laps are one road, the best line, the pro, the AI, the pace notes, the director and DRS work on a circuit unchanged; the barrier between close stretches skips the same place a lap later. The line's ribbon is drawn for the second lap, a flying one. The pro drives one lap (`proFinishK`).

**The grid** (`gridSetup`, `gridStep`): seven rivals (from `rivals` and `chasers`) and you sixth, two by two behind the start line; the cars are held where they stand (the gas only revs) while five red lights come on a second apart, and all go when they go out, between 5 and 6 s in. The strip's label counts the laps on a circuit (a toast at each line, Final lap on the last) and names the run elsewhere.

**Laguna Seca** comes from `tools/circuit_track.py laguna`: the circuit's eight one-way segments in OpenStreetMap chained into the loop (the pit lane left out), started at the start/finish line 520 m before the Andretti Hairpin's segment, resampled every 25 m (144 points), heights from the USGS 10 m model blurred over 40 m, at 60% (a 2.2 km lap) with heights at 0.75. A circuit is a config entry there: its box, its elevation dataset, where the line is, its look.

**The Coast Road** is made up in `coast.json`: 47 points laid out by hand and scaled to 7.6 km, one to one, with three crests for the dune jumps. Its tightest corner is 21 m and it has no close stretches.

## 5b. The Nordschleife

Since 0.8 the real road. `tools/ring_track.py` chains the Nordschleife's 52 one-way segments in OpenStreetMap (each named for its corner) into the loop, cuts out the lap from the T13 entry round to a gantry before Tiergarten (20,075 m on the map; the official lap with the T13 straight is 20.832 km). The real Touristenfahrten gantry stands before Antoniusbuche, where the speed limits step down for the exit, and 0.8 ended there; 0.9 runs on through Antoniusbuche, because the whole Döttinger Höhe flat out is the best part of the lap. The script resamples it every 50 m (402 points), looks up each point's height in the EU-DEM 25 m model (342 m at Breidscheid to 625 m at Hohe Acht) and blurs the heights over about 120 m, names each point where a segment starts (41 names, from the Sabine-Schmitz-Kurve to Antoniusbuche), and carries over what a map cannot give by name: the four jumps and the Karussell's and Mini-Karussell's banking. Where two stretches of the lap pass closer than 58 m (in real metres; only the climb to the Karussell and the way out of it), it eases them apart, by up to 13 m, so both roads and a barrier fit at the game's scale. Its raw downloads stay in `raw/ring/` (git-ignored), and `--check` proves the committed file is what they give. Until 0.7 the lap was 68 points traced by hand.

`buildTrack` draws a centripetal Catmull-Rom curve through the points, scales it to the real length and then by `lengthScale` (0.33, about 6.6 km and three and a half minutes in a GT3 RS), and samples it every 2 m. Heights run straight between points and are smoothed, scaled by `heightScale` so the hills stay steep (easing to flat at every point, as until 0.7, turned a descent with a point every 50 m into a staircase). A car's height between two samples is measured along its own arc, which in a corner is longer on the outside and shorter on the inside; measured on the centre line it jumped a few centimetres as the nearest sample changed, and on the real lap's steep corners that threw the cars into the air 25 times a lap. Crests are short sharp bumps: at speed the road falls away faster than gravity, which makes the jumps. Banking eases between points that have it (the Karussell and the Kleines Karussell). Where two stretches of road pass close, including the two legs of a hairpin, one barrier stands halfway between them. The Armco stands a verge's width outside the road, pulled in on the inside of tight corners so it never folds over itself.

Pace notes come from the same curvature: `nextCorner` grades a corner by its tightest radius.

**DRS zones** (`drsZone`): where the road runs straight for the next 80 m, with nothing tighter than a 100 m radius, past the gate, keeping only stretches of 30 m or more. On the real lap that is six: after the Flugplatz, the Fuchsröhre, Exmühle, Bergwerk to Kesselchen, Senkenlinks and the Döttinger Höhe with Antoniusbuche (640 m in the game, where a GT3 RS reaches about 264 km/h in sixth).

## 6. Driving and the AI

Arcade, kart-game handling, deliberately not a simulation:

- The car goes where it points. Acceleration fades toward top speed; braking, rolling drag, and a climb's pull at about half of real gravity.
- Steering asks for a yaw rate from a 5.2 m turning circle at full lock; grip caps it at grip × g / speed, and asking for more scrubs speed (understeer).
- Drift (the button, steering, above 12 m/s) turns 0.75 to 1.5 times what grip allows, steered into or out of, and charges a mini-turbo: past 0.9 s a blue spark (0.8 s of boost), past 1.9 s orange (1.5 s). A boost adds push and 28% top speed.
- Slipstream: within 26 m behind a car and 3 m of its line for 1 s, 12% more top speed.
- Grass: hard drag and 45% of top speed. The Armco puts you back against it and turns you along it; a square hit keeps 72% of your speed. (On Expert. Beginner and Intermediate soften both; see the driving modes below.)
- Flight: the car follows the road until the road falls away faster than game gravity (15 m/s²) would take it, then flies until the road comes back up.
- Bumps: two circles per car; heavier cars push lighter ones.
- Banking: turning into a banked corner (the Karussell) the car may turn 1 + 1.2 × the bank angle (radians) harder, as `cornerSpeed` and the AI always assumed; until 0.8 the physics did not give it, which on the real lap's tight Karussell put the Beginner aid's car into the outside Armco.
- DRS (the GT3 RS, `drs` in its figures): open, top speed rises 6% and aero drag falls 30%, at 4% of the grip; it shuts on the brakes or in a corner. The pro opens it wherever the straight allows, and the best line's speeds count it.

The AI looks ahead for the slowest corner it can still brake for (`cornerSpeed`, at `pace` of its grip), steers at a point down its line, and passes slower cars on the left; traffic keeps right, as on the real Touristenfahrten, and pulls further over for three seconds after a honk.

**Ring etiquette** (`etiquette`, `race.etiquette`, since 0.10, as the owner described the real thing): a slower car with a quicker one closing from behind (within 45 m, closing at 1.5 m/s or more; a rival only for a car 5 m/s quicker) puts its right indicator on, moves to the right three quarters of the half-road, lifts to 94%, and pulls back once the other car is 8 m past. Not perfectly: the page gives each driver a reaction time (0.4 to 2 s) and a courtesy, a driver below `ignore` never bothers, and nobody moves over unless the next 70 m has no bend tighter than 70 m, because a coordinated pass in a tight corner is hard. The indicator comes on halfway through the reaction time, before the car moves. When a quicker car closes on you, a sticker says so, and your own right indicator flashes once you move over. Rivals get a light rubber band (`race.rubber`): far ahead they ease off, far behind they push. Every number here is in `cars.json`.

**The driving modes** (`race.modes`, the player only). The walls are what beat a new player: most hits come from arriving too fast, when grip cannot turn the car and it runs wide into the rail, so the brake aid does most of the work and the guard catches the rest.

| Mode | Brake aid | Guard off the Armco | Square hit keeps | Grass |
|---|---|---|---|---|
| Beginner | brakes to 0.9 of the grip | 0.7 s ahead, from 2.2 m, firm | 92% | 70% of top speed, light drag |
| Intermediate | only past 1.3 of the grip | 0.5 s ahead, from 1.5 m, light | 82% | 55%, more drag |
| Expert | none | none | 72% | 45%, the race's own |

`step` reads a mode's `wall` and `grass` from `car.mode`; the page sets it on your car only, so the AI and the pro always drive on the race's own numbers, and the pro is always Expert. The aids leave a good driver alone: the AI laps every car in the same time with Beginner's help. A Help flag shows on the strip when they work hard.

## 7. The cars

Real models, arcade numbers in the right order: the GT3 RS is the fastest thing in the lot and the Volvo 240 is a Volvo 240.

Bodies are built in `carMesh` from each car's real length, width and height and its style: coupe, hatch, sedan, wagon, van, roadster or tiny. Since 0.7 they are smooth cartoon shells, after the owner asked for round edges like an animated film's cars instead of panels. A style (`STYLE` in `scene.js`) is a side view, in shares of length from the back and of height:

- `top`: the body's upper line, back to front (boot, beltline, bonnet, nose);
- `cab`: the glasshouse, four points from the foot of the rear window round to the foot of the windscreen (`null` for the roadster, which gets a windscreen, seats and a driver);
- `wheels`: the two axles; `b`: where the B-pillar stands; `panel`: paint the glasshouse solid back to here (a van's load bay).

The body is a loft (`loft`): at every step along the car a superellipse section (`se`, a square with its corners blown round, flatter underneath), as wide as the car in the middle and closing into a round nose and tail (`plan`). Its top follows the `top` line, blurred so no corner survives (`smooth`), with the wings swelling over each wheel; its bottom rises over each wheel to just above the axle, so the tyres tuck up under the wings. The glasshouse is a second, narrower loft sitting on the body, with the windows painted on a canvas in its own coordinates: side glass split at the B-pillar, the windscreen over the front slope, the rear window over the back one, each pane ringed in ink with a glint across it, and the roof and pillars in the body colour. The body's own canvas carries the paint, a highlight along each shoulder and the twin stripes. Then round headlights and tail lights set into the surface (squashed balls placed with the loft's normal), a wide grille, slim lips, mirrors, the wing or the roof box, fat round-shouldered tyres on chrome dishes, German number plates, an exhaust, the ink outline and a soft oval shadow. Trim, black and chrome parts are each merged into one geometry (`merge`), so a car is a handful of draw calls. No badges, logos or faces.

**The Bronco kit** (`kit: "bronco"`, the owner's 2025 two-door Bronco Sasquatch, black): the `bronco` style (flat, square, short overhangs, no glasshouse), lifted 0.5 m on 0.6 m tyres with mud-terrain blocks under black flares, square sections (`se` at 7) and blunt ends; painted with the open tub and the door openings dark, black flares and rock rails. Then a near-upright windscreen of see-through glass in a black frame, mirrors on its hinges, a roll cage (two hoops and top rails, `tube`), seats, a steering wheel, the family (five cartoon figures from a picture the owner chose: Dad at the wheel in a blue polo, Mum in orange-red with her hair in a bun and hoop earrings, a daughter with long brown hair in blue stripes, a son in orange, a little daughter in an orange floral dress; big eyes and a smile toward the front), a surfboard strapped along the cage on its own pivot (`grp.flap`, lifted 0.12 rad by DRS), round headlights in white rings at the ends of a wide black grille, a steel bumper with red tow hooks and a skid plate, tall tail lights and the spare on the tailgate. `faceX` and `backX` find the square nose and tail. The family's faces are the only faces on any car.

**The race kit** (`kit: "race"`, the GT3 RS since 0.8, after a picture the owner chose; silver with black accents and a black stripe, the owner's colours): the `gt3` style (a 911's high rear deck, fastback roof and low bonnet), lower, wheels a size bigger and pushed out under flared arches, front wings that rise either side of the bonnet with the frog-eye headlights on top (an inner ring in each), a wide mouth with corner intakes, a splitter and canards, a light bar across the tail, twin exhausts, five-spoke wheels on a dark dish inside a bright lip. Painted on its canvas: one black stripe 0.46 m wide from the tail's top edge to the bonnet's front edge (a share of the girth that grows as the body narrows, so it stays the same real width), black sills, a pinstripe, bonnet vents, a vent behind each front wheel and an intake ahead of each rear, and a door roundel with the number, the right way up from each side; on the glasshouse a roll cage through the glass and a sun strip reading RING KART. The swan-neck wing has tall end plates and the DRS flap on its own pivot (`grp.flap`), which the page swings flat when DRS opens. No maker's lettering or crest.

## 8. The look: design system

The theme is a 1970s Saturday-morning cartoon (the Hanna-Barbera and Tom and Jerry era of backgrounds): flat colour, warm ink, painted skies. Earlier versions looked different; see section 12.

**Palette** (`PAL` in `scene.js`, the same tokens in `style.css`):

| Token | Colour | Used for |
|---|---|---|
| ink | `#2a1a0e` | outlines, sticker borders, drop shadows: a warm brown, never black |
| cream | `#fff1cf` | stickers, edge lines, Armco, signs |
| mustard | `#f2b631` | corner names, labels in the strip, a stripe |
| orange | `#ec6f2b` | titles, the lap line, primary buttons, a stripe |
| red | `#d8402b` | BRAKE, you on the map, kerbs, a stripe |
| brown | `#6b3e1e` | sign lettering, the telemetry strip (`#3b2414`) |
| avocado | `#8a9a2b` | gas, Go |
| teal | `#2f9c9a` | the shift light, the drift charge |

**Rendering**: every material is `MeshToonMaterial` with one three-step ramp (`RAMP`): shadow, middle, lit, no gradients. Cars and trees carry an ink outline: a twin of the mesh drawn inside out (`BackSide`) and pushed out along smoothed normals (`inkNormals`, which averages normals over every vertex at the same spot so hard edges do not crack), in a small shader (`inkMat`) that works for instanced meshes and fades into the fog. Trees are instanced (about ten thousand, five draw calls). The sky is a vertex-coloured dome (turquoise to cream), a striped 70s sun, a band of painted hills in three rows, and outlined puffy clouds, all following the camera, with the fog the colour of the horizon so the world fades into the painting.

**Motion**: cars squash on a hard landing and stretch under a turbo; the turbo also draws zoom lines and warms the vignette; drift smoke and dust are round inked puffs; the BRAKE cue thumps.

**Type**: Shrikhand for the big words (title, position, corner names, signs, BRAKE), Righteous for numbers and labels, Barlow for reading. Canvas textures use the same fonts, so the page waits up to 2.5 s for them before painting the signs.

**HUD rules**: everything over the picture is an inked sticker (cream, 3 px ink border, a hard 4 px drop shadow, round corners) or inked lettering; the telemetry strip is a brown dashboard under three racing stripes. Information sits where a broadcast puts it: position and gaps in the top corners, the next corner top centre, telemetry along the bottom. Nothing animates unless it means something (a turbo, a late brake, a new corner).

**The page around the game** uses the same tokens: cream and brown in light mode, dark brown in dark mode, the title in Shrikhand over the three stripes.

## 9. The page: session, input, camera, HUD, sound

- **Session** (`setup`, `release`, `queueStep`, `tick`, `result`): `pick` (the camera circles your car), `queue` (the barrier releases one car every `race.release` seconds once the arm is down; you creep up and tap your ticket at the front), `race`, `done` (your car coasts, the result comes up after 1.6 s). The pro lap (`startPro`, `proTick`, `proResult`) is `pro` then `proDone`: your car alone, the barrier up, `drivePro` at the wheel; the loop slows time to 0.3 while the car is in the air and to 0.45 for two seconds after the gantry.
- **The director** (`director`): picks a shot when the last one ends (in game time, so slow motion stretches a shot): `trackside` before the next corner of grade 3 or tighter (it also cuts early to one once a shot has run 2 s), `jump` the moment the car leaves the ground, `finish` 140 m from the gantry, and otherwise `heli`, `front` or `low` on straights and `chase`, `low`, `bonnet`, `front` or `heli` elsewhere, never the same twice running. Fixed cameras zoom to hold the car's size in frame. About 60 cuts a lap.
- **Input** (`readInput`): keys, touch buttons and the gamepad are read every physics step. Digital steering is eased (`wheel.v`), the brake comes on over a tenth of a second, Space never reverses, and with the gas always on the car drives forward unless you brake.
- **Camera** (`camera3`): behind (7.2 m back, 2.8 m up), high (13 m, 5 m) and bonnet (just behind the windscreen; on a tall phone screen at the nose). Q turns it round. The field of view widens with speed and a turbo; landings and bumps shake it, and on the bonnet the road shudders through it.
- **HUD** (`hud`, `paceNotes`, `drawTach`): the map and the height profile are drawn once to an offscreen canvas and the cars dotted on every frame; the dials ease toward the gearbox and the pedals; text updates about ten times a second.
- **Sound**: synthesized, nothing downloaded; it starts on the first click or key, and mutes with M.

## 10. Invariants

- `track.js` and `drive.js` stay pure: no `document`, `window`, Three.js or `Math.random`. The tests import them in Node.
- Drawing never changes game state; `step` and `driveAI` are the only things that move a car.
- Every tunable number lives in `data/` with a `desc`, not in the code.
- Every file the page loads carries `?v=` with Ring Kart's version; Three.js carries Cathedral Lab's. `tools/bump.js kart` and `tools/bump.js cathedral` update them; `smoke.js` fails if any disagree.
- Copy is plain, in driving terms, with no em dashes and no file or function names on the page.

## 11. Checks

| Run | Proves |
|---|---|
| `node --test tools/test/ring-kart.test.js` | the lap is the real length at the game scale with its corners in order; every player car drives the whole lap on the AI in Node, and the GT3 RS beats the Volvo |
| `node --test tools/test/ring-kart.test.js` (third test) | the best line stays on the road; in every player car every phase appears and the pro laps without grass or Armco, within 6 m of the line, quicker than the AI |
| `node --test tools/test/ring-kart.test.js` (later tests) | reverse stops when you let go and the gas drives you out of it; every player car works through its gears on the pro lap without over-revving or lugging, and the GT3 RS changes up at its measured 8,600 rpm; DRS opens only on a straight, shuts on the brakes and in corners, and is faster |
| `python3 tools/ring_track.py --check` | the committed `track.json` is exactly what the raw OpenStreetMap and elevation downloads in `raw/ring/` give (only where those downloads are present) |
| `node --test tools/test/ring-kart.test.js` (fourth test) | a clumsy driver (flat out, never braking, steering late) in every player car hits the Armco at least 15 times on Expert, a third as often or less on Intermediate, never on Beginner; the AI is no slower with Beginner's help |
| `node tools/smoke.js` | the page loads with no errors, the stamps agree, and a car queues, goes through the gate and is 300 m or more down the road 20 s later on autopilot; then, last and on a page of its own (it is the heaviest thing the check does), the pro laps the GTI clean |

For a change to the look, take screenshots: a short Playwright script that opens the page, calls `ringKart.start()`, drives with `ringKart.run()` and `autopilot(true)`, and screenshots `#stage` in each camera at desktop and phone widths (swiftshader works headless). Every look change in 0.2 to 0.4 was checked this way, and it caught real bugs: trees drawn black, headlights hidden inside the bodywork, and the bonnet camera inside the ink outline.

## 12. How it was built

Each version was one session's work and one commit; the changelog has the detail.

- **0.1 (site 0.94)**: the game from an idea in a chat session: the queue and the gate, the hand-traced lap, arcade driving with drifts and mini-turbos, the AI and traffic, a plain 3D world with box cars, a simple HUD and synthesized sound. The physics and the lap were written pure from the start so Node could drive them.
- **0.2 (site 0.95)**: onboard telemetry after a broadcast lap (a Porsche onboard was the reference: map, gear, speed, revs, pedals, timer), the gaps, one gearbox for dials and sound, a bonnet camera, a sky with reflections, spruces, fences and brake lights. Found and fixed: every tree had been drawn nearly black (instance colours multiplied by an already dark material).
- **0.3 (site 0.97)**: cars drawn from side views per style instead of boxes, merged into a few draw calls; eased keyboard steering.
- **0.4 (site 0.99)**: the controls rethought around a lap that is all gas and brake (Up for gas, Space to brake, Shift to drift), pace notes and a BRAKE cue from the AI's own corner speeds (split out of `driveAI` unchanged, so the AI drives exactly as before), gas always on, a horn, look back; and the 70s cartoon look, replacing the realistic one.

- **0.5 (site 0.100)**: the pro lap and the best line, from one new pure module (`line.js`), so what you are shown and what the pro drives cannot disagree; the director's cut; and the phone fixed after a screenshot from a real phone (buttons overlapping each other and the prompt, the corner buttons under the thumbs). Found on the way: the pro reversed off the start (a brake pedal at a standstill is reverse), a speed profile that braked for wiggles in the tracing (curvature measured over too short a span), and the gas switch, which did nothing until you picked a car.
- **0.12 (site 0.111)**: two tracks after the owner asked how hard another would be, a real one popular in games and a made-up one: Laguna Seca with laps, and the Coast Road. Laps came almost free by laying a circuit out lap after lap as one long road. Laguna showed the pro slower than the AI; the cause was the best line hugging the inside of hairpins (curve shortening), fixed with passes that lower the line's bending, which also took 8 s off the pro on the Ring. On phones the picker became the whole screen.
- **0.11 (site 0.110)**: the owner found a GT3 RS stuck behind the barrier on the climb to the Karussell. Shrunk to a third, the road up and the road out had come to overlap, and the car's road search jumped from one to the other. Fixed in the map builder (close stretches eased apart), the barriers (one between close stretches) and the search (a few metres only); a new test drives cars every which way and fails on any escape.
- **0.10 (site 0.109)**: Ring etiquette, after the owner described it (signal right, move over, let the quicker car by on the left, but not reliably and not in tight corners), with a reaction time and courtesy per driver; and the owner's own car, a family Bronco with a surfboard and a reggae groove, a GT3 RS underneath. The etiquette test first expected the slower car to be well over to the right by the time it was passed; at 70 km/h of closing speed a real driver has about a second and a half, so the test now asks for a signal, a move and a pass on the left.
- **0.9 (site 0.107)**: the whole Döttinger Höhe back. 0.8 ended the lap at the real gantry, before Antoniusbuche, which cut the straight to 1.2 km; the owner missed it, so the lap now runs on to Tiergarten (one line in `tools/ring_track.py`).
- **0.8 (site 0.105)**: everything from one planning round with the owner. The real lap from OpenStreetMap and the EU elevation model (the build machine could reach them this time, Overpass once given a User-Agent). Moving to it found three bugs the hand-traced lap had hidden: heights that eased to flat at every point (a staircase on a 50 m spacing), a car's height between samples measured on the centre line (25 flights a lap, some at 50 km/h), and banking that the AI counted on but the physics never gave. The best line learned that a quick S averages to a straight over 24 m and that hugging the inside of a hairpin bunches the offset points, so it now has a floor from the road's own radius. The GT3 RS's engine was matched to an onboard recording of the real car (its partials, its 8,600 rpm shift, a tenth-of-a-second PDK glide), and checked by rendering the game's engine and measuring it the same way. DRS on the straights, a broadcast-style rev bar, the wing in profile and the driver's hands inset. And the GT3 RS as a silver-and-black widebody racer after a picture the owner chose: flared arches, frog-eye lights on raised front wings, a wide mouth and splitter, bonnet vents, a black stripe, a door roundel, a roll cage through the glass and a swan-neck wing whose flap opens with DRS. Best times on the new lap are kept apart from the old one's.
- **0.7 (site 0.102)**: smooth round cars in place of panels (lofted shells with painted windows), after the owner asked for the look of an animated film's cars; a real engine note and gearbox per car after an onboard GT3 RS lap (9,000 rpm flat-six, PDK upshifts with an ignition crack, rev-matched downshifts that pop), heard from where the camera is, with the Doppler shift on the pro lap's trackside cameras. Fixed: a car in reverse kept reversing after you let go, and the gas did nothing until it stopped, because rolling resistance always pushed backwards and the gas only worked going forward.
- **0.6 (site 0.101)**: Beginner, Intermediate and Expert, after the owner found it too hard to stay off the walls. The aids were tuned in Node against a deliberately clumsy driver before anything was drawn: a guard on the steering alone barely helped, because the hits come from arriving too fast, so the brake aid (the AI's own corner speed) carries Beginner and, set past the grip, Intermediate.

Decisions worth keeping:

- **Arcade, not simulation.** The lap is a third of real length and the handling is a kart game's, because the point is three fun minutes, not a lap-time model. A real-car mode against real lap times is the next big step (section 14) and will sit beside the arcade game, not replace it.
- **Hand-traced, not downloaded.** The lap came from public maps by hand because the build machine could not reach OpenStreetMap. The order, direction and heights of the corners are right; the radii are approximate.
- **One Three.js.** Ring Kart imports Cathedral Lab's vendored copy rather than adding its own, so the site has one copy, one licence and one version to upgrade.
- **Keyboard and gamepad, not mouse.** See the controls above.
- **Pure physics.** It costs nothing and buys tests that drive every car round the lap in Node in a fraction of a second.
- **One line, two uses.** The pro drives the same line and speeds the player is shown, so the line is honest: if you follow the colours you are doing what the pro does. The line is computed in the browser at load (about 15 ms) rather than stored, so it follows any change to the lap or the cars.
- **Not seeded.** Races vary on purpose. If replays or ghosts need exact repeats, seed the queue and replace `Math.random` in the physics path first (the particles can keep it).

## 13. How to build on it

**Add a car.** Add it to `player`, `rivals`, `chasers` or `traffic` in `data/cars.json` with its real length, width and height and a style. A player car needs an `id` and a `note`; the picker and the best times pick it up. Run the Ring Kart test (it drives every player car round the lap), then look at it in the picker.

**Add a body style.** Add an entry to `STYLE` in `scene.js`: the `top` line, the `cab` (four points, or `null`), the `wheels`, and optionally `b` and `panel`. The builder swells the wings over the wheels and rounds every corner, so the points can be rough. Check it in a lineup: render every car side by side, and close up from the front and the back, from a scratch page that imports `carMesh`.

**Give a car its engine.** Add `engine` to the car in `cars.json`: `cyl`, `idle`, `redline`, `box` (`pdk`, `dsg`, `manual` or `auto`), `gears` (the speed on the dial at the redline in each gear, from real ratios if you have them), and `turbo` or `flat` for the voice. A car without one gets a four-cylinder with six gears spread over its top speed. The gearbox test drives every player car's gears on the pro lap.

**Tune the best line or the pro.** The road margin and the reaches are in `racingPath`, the pace, the braking share and the phase thresholds in `lineFor`, the steering gains in `drivePro`. Run the third Ring Kart test after any change: it fails if the pro leaves the road, drifts off its line or stops beating the AI.

**Add a director shot.** Add a branch in `director` that sets `want`, `look`, `fov` and `ease` for the shot, and a rule for when to `cut` to it. A fixed camera sets `D.pos` once at the cut; a moving one is placed relative to the car every frame.

**Tune the handling.** Change the numbers in `cars.json` (a car's figures or the `race` block), never constants in `drive.js`. Run the test: if a car can no longer finish a lap on the AI, the change went too far.

**Change the lap.** Change `tools/ring_track.py` (the start and end, the spacing, the height blur, the jumps and banking by corner name) and rerun it; never edit `points` by hand. It fetches what `raw/ring/` lacks (Overpass needs a User-Agent; the elevation API takes 100 points a second). Then run the Ring Kart tests: on the real lap the pro, the modes and the jumps are where changes show first. Watch the jumps: the lap is shrunk three times more in length than in height, so a crest that lands in a corner (the Flugplatz did, at 4.4 m) puts the cars off the road.

**Add a HUD element.** Add markup inside `#hud` in `index.html`, style it with the tokens as a sticker or in the strip, and update it in `hud()` (every frame for anything that moves, inside the ten-a-second block for text). Hide it under 700 px if it does not fit a phone.

**Add a camera.** Add an entry to the `dist` and `ht` lists in `camera3` and widen `S.camMode`'s cycle; if the camera can sit inside your car, hide the car's ink (`pm.ink`) as the bonnet camera does.

**Add scenery.** Build it in `buildWorld` with `toon()` materials and the palette; place things with `pointAt(track, k, lat)`. Many copies of one thing should be an `InstancedMesh`; give it ink with `inkNormals(geometry)` and an instanced `inkMat`.

**The Bronco's music.** `Sound.music(on)` runs an original reggae groove scheduled a quarter of a second ahead on the audio clock: a one-drop (kick and rimshot on beat three, hi-hat on the off-beats), the skank on two and four, an organ bubble on the off-beats and a walking bass, I-IV-V-IV in G at 76 beats a minute, into `master` so the mute covers it, never through the listener's distance or Doppler. The page turns it on whenever the picked car's kit is `bronco` and off on pause.

**Add a sound.** A method on `Sound` that builds oscillators or filtered noise and connects them to `this.master`; call it from the page.

**Match an engine to a recording.** Record the real car (an onboard video's audio is fine for reference; never commit or ship it), find the engine order in its spectrum (the firing frequency is rpm / 120 × cylinders; a flat-six's strongest partials are the 3rd and 6th of rpm / 120), measure each partial against the firing one over frames where the revs are known, and put the strengths in the car's `engine.partials`. Then render the game's engine offline in headless Chromium (an `OfflineAudioContext` stepped with `suspend`, driving `Sound.update` with known revs) and measure it the same way: the GT3 RS's 18 partials land within 1.7 dB of the real car on average. The shift point and how long a change takes come from the same recording.

**Ship it.** `node tools/bump.js kart 0.x`, the changelog, the home card's badge, the site version, then `node tools/smoke.js` and the Ring Kart test, as `CLAUDE.md` describes.

## 14. Limits and what comes next

The roadmap (`docs/ROADMAP.md`) has the order. In short: real cars against real lap times (a model of each car from its power, weight, grip and aero, checked against the official times below, now on the real road); a ghost of your best lap and a time trial; and fewer trees and a coarser ground on small phones (in the software renderer the 70s world draws at about 2.5 frames a second, so a real GPU is doing a lot of work). Known limits today: the race is not replayable; the game's gantry is about 900 m past the real one; a rescue (R) puts you back within 3 m of the centre line without checking for traffic.

## 15. Real lap times

Official Nordschleife times on the 20.832 km lap, from the Nürburgring's list and Porsche, for the real-car mode:

| Car | Time | Note |
|---|---|---|
| Mercedes-AMG ONE | 6:29.090 | road-car record, 2024 |
| Porsche 911 GT2 RS (991) with Manthey kit | 6:43.300 | 2021 |
| Porsche 911 GT3 (992.2) with Manthey kit | 6:52.981 | 2025 |
| Porsche 911 GT3 (992.2) | 6:56.294 | 2025, Jörg Bergmeister |
| Porsche 911 Turbo S (992.2, T-Hybrid) | 7:03.92 | set autumn 2024, Jörg Bergmeister |
| Porsche 718 Cayman GT4 RS | 7:09.3 | 2021, Jörg Bergmeister; 7:04.511 on the old 20.6 km measure |
