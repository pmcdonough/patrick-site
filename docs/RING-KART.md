# Ring Kart

A kart-style race round the Nürburgring Nordschleife in real cars. Version 0.3 (site 0.97; 0.1 shipped in site 0.94, 0.2 in 0.95), live at `/ring-kart/`. Built in a chat session from the idea: start outside the Ring in the Touristenfahrten queue behind Porsches, GTIs and a few fun old cars, tap your ticket, and race.

## The session

1. Pick a car: VW Golf GTI, Porsche 911 GT3 RS, Honda Civic Type R, Mazda MX-5 (NA) or Volvo 240 Estate. The camera circles your car in the queue while you choose.
2. The queue: four rivals ahead of you, two fast cars (a GT3 RS and an AMG GT R) behind. The barrier lifts for one car every 2 s; the queue creeps up. At the front, Space, Enter, a tap or the A button lifts it for you.
3. The race: six rivals (two already through the gate when you join) and the two behind you, through 22 slow cars on the lap. Position counts who is furthest round; the clock runs from your barrier to the gantry, the real "bridge to gantry" time. Corner names come up as you reach them.
4. On the way: position top left, the gaps to the car ahead and behind top right, corner names as you reach them, and along the bottom the onboard telemetry, after the broadcast laps: the map (you in red), gear and speed, the revs on an arc with a shift light, brake and gas bars, the clock in hundredths, the drift and turbo charge, and the height of the lap with how far you have come. C cycles the camera: behind, high, on the bonnet.
5. The gantry: your time, your place, the order with each car's time, and your best per car (kept in the browser).

## The lap (`data/track.json`, `src/track.js`)

68 points, each [east, north] in km with its height, traced by hand from public maps and elevation profiles, with 35 corners named. The shape, the order and direction of the corners and the big climbs and drops (Fuchsröhre down, Breidscheid at the bottom, the long climb through Kesselchen, Hohe Acht at the top) are right; the exact lines are approximate. `buildTrack` draws a centripetal Catmull-Rom curve through the points, scales it to the real 20.8 km, then by `lengthScale` (0.33) to game size, about 6.9 km, and samples it every 2 m. Heights ease between points and are smoothed; `heightScale` (0.42) keeps the hills steep. Crests are short sharp bumps (the back falls away faster than gravity at speed, which makes the jumps). Banking eases between points that have it (the Karussell and the Kleines Karussell). The Armco is a verge's width outside the road, pulled in on the inside of tight corners so it never folds.

Next: trace the lap from OpenStreetMap's Nordschleife ways and a public elevation model instead (the shell here cannot reach OpenStreetMap; a script run on a machine that can would write the same `points` list).

## Driving (`src/drive.js`)

Arcade, kart-game handling, pure functions so Node can drive a lap:

- The car goes where it points. Acceleration fades toward top speed; braking, rolling drag, a climb's pull at about half of real gravity.
- Steering asks for a yaw rate from a 5.2 m turning circle at full lock; grip caps it at grip × g / speed. Asking for more scrubs speed (understeer).
- Drift (button plus steering above 12 m/s): turns 0.75 to 1.5 times what grip allows, steered into or out of, and charges a mini-turbo: past 0.9 s a blue spark (0.8 s of boost), past 1.9 s orange (1.5 s). Boost adds push and 28% top speed.
- Slipstream: within 26 m behind a car and 3 m of its line for 1 s, 12% more top speed.
- Grass: hard drag and 45% of top speed. The Armco: you are put back against it and turned along it; a square hit keeps 72% of your speed.
- Flight: the car follows the road until the road falls away faster than gravity (15 m/s² in the game) would take it, then flies until the road comes back up.
- Bumps: two circles per car, heavier cars push lighter ones.

The AI looks ahead for the slowest corner it can still brake for (`pace` is the share of its grip it uses), steers at a point down its line (the inside of what is coming for racers, the right-hand side for traffic), and passes slower cars on the left. Rivals get a light rubber band (`race.rubber`).

All of these numbers are in `data/cars.json` with a description, as in the other projects.

## The cars (`data/cars.json`)

Real models, arcade numbers in the right order: top speed, acceleration, grip, braking, drift, mass. The bodies are built in `src/scene.js` from each car's real length, width and height and a style (coupe, hatch, sedan, wagon, van, roadster, tiny), with wings and a roof box where they belong. Each style is a side view (`STYLE`): the lower body's upper line, the glasshouse, the axles, where the B-pillar stands. The lower body is that outline cut round the wheel arches, with the wings raised to clear them, extruded across the width with a bevel; the glasshouse is narrower (tumblehome), with roof and pillars clipped from it in paint; then mirrors, bumpers, skirts, grille, lights, plates, exhaust, five-spoke rims and a soft shadow. Paint, trim and black parts are each merged into one geometry, so a car is a few draw calls. No badges or logos.

Controls: arrows or WASD, Space or Shift to drift, C camera, R back on the road, Esc pause, M mute, F full screen; a gamepad and on-screen buttons work too. Keys and touch buttons are all or nothing, so the page eases the steering toward them (about a sixth of a second in, a little quicker back); a stick is used as it is. The mouse and touchpad are not used to steer: a kart game wants steering and pedals held at once, which a touchpad cannot do.

## The world (`src/scene.js`)

A sky dome from deep blue to a hazy horizon with clouds, which follows the camera; a cloudless copy of it is the environment map the car paint, glass and Armco reflect, and its horizon colour is the fog. The road with its edge lines, rubbered-in line, seams and patched tarmac, kerbs on the inside of corners, W-beam Armco on posts, catch fences on the outside of the bends, a ground height field that sits under the road and rolls into hills away from it, about ten thousand trees (spruces in tiers of branches and broadleaves, each instance its own colour on a white material), painted words on the tarmac, corner boards, the gate with its barrier and light, and the gantry. Brake lights light up when a car brakes. The dials and the engine note read the same gearbox, `revs()` in `src/drive.js`. Three.js r128 is Cathedral Lab's copy, imported with its stamp.

## Checks

`tools/smoke.js` loads the page, checks the stamps (its own and Cathedral Lab's for Three.js), queues, goes through the gate and drives 20 s on autopilot. `window.ringKart.run(seconds)` plays on without drawing, which is how a whole lap is driven in a few seconds; `autopilot(true)` hands your car to the AI.

## Real lap times (for the next version)

Official Nordschleife times on the 20.832 km lap, from the Nürburgring's list and Porsche:

| Car | Time | Note |
|---|---|---|
| Mercedes-AMG ONE | 6:29.090 | road-car record, 2024 |
| Porsche 911 GT2 RS (991) with Manthey kit | 6:43.300 | 2021 |
| Porsche 911 GT3 (992.2) with Manthey kit | 6:52.981 | 2025 |
| Porsche 911 GT3 (992.2) | 6:56.294 | 2025, Jörg Bergmeister |
| Porsche 911 Turbo S (992.2, T-Hybrid) | 7:03.92 | set autumn 2024, Jörg Bergmeister |
| Porsche 718 Cayman GT4 RS | 7:09.3 | 2021, Jörg Bergmeister; 7:04.511 on the old 20.6 km measure |
