# Ring Kart

A kart-style race round the Nürburgring Nordschleife in real cars, drawn like a 1970s Saturday-morning cartoon. Version 0.4 (site 0.99), live at `/ring-kart/`. You start outside the Ring in the Touristenfahrten queue behind Porsches, GTIs and a few fun old cars, tap your ticket at the barrier, and race the cars that went in ahead of you to the gantry.

This file is the whole reference for the project: what it is, how it is put together, the API of each module, the design system, how it was built and why it is the way it is, and recipes for building on it. The site-wide rules (static files, version stamps, plain copy, one commit per version, the checks) are in `CLAUDE.md` and `docs/ARCHITECTURE.md`; Ring Kart follows all of them.

## Contents

1. What the player sees
2. Architecture
3. The modules and their APIs
4. The data model
5. The lap
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

1. **Pick a car**: VW Golf GTI, Porsche 911 GT3 RS, Honda Civic Type R, Mazda MX-5 (NA) or Volvo 240 Estate, each with bars for top speed, acceleration, grip and drift, and your best time in it. The camera circles your car in the queue. The picker shows the key map and the gas switch.
2. **The queue**: four rivals ahead of you, two fast cars (a GT3 RS and an AMG GT R) behind. The barrier lifts for one car every 2 s and the queue creeps up. At the front, Space, Enter, a tap or the A button lifts it for you.
3. **The race**: six rivals (two already through the gate) and the two chasers, through 22 slow cars doing the lap at their own pace and keeping right. Position counts who is furthest round; the clock runs from your barrier to the gantry, the real "bridge to gantry" time.
4. **On the way**: position top left; the gaps to the car ahead and behind top right; the pace note top centre (the next corner, Left or Right 1 to 6, and how far) with BRAKE when you are too quick for it; corner names as you reach them; and along the bottom the onboard telemetry strip, after the broadcast laps: the map, gear and speed, the revs on an arc with a shift light, brake and gas bars, the clock in hundredths, the drift and turbo charge, and the height of the lap lit as far as you have come.
5. **The gantry**: your time, your place, the order with each car's time, and a new best per car if you set one.

Controls, chosen so a lap that is all gas and brake sits under two hands:

| Key | Does |
|---|---|
| Up (or W) | Gas |
| Left, Right (or A, D) | Steer; eased in over about a sixth of a second, so a tap is a correction and a hold is full lock |
| Space | Brake; a tap is a dab, a hold is everything; never reverses |
| Down (or S) | Brake, and reverse from a standstill |
| Shift | Drift; hold through a corner, let go for a mini-turbo (blue, then orange) |
| E | Horn; slow traffic just ahead pulls over |
| Q | Look back, while held |
| G | Gas always on (also a switch on the picker) |
| C | Camera: behind, high, on the bonnet |
| R | Back on the road |
| Esc or P, M, F | Pause, mute, full screen |

A gamepad works (stick, triggers, A for the ticket, bumpers or B to drift, Start to pause), and on a touch screen there are on-screen buttons. The mouse and touchpad are deliberately not used to steer: a kart game wants steering, gas and drift held at once, which a touchpad cannot do, and dragging a mouse to steer is tiring over three minutes.

## 2. Architecture

Ring Kart is a static page with no build step: plain JavaScript modules, two JSON files, one stylesheet, and Three.js r128 imported from Cathedral Lab's vendored copy. The code is in three layers, and each may import only from the layers below it.

