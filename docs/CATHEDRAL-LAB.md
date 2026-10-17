# Cathedral Lab

Called Keystone until 0.6; renamed in 0.7 (site 0.91) for what it became, a lab for building cathedrals. The old address forwards here.

Build a famous building piece by piece, the way a big brick architecture kit does, except every piece is a real structural element and the building stands or falls for the same reasons the real one did. The audience is a high school freshman who has built the brick kits and likes how things work, so real forces and real units are fine.

Version 0.8 (site 0.92). Live at `/cathedral-lab/` (the 3D build) and `/cathedral-lab/arch-lab/` (the arch lab). It began as two prototypes built in a chat session: a 3D proof of three bays of Notre-Dame's nave and a 2D arch lab, each a single file with the solver pasted in.

## Concept

The calm, numbered, satisfying build of a brick kit stays: bags, steps, the parts for each step laid out, the picture on the box. The difference is that the pieces carry load. Strike the centering under a vault and the line of thrust appears; color by load and the piers glow at the base.

## Modes

- **Build**: step through bags and steps, with the history of each step. In 0.1.
- **Inspect**: tap a piece for its weight, the load it carries and the pressure where it rests. In 0.1.
- **Lab**: break it on purpose: remove a flyer, thin a wall, strike the centering early. In 0.1 this is the 2D arch lab; in 3D it is on the roadmap.

They mirror the Hockey Strategy Lab's Watch, Review and Game plan lab.

## Physics

