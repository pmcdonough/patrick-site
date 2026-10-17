# Cathedral Lab

Called Keystone until 0.6; renamed in 0.7 (site 0.91) for what it became, a lab for building cathedrals. The old address forwards here.

Build a famous building piece by piece, the way a big brick architecture kit does, except every piece is a real structural element and the building stands or falls for the same reasons the real one did. The audience is a high school freshman who has built the brick kits and likes how things work, so real forces and real units are fine.

Version 0.11 (site 0.98). Live at `/cathedral-lab/` (the 3D build), `/cathedral-lab/design/` (design your own) and `/cathedral-lab/arch-lab/` (the arch lab). It began as two prototypes built in a chat session: a 3D proof of three bays of Notre-Dame's nave and a 2D arch lab, each a single file with the solver pasted in.

This file says what the lab is and why: the concept, the physics, each building with its sources and its simplifications, and the roadmap. How the code is built, and how to extend it, is in `CATHEDRAL-LAB-CODE.md`.

## Concept

The calm, numbered, satisfying build of a brick kit stays: bags, steps, the parts for each step laid out, the picture on the box. The difference is that the pieces carry load. Strike the centering under a vault and the line of thrust appears; color by load and the piers glow at the base.

## Modes

- **Build**: step through bags and steps, with the history of each step. Since 0.1.
- **Inspect**: tap a piece for its weight, the load it carries and the pressure where it rests; color by load; cut the building open. Since 0.1.
- **Lab**: break it on purpose. How an arch stands does it to one arch in section (since 0.1); Design your own does it to a whole cathedral, which falls in 3D if the design is wrong (since 0.10). Removing a flyer or thinning a wall of a finished 3D building is on the roadmap.

They mirror the Hockey Strategy Lab's Watch, Review and Game plan lab.

## Physics