```
  page          src/main.js          the session, input, camera, HUD, the loop; window.ringKart for the checks
                     │
  browser       src/scene.js         the 3D world and cars (Three.js)      src/audio.js   the synthesized sound
                     │                                                           │
  pure          src/track.js         the road from the points               src/drive.js   physics, AI, gearbox
  (Node too)         │                                                           │
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
| `buildTrack(T)` | From `track.json`: a centripetal Catmull-Rom curve through the points, scaled to the real length and then by `lengthScale`, sampled every `sample` metres. Returns `{ n, ds, L, x, z, y, h, curv, bank, marks, wallL, wallR, width, verge, gateAt, crests }` (typed arrays of length `n`) |
| `pointAt(track, k, lat)` | The point at sample `k`, `lat` metres right of the centre line, with its height (banking included) and heading |
| `locate(track, x, z, hint, span)` | The sample nearest a position, searching near `hint`; how a car knows where it is |
| `locateGlobal(track, x, z)` | The same over the whole lap, for a rescue |
| `cornerAt(track, k)` | The named corner a sample belongs to |

### `src/drive.js` (pure)

| Export | What it does |
|---|---|
| `makeCar(spec, track, k, lat)` | A car object at a place on the road (fields in section 4) |
| `step(car, dt, track, R, others)` | One physics step: speed, steering on a grip limit, drift and mini-turbo, slipstream, grass, the Armco, hills, flight and landing. `R` is the `race` block of `cars.json` |
| `collide(cars)` | Bumps between cars, two circles each, heavier cars push lighter ones |
| `cornerSpeed(car, track, pace)` | The fastest the car can be going now and still make every corner within braking reach at `pace` of its grip. The AI drives to it; the page calls BRAKE against it |
| `nextCorner(track, k, ahead)` | The next corner as a co-driver calls it: `{ dir, grade, dist, len, tightens, at }`, grade 1 (a hairpin, radius under 16 m) to 6 (under 95 m) |
| `driveAI(car, dt, track, cars, opts)` | Sets `car.input` for an AI car: speed from `cornerSpeed`, a line (the inside of what is coming for racers, the right for traffic), passing on the left. `opts.paceScale` is the rubber band |
| `revs(car)`, `REDLINE` | The gearbox the dials and the engine note share: six gears over the top speed, `{ gear, rpm }` |

### `src/scene.js` (browser, Three.js)

| Export | What it does |
|---|---|
| `buildWorld(scene, track)` | Road, verges, kerbs, Armco and posts, catch fences, the ground and fields, the forest, painted words, corner boards, the gate and the gantry. Returns `{ gate: { pivot, lamp } }` for the page to lift the barrier |
| `buildSky()`, `HORIZON` | The sky dome, the striped sun, the painted hills, the clouds; follows the camera. `HORIZON` is the fog colour |
| `carMesh(body)` | A car from its `body` (section 7). The group carries `wheels` (to spin), `tail` (the brake-light material) and `ink` (the outline, hidden on the bonnet camera) |
| `label(text)` | The name sprite over a car |
| `PAL`, `setInkFog(fog)` | The palette, and the fog the ink outline fades into |

### `src/audio.js` (browser, Web Audio)

`new Sound()`: `start()` on the first click or key (browsers require it), `update(car, mode, dt)` every frame (engine from `revs`, tyres in a drift, wind with speed, whoosh on a turbo, thud on a bump), `beep()`, `finish()`, `horn()`, `toggle()`, `quiet()`.

### `src/main.js` (the page)

Marked sections: data, 3D, particles, cars, the session, the car picker, input, the gate, the loop, drawing (and the camera), HUD, pace notes, sound, size. For the checks, `window.ringKart` exposes `VERSION`, `track`, `S`, `cars`, `player`, `keys`, `start()`, `ticket()`, `autopilot(on)` and `run(seconds)`, which steps the game without drawing so a whole lap takes a few seconds.

## 4. The data model

**`data/track.json`**: `build` (each `{ value, desc }`: `lengthScale` 0.33, `realLength` 20800, `heightScale` 0.42, `sample` 2, `width` 13, `verge` 4, `gateAt` 70) and `points`, 69 of `{ p: [east, north] in km, el: metres, name?, crest?, bank? }`.

**`data/cars.json`**: `stats` (what each figure means), `player` (5 cars with `id`, `name`, `note`), `rivals`, `chasers`, `traffic`, and `race`, the rules. A car is `{ name, vmax, accel, grip, brake, drift, mass, pace, body }`; `body` is `{ style, len, wid, hgt, color, trim, wing?, roofbox? }` with the real car's length, width and height in metres.

**A car at run time** (`makeCar`): position `x, y, z`, heading `h`, speed `v`, vertical speed `vy`, place on the road `k`, `s` (metres along) and `lat`; state `air`, `drift` (`{ dir, t }` or null), `boost`, `slipT`, `grass`, `scrape`, `landed`, `bump`, `slide`, `pitch`, `roll`; `input` `{ steer, gas, brake, drift }`. The page adds `role` (player, rival, chaser, traffic), `released`, `releasedAt`, `done`, `time`, `hidden`; the AI adds `ai` and, after a honk, `yieldT`.

**The session** (`S` in `main.js`): `mode` (pick, queue, race, done), the clock `t`, the `queue`, the barrier, `raceStart` and `raceT`, the finishers, the corner banner, the camera mode, pause.

**Kept in the browser** (`localStorage`, prefix `ringkart.`, every read and write in try/catch): `car` (the last pick), `best.<car id>`, `sound`, `autoGas`.

## 5. The lap

68 points traced by hand from public maps and elevation profiles, with 35 corners named. The shape, the order and direction of the corners and the big climbs and drops (the Fuchsröhre down, Breidscheid at the bottom, the long climb through Kesselchen, Hohe Acht at the top) are right; the exact lines are approximate. `buildTrack` draws a centripetal Catmull-Rom curve through the points, scales it to the real 20.8 km and then to a third (`lengthScale`), about 6.9 km and three minutes, and samples it every 2 m. Heights ease between points and are smoothed, scaled by `heightScale` so the hills stay steep. Crests are short sharp bumps: at speed the road falls away faster than gravity, which makes the jumps. Banking eases between points that have it (the Karussell and the Kleines Karussell). The Armco stands a verge's width outside the road, pulled in on the inside of tight corners so it never folds over itself.

Pace notes come from the same curvature: `nextCorner` grades a corner by its tightest radius. Round the lap that gives 51 notes, from Adenauer Forst's Right 1 and the Karussell's Left 2 to Kesselchen's flowing 5s and 6s.

## 6. Driving and the AI

Arcade, kart-game handling, deliberately not a simulation:

- The car goes where it points. Acceleration fades toward top speed; braking, rolling drag, and a climb's pull at about half of real gravity.
- Steering asks for a yaw rate from a 5.2 m turning circle at full lock; grip caps it at grip × g / speed, and asking for more scrubs speed (understeer).
- Drift (the button, steering, above 12 m/s) turns 0.75 to 1.5 times what grip allows, steered into or out of, and charges a mini-turbo: past 0.9 s a blue spark (0.8 s of boost), past 1.9 s orange (1.5 s). A boost adds push and 28% top speed.
- Slipstream: within 26 m behind a car and 3 m of its line for 1 s, 12% more top speed.
- Grass: hard drag and 45% of top speed. The Armco puts you back against it and turns you along it; a square hit keeps 72% of your speed.
- Flight: the car follows the road until the road falls away faster than game gravity (15 m/s²) would take it, then flies until the road comes back up.
- Bumps: two circles per car; heavier cars push lighter ones.

The AI looks ahead for the slowest corner it can still brake for (`cornerSpeed`, at `pace` of its grip), steers at a point down its line, and passes slower cars on the left; traffic keeps right, as on the real Touristenfahrten, and pulls further over for three seconds after a honk. Rivals get a light rubber band (`race.rubber`): far ahead they ease off, far behind they push. Every number here is in `cars.json`.

## 7. The cars

Real models, arcade numbers in the right order: the GT3 RS is the fastest thing in the lot and the Volvo 240 is a Volvo 240.

Bodies are built in `carMesh` from each car's real length, width and height and its style: coupe, hatch, sedan, wagon, van, roadster or tiny. A style (`STYLE` in `scene.js`) is a side view, in shares of length from the back and of height:

- `top`: the lower body's upper line, back to front (boot, beltline, bonnet, nose);
- `cab`: the glasshouse, four points from the foot of the rear window round to the foot of the windscreen (`null` for the roadster, which gets a windscreen, seats and a driver);
- `wheels`: the two axles; `b`: where the B-pillar stands; `panel`: paint the glasshouse solid back to here (a van's load bay).

The lower body is that outline cut round the wheel arches, with the wings raised over them, extruded across the width with fat rounded edges. The glasshouse is narrower (tumblehome), with the roof and pillars clipped from it in paint (`clip`, a half-plane clip of a polygon). Then mirrors, bumpers, skirts, grille, headlights, tail lights, German number plates, an exhaust, twin racing stripes over bonnet, roof and boot, wheels a size too big with whitewalls, and a soft oval shadow. Paint, trim, black parts and stripes are each merged into one geometry (`merge`), so a car is a handful of draw calls. No badges or logos.

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

- **Session** (`setup`, `release`, `queueStep`, `tick`, `result`): `pick` (the camera circles your car), `queue` (the barrier releases one car every `race.release` seconds once the arm is down; you creep up and tap your ticket at the front), `race`, `done` (your car coasts, the result comes up after 1.6 s).
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
| `node tools/smoke.js` | the page loads with no errors, the stamps agree, and a car queues, goes through the gate and is 300 m or more down the road 20 s later on autopilot |

For a change to the look, take screenshots: a short Playwright script that opens the page, calls `ringKart.start()`, drives with `ringKart.run()` and `autopilot(true)`, and screenshots `#stage` in each camera at desktop and phone widths (swiftshader works headless). Every look change in 0.2 to 0.4 was checked this way, and it caught real bugs: trees drawn black, headlights hidden inside the bodywork, and the bonnet camera inside the ink outline.