Masonry as rigid blocks that push but never pull (Heyman's safe theorem). The checks:

- the line of thrust inside the stone at every joint; where none fits, the joints where it escapes become hinges
- sliding past a 35° friction angle (a joint steeper than that needs centering until the keystone is in)
- overturning when the base resultant leaves the base; inside the middle third the whole base is in compression
- hoop forces for domes (with the Florence dome, not yet)

Limestone at 22 kN/m³, forces per metre of vault length. Not modeled: crushing, mortar, settlement, wind, full 3D shell behavior. Load coloring is weight only, along a simplified load path: each piece passes its weight and everything on it to the pieces it rests on, in fixed shares.

How the solver works (`public/cathedral-lab/src/solver.js`): for a crown height, every joint's thrust position is a ratio of two linear functions of the horizontal thrust H, so the H values where it touches either face split the line into intervals that pass or fail as a whole. It tests each interval and keeps the smallest feasible H, over a sweep of crown heights: the minimum-thrust state, the one an arch settles into once its walls lean out a hair. Minimum thickness is a bisection on that. Walls and buttress piers are rectangles checked by where the resultant of the arch's thrust and their own weight meets the base; a flying buttress is a strut that carries all of the vault's horizontal thrust to the buttress pier.

Checked against known results in `tools/test/cathedral-lab.test.js`: a semicircular arch's minimum thickness is 0.1075 of its radius (Milankovitch), and the solver gets 0.1075 at 41 and 81 stones; a pointed arch needs less than a round one and a catenary far less; a 1.2 m wall 20 m tall tips under a 12 m pointed vault and stands with a flying buttress.

The 3D bay uses the same solver at its own dimensions (12 m pointed vault 0.7 m deep, walls 1.2 m thick to 24 m, buttress piers 3.8 m deep with pinnacles): about 39 kN per metre of outward push, 50 kN per metre in each flyer, the wall's base resultant at 0.53 of its width and the buttress's at 0.40, both inside the middle third.

## Buildings

1. Notre-Dame de Paris. The cross-section through a nave bay is the key teaching view. In 0.1 and 0.2: three bays, 871 pieces in 39 steps. Since 0.3: the whole nave, ten bays and 60 m. Since 0.4: the west front and its towers. Since 0.5: the transept, crossing and spire. Since 0.6: the choir and apse, so the whole cathedral; since 0.7 its chapels, 6,809 pieces in 103 steps in 17 bags.
2. Amiens (0.8): the tallest complete French cathedral, 5,775 pieces in 88 steps in 17 bags, the first made with `gothic.js`.
3. Next: build your own, on `gothic.js`, with Beauvais as the challenge.
4. Brunelleschi's dome in Florence: drum, ribs, herringbone courses, two shells, stone and iron chains, lantern.
5. Later: the Taj Mahal as a double-dome comparison.

## The nave as built (0.3)

Ten bays of 6 m between the crossing (z = -30) and the west front (z = +30), five six-part vaults over pairs of bays, a 12 m nave. Sources agree on the six-part vaults over double bays, the double aisles and the gallery over the inner aisle; they count the bays as ten single bays or five double ones. In section, each side: the nave wall (1.2 m) on round piers 1.5 m across; the inner aisle, 6 m centre to centre, with the gallery over it; a row of slimmer aisle piers carrying the gallery's outer wall; the outer aisle, 6 m; the outer aisle wall, 1 m, between buttress piers 3.8 m deep. Levels: arcade springing 9.2 m, gallery 14.6 to 19.6, band 19.6 to 24 (the vault springs at 24), clerestory to the cornice at 34.8, ridge 45.4.

The flyers: one at every bay line, in a single flight over both aisles and the gallery roof, from 23 m on the nave wall to the buttress top at 21 m, about 11 m. Sources say Notre-Dame's flyers are single-flight; the 15 m figure usually quoted is for the choir's. Viollet-le-Duc thought the nave first had two ranks with an upright over the aisle piers; that is disputed and not modeled. In the solver this is `supports()` with `gap` 10.9 and `bheight` 21: about 39 kN per metre of push, 40 kN in each flyer, the wall's base resultant at 0.51 of its width and the buttress's at 0.39.

The elevation: the bay next to the crossing keeps the band of round openings Viollet-le-Duc restored; in the others the clerestory windows run down over the band, as they were lengthened in the 1220s.

## The west front as built (0.4)

From the official and Friends of Notre-Dame descriptions: 43.5 m wide, 45 m to the top of the front, towers 69 m; four buttresses and two towers divide it vertically; from the bottom, the three portals (the Virgin north, the Last Judgement centre, Saint Anne south), the Gallery of Kings (28 kings of Judah), the Gallery of the Virgin with the rose (9.6 m, about 1225), the grand gallery, then the towers, square, each face with two tall openings, lead terraces with railings, spires planned and never built.

In the model: towers 16.1 m square, flush with the nave's inner walls (x from 5.65 to 21.75 m each side) and from z = 30.7 to 46.8; walls 2.6 m; storeys at 0.6, 14, 18, 31, 42, 45 and 67.5 m, terrace and railing to 69. The central wall is 4.8 m thick to 31 m, then a 1.2 m screen. Each portal has three rings of nine voussoirs on jamb columns, each ring 0.6 m further out, on its own centering. The last bay of the nave (z 30 to 42) has a four-part vault 12 m square: the west rib, two diagonals, a boss, wall ribs along the towers; the towers take its push instead of flyers (not computed). Each tower comes to about 18,000 tonnes and 1.5 MPa at its base in the load model.

## The transept, crossing and spire as built (0.5)

From the Friends of Notre-Dame layout and the cathedral's site: the transept is 48 m long and 14 m wide; the north and south roses are about 13.1 m across (the west rose 9.6); the transept's inner bays have six-part vaults. The spire (Wikipedia, Spire of Notre-Dame de Paris): Viollet-le-Duc's, 1859, 96 m, oak clad in about 250 tonnes of lead; it fell through the crossing vault in the fire of 15 April 2019 and was rebuilt to the same design.

In the model: the transept's axis at z = -36, between the nave's last pier line (z = -30) and two new square east crossing piers (z = -42). Each arm runs from the nave wall to an end wall 2 m thick at 22 to 24 m from the axis: a six-part vault over 6.25 to 18.25 m (the same rib geometry as the nave's, turned 90°), a four-part end bay to 21.7 m. The ribs land on whatever is there: the crossing piers near the corners, otherwise the arm's side wall (`supAt`). The side walls are 3 m thick, which the solver needs without flyers (base resultant at 0.37); the real walls are thinner and share the push with the aisles and the corner buttresses. The spire: four oak base beams on the four crossing piers' top courses, eight posts to 60 m in a lead octagon, a lead crown, eight ribs to 93 m in a lead needle, the cross to 96 m and the rooster. Lead 250 tonnes in all (100 lower stage, 10 crown, 140 needle); the oak is weighed by the volume of the simplified frame, much less than the real one. The two nave piers that are also the west crossing piers come to about 3 MPa at their base: the real crossing piers are bigger.

The arm and crossing vaults are built with general helpers (`ribIn`, `cenIn`, `halfIn`) in a local frame (u across the span, v along the axis) that `armF` or `crossF` maps to the world; the choir will reuse them.

## The choir and apse as built (0.6)

Sources (Grove via MIT Dome, Columbia, Wikipedia): the choir has two double bays with double aisles that continue round the apse as a double ambulatory; it was built first, from 1163; its chapels came later; Jean Ravy built the chevet's flyers in the 14th century, about 15 m in a single span.

In the model the choir's straight bays (z = -66 to -42) are a second stretch of the nave's own code: `SEGS` lists the nave's and the choir's bay lines and `eachSeg(f)` runs each step's pieces once per stretch, with `ZS`, `NB`, `pid` and the id prefix `TG` switched (the choir's ids start with C). The refactor was checked by fingerprint: every nave and west-front piece kept its id, step, weight, bearing area, supports and geometry. The choir's first line (z = -42) gives the crossing its east piers and arch, as the nave's last line gives its west ones.

The apse, centred on the choir's last line: six lines at 36° (the end ones are the choir's), piers at 6.25 m (the apse) and 12.25 m (the ambulatory), the outer wall at 18.25 m in five straight runs, buttress piers from 21.85 m, so the flyers reach 15 m from the wall's outer face. The solver gives the same verdicts as in the nave (`supports()` with `gap` 15): it treats a flyer as a strut, so length does not change the push; what a long flyer makes harder is carrying its own weight, which is not modeled. The apse vault is four half-ribs (the left half of the nave's transverse arch) from the apse wall piers to the keystone of the choir's last transverse rib, and five ruled cells between them. Its thrust lines are drawn on the four apse lines; the page shows the nearest line seen broadside.