Masonry as rigid blocks that push but never pull (Heyman's safe theorem). The checks:

- the line of thrust inside the stone at every joint; where none fits, the joints where it escapes become hinges
- sliding past a 35° friction angle (a joint steeper than that needs centering until the keystone is in)
- overturning when the base resultant leaves the base; inside the middle third the whole base is in compression
- hoop forces for domes (with the Florence dome, not yet)

Limestone at 22 kN/m³, forces per metre of vault length. Wind is modeled only for designed cathedrals, as a storm on the roof and clerestory (see Design your own). Not modeled: crushing, mortar, settlement, the slenderness of tall piers, full 3D shell behavior. Load coloring is weight only, along a simplified load path: each piece passes its weight and everything on it to the pieces it rests on, in fixed shares.

How the solver works (`public/cathedral-lab/src/solver.js`): for a crown height, every joint's thrust position is a ratio of two linear functions of the horizontal thrust H, so the H values where it touches either face split the line into intervals that pass or fail as a whole. It tests each interval and keeps the smallest feasible H, over a sweep of crown heights: the minimum-thrust state, the one an arch settles into once its walls lean out a hair. Minimum thickness is a bisection on that. Walls and buttress piers are rectangles checked by where the resultant of the arch's thrust and their own weight meets the base; a flying buttress is a strut that carries all of the vault's horizontal thrust to the buttress pier.

Checked against known results in `tools/test/cathedral-lab.test.js`: a semicircular arch's minimum thickness is 0.1075 of its radius (Milankovitch), and the solver gets 0.1075 at 41 and 81 stones; a pointed arch needs less than a round one and a catenary far less; a 1.2 m wall 20 m tall tips under a 12 m pointed vault and stands with a flying buttress.

The 3D bay uses the same solver at its own dimensions (12 m pointed vault 0.7 m deep, walls 1.2 m thick to 24 m, buttress piers 3.8 m deep with pinnacles): about 39 kN per metre of outward push, 50 kN per metre in each flyer, the wall's base resultant at 0.53 of its width and the buttress's at 0.40, both inside the middle third.

## Buildings

1. Notre-Dame de Paris. The cross-section through a nave bay is the key teaching view. In 0.1 and 0.2: three bays, 871 pieces in 39 steps. Since 0.3: the whole nave, ten bays and 60 m. Since 0.4: the west front and its towers. Since 0.5: the transept, crossing and spire. Since 0.6: the choir and apse, so the whole cathedral; since 0.7 its chapels, 6,809 pieces in 103 steps in 17 bags.
2. Amiens (0.8): the tallest complete French cathedral, 5,775 pieces in 88 steps in 17 bags, the first made with `gothic.js`.
3. Your own (0.10): designed on the design page, built by `gothic.js` from its section. See Design your own below.
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

## Design your own (0.10)

The goal: the question every Gothic master mason faced, how high can you go, played as a game a freshman can win and lose. The loop is short: change something, see the line of thrust move and the verdict change at once, try to meet a challenge, build it in 3D, watch it go up, and if the design was wrong, watch it come down.

The choices, and nothing else, so each one teaches something:

- The vault: pointed or round (round pushes harder and needs deeper stone), its height to the crown (16 to 52 m, with a floor so the walls are at least 14 m to the springing), the width of the nave (9 to 17 m), the depth of its stone (0.3 to 1.2 m; too thin and no line of thrust fits).
- Holding it up: the walls (0.8 to 3.5 m), one aisle or two on each side, flying buttresses (none, one tier, two tiers; two tiers with one aisle only), the buttresses' depth (1.5 to 7 m).
- The rest: bays (3 to 12), the west front's towers (none, two, with spires), chapels between the buttresses.
- A name, which is kept to letters, digits, spaces and a little punctuation so it can go anywhere on the page.

Everything else follows from those in Amiens' proportions (`sectionOf` in `design.js`): the arcade at 0.62 of the springing height, the aisle walls at 0.68, the aisle roofs at 0.85, the lower flyers landing at 0.87, the upper ones at the springing plus 3 m; aisles 0.63 of the span, bays 0.57. In a low or narrow church the arcade comes down so its arches fit under the triforium, and bays stay long enough for the piers. Amiens' own numbers come out of those ratios exactly.

The verdict (`assess`) has two moments. When the centering is struck: the vault must hold a line of thrust (else it falls), and on each side the wall and, with flyers, the buttress must keep the push inside their bases. In the first great storm: a gale with gusts of about 40 m/s (q = ½ρv², about 1 kN/m²) presses on everything above the aisle roofs, the clerestory and the roof, and the roof passes it to the lee side's walls; the lower flyers take it with the vault's push, or, with two tiers, the upper tier takes the wind (`supports()` with `wind`, `upper` and `btop`). Inside the middle third every base presses down (stands); outside it a joint opens (stands, cracked); outside the base it tips (falls).

Why the storm: in rigid-block statics a taller wall or buttress carries proportionally more weight as well as more moment, so without wind height costs almost nothing, which is wrong in a way a player would notice. The wind's push grows with the height above the aisle roofs, which is what made the upper flyers at Amiens necessary, and it makes the high challenges a real trade between height, width, buttress depth and flyers. Real Gothic sections stand in it, cracked at worst: the Amiens preset comes out with its wall solid and the buttress just outside the middle third.

The challenges (each checked against the verdict, kept in the browser): make it stand; higher than Notre-Dame (33 m); not one crack, over 33 m; higher than Amiens (42.3 m) and at least as wide (13.6 m); where Beauvais fell (48 m, 15 m wide, no cracks); no flying buttresses at 25 m; round arches at 30 m; a vault 0.5 m deep or less. A unit test shows a design that meets each one. Vault heights to compare (to the crown, inside): Notre-Dame 33 m, Chartres 37, Reims 38, Amiens 42.3, Beauvais 48 (Wikipedia's articles on each cathedral).

In 3D (`yours.js`, `make(design)`): the nave built by `aisled()` exactly as Amiens' is, then `front()` for a west front (a portal into the nave and each aisle, a rose as wide as the nave allows, a gable, two towers with belfries open on four sides and octagonal stone spires if chosen) and a flat east end (three lancets and a rose), the chapels, the glass and the paving, and last a step for the storm. A design that fails at the strike stops there: the next step is It falls. One that fails in the storm falls on the storm step. The 3D page opens on the design just before its fall (`KIT.open`), the picture on the box, and the fall plays when you step into it: each falling piece drops to the ground with a push outward and a turn, the top of a tipping wall first, moved in its batch on the processor (`KIT.falls`), and put back when you step back. The vault alone falls if it has no line of thrust; a tipping wall takes the vault and the flyers; a tipping buttress takes those and itself; in the storm only the lee side (the side the camera opens on) and the roof fall.

The plan (0.11): `layoutOf()` in `design.js` places every stretch, and both the 3D build and the design page's Plan view read it. Without a transept the nave runs alone, centred on the origin. With one, the crossing is at the origin, its piers on the main piers' lines at plus and minus c; the nave runs west and the choir east, each starting with a bay as wide as an aisle (where the transept's aisle crosses), and the arms run north and south the same way. All four are built together by one `aisled()` call, so the whole church rises step by step; the nave and the choir own the crossing piers and their corner piers, and the arms link to them (`mainLink`, and a `{ sup }` line on the corner). `crossing()` adds the crossing's diagonals, boss and webs between the four first transverse ribs, through `aisled()`'s `after` hook, so they go up on centering and are struck with the rest; then a groined roof and the spire. A transept needs one aisle for now: with two, the transept's aisles and the nave's would cross in a grid of shared piers of two heights, which the links do not yet handle.

`apse()` closes a stretch at its last line in a half-polygon (5 sides, or 7 when the nave is 13 m wide or more) on the same section: piers on the half-circle through the main piers (slimmer, as at Amiens), a ring of aisle piers with two aisles, the outer wall with a window per side, the ambulatory's cross arches and wedge vaults, buttresses and flyers on the radial lines, the wall with its triforium and clerestory, half-ribs from the wall to the keystone of the stretch's last transverse rib, webs, a half-cone roof, and with chapels a radiating chapel per side. Its force lines are drawn on the radial lines, as at Amiens. The stretch keeps a buttress, not a corner pier, on the line where the apse starts.

The design lives in the address (`?d=c36-s12-t0.7-pp-w1.3-a1-f1-b3.6-n7-T1-C0&name=...`), so Copy link shares it and the 3D page reads it; the last one is also kept in the browser.

Simplified, and said on the page: every bay is the same; the levels follow Amiens' proportions; the ends are plain walls with a rose; the storm is a steady pressure on one side with a net coefficient of 1; the collapse is drawn, not computed (the solver says that it falls, not how); crushing, settlement, mortar and the slenderness of tall piers are not modeled.

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

In four layers, each importing only the ones below: the masonry solver (`solver.js`), the kit every building is made of (`kit.js`), the builders and buildings (`gothic.js`, `notre-dame.js`, `amiens.js`, `design.js`, `yours.js`), and the pages (the 3D build, the design page, the arch lesson). The same site rules as everywhere: plain ES modules, no build step, a `?v=` stamp with Cathedral Lab's version on every file and import (`node tools/bump.js cathedral 0.x`), Three.js r128 vendored and served from the site (Ring Kart imports the same copy). `CATHEDRAL-LAB-CODE.md` has the layers, the data model, the APIs, how the 3D page works, the invariants and the recipes for extending it.

How it got here, in short: two single-file prototypes (0.1); zoom where you point and one whole line of thrust (0.2); pieces merged into batches so a whole nave runs on a phone (0.3); drawing on demand after the 3D page starved the CI machine (site 0.88); a shared kit and a list of buildings (0.7), then the Gothic builder from a cross-section, which made Amiens (0.8) and design your own (0.10, 0.11) descriptions rather than new code. Every refactor of a building was proven by its fingerprint: byte-identical pieces.

## The look

Matched to the Hockey Strategy Lab, not to a CAD drawing: Barlow and Barlow Condensed, the same page colors and round-cornered panels, one strong color for what matters (the thrust, the hockey lab's red). In the arch lab, stone is flat with light seams between blocks, there are no dimension lines, every line has round ends, and the base checks are a green middle third under each base with a dot where the push lands. In 3D: even light from the sky, a soft low sun, no grid, smooth curves, and a ground that fades into the sky. The geometry and every number are unchanged by the look.

## Checks

| Run | When | Passes when |
|---|---|---|
| `node --test tools/test` | any change to the solver, the kit, a builder or a building | `fail 0` (the solver against known results, both cathedrals, design your own at the ends of every slider) |
| fingerprint (`CATHEDRAL-LAB-CODE.md`) | any change to the solver, the kit or a builder | Notre-Dame and Amiens byte-identical, unless the change was meant for them |
| `node tools/smoke.js` | every change | `ERRORS: []`; it loads every Cathedral Lab page and Amiens, checks the 3D graphics started and the stamps agree, gets a verdict on the design page and builds a design that falls |

Before shipping a visible change, look at the pages it touches at desktop and phone widths, light and dark.

## Roadmap

1. A treadwheel crane lifting each stone.
2. The cut face drawn as a solid section, with the 2D thrust diagram on it.
3. Real rigid-body collapse when a piece is removed (statics still decides whether it fails).
4. Lab experiments in 3D: remove a flyer, thin a wall, strike the centering early.
5. The Florence dome.
6. More of the lab shared by link (designs already are).