## 12. How it was built

Each version was one session's work and one commit; the changelog has the detail.

- **0.1 (site 0.94)**: the game from an idea in a chat session: the queue and the gate, the hand-traced lap, arcade driving with drifts and mini-turbos, the AI and traffic, a plain 3D world with box cars, a simple HUD and synthesized sound. The physics and the lap were written pure from the start so Node could drive them.
- **0.2 (site 0.95)**: onboard telemetry after a broadcast lap (a Porsche onboard was the reference: map, gear, speed, revs, pedals, timer), the gaps, one gearbox for dials and sound, a bonnet camera, a sky with reflections, spruces, fences and brake lights. Found and fixed: every tree had been drawn nearly black (instance colours multiplied by an already dark material).
- **0.3 (site 0.97)**: cars drawn from side views per style instead of boxes, merged into a few draw calls; eased keyboard steering.
- **0.4 (site 0.99)**: the controls rethought around a lap that is all gas and brake (Up for gas, Space to brake, Shift to drift), pace notes and a BRAKE cue from the AI's own corner speeds (split out of `driveAI` unchanged, so the AI drives exactly as before), gas always on, a horn, look back; and the 70s cartoon look, replacing the realistic one.

Decisions worth keeping:

- **Arcade, not simulation.** The lap is a third of real length and the handling is a kart game's, because the point is three fun minutes, not a lap-time model. A real-car mode against real lap times is the next big step (section 14) and will sit beside the arcade game, not replace it.
- **Hand-traced, not downloaded.** The lap came from public maps by hand because the build machine could not reach OpenStreetMap. The order, direction and heights of the corners are right; the radii are approximate.
- **One Three.js.** Ring Kart imports Cathedral Lab's vendored copy rather than adding its own, so the site has one copy, one licence and one version to upgrade.
- **Keyboard and gamepad, not mouse.** See the controls above.
- **Pure physics.** It costs nothing and buys tests that drive every car round the lap in Node in a fraction of a second.
- **Not seeded.** Races vary on purpose. If replays or ghosts need exact repeats, seed the queue and replace `Math.random` in the physics path first (the particles can keep it).