## Final touches from photographs (0.7)

Two pictures (an elevation and plan drawing, and an aerial photo of the chevet) showed what the model lacked: chapels between all the buttresses with a row of gables, slender flyers sweeping down steeply to tall pinnacled piers. Added: the chapels along the nave and choir (outer wall at the buttresses' outer faces, 0.9 m, a window, a gable with a small oculus and a pinnacle, a lead roof back to the old outer wall; none in the bays next to the crossing, where the transept walls stand) and the ring of five round the apse; flyers 0.45 m deep with a 0.7 m arched underside, landing at 18 m on the nave's buttresses and 16 m at the apse; pinnacles 10.9 m tall. The steeper flyers needed the gallery's outer wall and roof 0.8 m lower (`GT`). The physics: `supports()` gained `flyerTop`. Raising the flyer's head above the springing pushes the wall in (base resultant 0.69 at 27 m, 0.78 at 29 m: the inner joint opens), which is why the steepness comes from landing lower instead (wall 0.52, buttress 0.40, both in the middle third).

## Amiens (0.8)

Notre-Dame d'Amiens, begun in 1220 by Robert de Luzarches, nave finished about 1236, choir about 1269; the tallest complete cathedral in France and the largest by volume. The dimensions used (nave vault about 42.3 m to the crown, transept about 70 m, west towers 61.7 m south and 68 m north, spire 112.7 m, labyrinth 1288, spire 1533) come from the Wikipedia and Britannica articles on Amiens Cathedral, Structurae, and Columbia University's Amiens project (Media Center for Art History). The vault's span (13.6 m clear), the bay lengths, the aisle widths and the elevation's levels are read from the published plan and section, not from a survey.

As built here:

- Nave: seven bays, aisles 8.6 m wide with vaults springing at 13.5 m, arcade to 18.6 m, triforium to 24.5 m, clerestory to the cornice at 42.6 m, vault 0.8 m deep springing at 30 m with its crown at 42.2 m. Buttresses 4 m deep; two tiers of flyers, landing at 26 m and 33 m.
- West front: three porches with gables, the Gallery of Kings (22), the rose, the bell-ringers' gallery, the half-towers.
- Transept: arms of three bays with an aisle on each side (east and west), the crossing on four piers, rose windows in the ends.
- Choir: four bays with double aisles and a glazed triforium (the upper choir was rebuilt after 1258 with the triforium's outer wall in glass).
- Apse: seven sides, an ambulatory and seven chapels, the axial one longest; its flyers cross two aisles in two flights with an intermediate pier.
- Chapels between the nave buttresses (1290s to 1370s), the spire of 1533 and the labyrinth of 1288 in the nave floor.

The physics at Amiens' section: the vault pushes out about 50 kN per metre (39 at Notre-Dame's); the wall alone tips, the flyers carry the push to the buttresses, and the buttresses' base resultant lands at 0.37 of their depth, just inside the middle third (a 3.2 m buttress cracks). The nave pier carries about 678 t, about 3.3 MPa at its base. That margin is the point the page makes about Beauvais.

Simplified at Amiens (said on the page): the crossing has a plain four-part vault where Amiens has a star vault; the aisle vaults are plain curved webs; the rose tracery is rings and spokes; the half-towers are boxes with openings; the labyrinth is rings, not its real path; the upper flyers are drawn but carry nothing in the solver; every bay line carries the same share of the vault.

### `gothic.js`, the builder

Amiens is not laid out piece by piece like Notre-Dame. `section(o)` takes a cross-section (span, vault depth, springing, wall, aisle width and heights, the elevation's levels, buttress depth, flyer heights and tiers) and solves it once: the arch, the line of thrust, the wall and buttress checks, the positions of every face. `aisled(K, sec, runs, text)` then builds runs of bays from that section in local frames (`frame(ox, oz, u, v)`: the nave runs east, the transept arms north and south, the choir east), in the masons' order (footings, piers, arcades, aisles, walls, buttresses, flyers, vault, roofs), and leaves chapels, glazing and paving as calls the building makes when it wants them. Each side of a run says what stands at each bay line (a buttress, a corner, nothing, or a support of the building's own), so the crossing, the apse and the west front join the runs by name. Build your own will be a section and a plan handed to the same two functions.

## Current simplifications in the Notre-Dame build

- The vault's crown is about 35 m up (33 m in the real nave).
- Every bay line takes the same share of the vault. In a real six-part vault the heavy transverse lines carry more than the intermediate ones; Notre-Dame's nave piers are nevertheless all round.
- The chapels built between the buttresses in 1235 to 1245, the gallery's own vaults and floor, and the triforium are left out; the gallery has a plain lean-to roof.
- The flyer is a strut carrying all the vault's horizontal thrust; its own weight is not in the thrust line.
- The west front's sculpture is plain shapes (the kings are simple turned figures); the chimeras and gargoyles, the spiral stairs and the tower floors are left out; the portals' arches stand in front of the wall rather than in a deep splay.
- The transept's side walls are 3 m thick and solid above the aisle openings.
- The apse is five-sided, with as many ambulatory piers as apse piers (the real outer ambulatory has more). The chapels are walls, gables and flat lead roofs, with no vaults; the old outer aisle wall stays behind them instead of opening into them.
- The apostles weigh nothing in the load model (their weight is not sourced).
- The drop-in animation is scripted, not physics.

Each is said on the page.

## How it is built

```
public/cathedral-lab/
  index.html, style.css      the 3D build; style.css is shared with the arch lab
  src/main.js                the 3D page: scene, booklet, step controls, Inspect, load coloring, cutaway; VERSION
  src/gothic.js              the Gothic builder: a section solved once, then aisled runs of bays built from it
  src/amiens.js              Amiens, made with gothic.js
  src/notre-dame.js          the building as a kit: every piece with geometry, weight, bearing area and supports, in
                             steps and bags; the load model and the force lines. No page in it
  src/kit.js                 the kit: createKit() gives a building its pieces, steps, bags, arches and centering, and the
                             load model; the geometry helpers (boxes, extrusions, lancets, ruled webs) are plain exports
  src/solver.js              the masonry solver, pure functions; both pages import it, the unit tests run it in Node
  src/vendor/                Three.js r128 (three.module.js, OrbitControls.js, LICENSE, README.md)
  arch-lab/index.html        the arch lab
  arch-lab/src/main.js       its page: the section drawing, the panel, Try this; VERSION
```

- Same rules as the rest of the site: plain ES modules, no build step, every file and import carries a `?v=` stamp with Cathedral Lab's version, and `node tools/smoke.js` fails if one disagrees. `node tools/bump.js cathedral 0.x` sets `VERSION` on both pages and every stamp, the vendored Three.js included.
- Three.js is the site's only library. It is served from the site, not a CDN, like everything else. The one change to the vendored files is OrbitControls' import of `three`, pointed at `./three.module.js` with the version stamp so both load the same copy; `src/vendor/README.md` says how to upgrade.
- The solver and the building never touch the page. Unlike the hockey engine, nothing replays a seed, so Cathedral Lab uses `Math.sin` and friends freely; the hockey engine's `detmath.js` rule does not apply.
- The camera: scroll or pinch zooms toward the point under the pointer (the page catches the wheel before the orbit controls, which only zoom toward their target); a double tap flies to a piece or, on the sky, to the whole building; the target is kept inside the building's bounds. The line of thrust is drawn for one bay line at a time (the one nearest the camera, or just behind the cut), over the stone and without tone mapping.
- Batches: the pieces that come and go together (same step, same removal, same material, same roof group) are merged into one mesh, about 40 for the nave, about 60 draw calls a frame with shadows. Each piece keeps its range of vertices and triangles: its colors are rewritten only when they change, picking tests a ray against piece boxes and then that piece's triangles, and the drop into place runs in the vertex shader with a delay per piece.
- Drawn on demand: the render loop draws only when something changed (the camera, an animation, a step, a toggle, a resize). Anything that changes the scene calls `redraw()`.
- More than one building: `main.js` keeps a list (`BUILDINGS`), each a module with the same exports (`pieces`, `steps`, `KIT` with the page's words for it, `forceLines`, `computeLoads`, `live`, `STEP_STRUCK`, `HIDERS`), loaded with `import()`; `?b=` in the address picks one, and the header lists them all. Moving Notre-Dame onto `kit.js` was checked by fingerprint: byte-identical pieces.
- `window.cathedralLab` (the 3D page) and `window.archLab` are the hooks the smoke check waits on.

## The look

Matched to the Hockey Strategy Lab, not to a CAD drawing: Barlow and Barlow Condensed, the same page colors and round-cornered panels, one strong color for what matters (the thrust, the hockey lab's red). In the arch lab, stone is flat with light seams between blocks, there are no dimension lines, every line has round ends, and the base checks are a green middle third under each base with a dot where the push lands. In 3D: even light from the sky, a soft low sun, no grid, smooth curves, and a ground that fades into the sky. The geometry and every number are unchanged by the look.

## Checks

| Run | When | Passes when |
|---|---|---|
| `node --test tools/test` | any change to the solver | `fail 0` (the Cathedral Lab tests run in under a second) |
| `node tools/smoke.js` | every change | `ERRORS: []`; it loads both Cathedral Lab pages and Amiens, checks the 3D graphics started and the stamps agree |

Before shipping a visible change, look at both pages at desktop and phone widths, light and dark.

## Roadmap

1. A treadwheel crane lifting each stone.
2. The cut face drawn as a solid section, with the 2D thrust diagram on it.
3. Real rigid-body collapse when a piece is removed (statics still decides whether it fails).
4. Lab experiments in 3D: remove a flyer, thin a wall, strike the centering early.
5. The Florence dome.
6. Shareable Lab results by link.