## 13. How to build on it

**Add a car.** Add it to `player`, `rivals`, `chasers` or `traffic` in `data/cars.json` with its real length, width and height and a style. A player car needs an `id` and a `note`; the picker and the best times pick it up. Run the Ring Kart test (it drives every player car round the lap), then look at it in the picker.

**Add a body style.** Add an entry to `STYLE` in `scene.js`: the `top` line, the `cab` (four points, or `null`), the `wheels`, and optionally `b` and `panel`. Keep the wings clear of the arches (the builder raises them, but a very low bonnet line over a big wheel will look odd). Check it in a lineup: render every car side by side from a scratch page that imports `carMesh`.

**Tune the handling.** Change the numbers in `cars.json` (a car's figures or the `race` block), never constants in `drive.js`. Run the test: if a car can no longer finish a lap on the AI, the change went too far.

**Change the lap.** Edit `points` in `track.json`; `buildTrack` does the rest. Run the test, which checks the length and the corner order. A traced line from OpenStreetMap would replace the whole list (section 14).

**Add a HUD element.** Add markup inside `#hud` in `index.html`, style it with the tokens as a sticker or in the strip, and update it in `hud()` (every frame for anything that moves, inside the ten-a-second block for text). Hide it under 700 px if it does not fit a phone.

**Add a camera.** Add an entry to the `dist` and `ht` lists in `camera3` and widen `S.camMode`'s cycle; if the camera can sit inside your car, hide the car's ink (`pm.ink`) as the bonnet camera does.

**Add scenery.** Build it in `buildWorld` with `toon()` materials and the palette; place things with `pointAt(track, k, lat)`. Many copies of one thing should be an `InstancedMesh`; give it ink with `inkNormals(geometry)` and an instanced `inkMat`.

**Add a sound.** A method on `Sound` that builds oscillators or filtered noise and connects them to `this.master`; call it from the page.

**Ship it.** `node tools/bump.js kart 0.x`, the changelog, the home card's badge, the site version, then `node tools/smoke.js` and the Ring Kart test, as `CLAUDE.md` describes.

## 14. Limits and what comes next

The roadmap (`docs/ROADMAP.md`) has the order. In short: real cars against real lap times (a model of each car from its power, weight, grip and aero, checked against the official times below); the real line from OpenStreetMap and an elevation model; a ghost of your best lap and a time trial; and fewer trees and a coarser ground on small phones. Known limits today: the lap's corner radii are approximate; the race is not replayable; a rescue (R) puts you back within 3 m of the centre line without checking for traffic.

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
