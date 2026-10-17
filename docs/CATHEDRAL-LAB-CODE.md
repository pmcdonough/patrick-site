# Cathedral Lab: the code

How Cathedral Lab is built, for someone who wants to change it or build on it: the layers and what each may import, the data model every building is made of, the APIs of the solver, the kit and the builders, how a page turns a building into a 3D build, the invariants, and step-by-step recipes for the common extensions. `CATHEDRAL-LAB.md` says what the lab is and why, with the sources for every building; this file says how. The site-wide rules (static files, version stamps, plain copy, one commit per version) are in `ARCHITECTURE.md` and `CLAUDE.md`.

## The layers

```
  pages        src/main.js (3D build)    design/src/main.js (design your own)    arch-lab/src/main.js (one arch, 2D)
                     │ import()                    │                                    │
  buildings    notre-dame.js   amiens.js   yours.js ── make(design) ──┐                 │
               (by hand)       (gothic.js + its own parts)            │                 │
                     │               │            │                   │                 │
  builders           │          gothic.js: section, aisled, front, crossing, apse      │
               design.js: the choices, sectionOf, layoutOf, assess, challenges, link   │
                     │               │                                                  │
  kit          kit.js: createKit (pieces, steps, arches, centering, loads); geometry    │
                     │                                                                  │
  solver       solver.js: arches, lines of thrust, walls and buttresses, wind ◀─────────┘
                     │
  library      vendor/three.module.js (r128), vendor/OrbitControls.js
```

Each layer imports only the layers below it. Nothing below the pages touches the page: no `document`, no `window`, no drawing, so the solver, the kit, the builders and every building load in Node for the unit tests. The pages are the only place that knows about the screen.

| File | Lines | What it holds |
|---|---|---|
| `src/solver.js` | ~190 | Rigid-block masonry: `build` (an arch's voussoirs and joints), `solve` (the minimum-thrust line of thrust), `minThickness`, `thrustPoints`, `pierCheck` (a wall or buttress under loads), `supports` (the wall, flyer and buttress of one side, in calm air or a storm) |
| `src/kit.js` | ~110 | `createKit()`: pieces, steps and bags, `placeArch`, `placeCentering`, the load model; geometry helpers (`boxG`, `cylG`, `extr`, `lancet`, `rect`, `circle`, `ruled`, `archShapes`) |
| `src/gothic.js` | ~640 | The Gothic builder: `section` (a cross-section solved once), `aisled` (stretches of bays in the masons' order), `front` (end walls, towers, spires), `crossing`, `apse`, `frame` (local coordinates) |
| `src/notre-dame.js` | ~1,000 | Notre-Dame, piece by piece on the kit (it predates the builder; its six-part vaults and galleries are its own) |
| `src/amiens.js` | ~380 | Amiens on the builder, plus its own crossing, apse, west front, towers and spire |
| `src/design.js` | ~150 | Design your own: the choices, `clamp`, the link, `sectionOf`, `layoutOf`, `assess`, the words for a verdict, the challenges and presets. No geometry |
| `src/yours.js` | ~190 | `make(design)`: a design built with the builder, its ends, its apse, its collapse |
| `src/main.js` | ~460 | The 3D page |
| `design/src/main.js` | ~240 | The design page: controls, the section and plan drawings, gauges, challenges |
| `arch-lab/src/main.js` | ~380 | How an arch stands: one arch in section, built and struck |

## Units and coordinates

Metres, kilonewtons, seconds. Unit weights in kN/m³: limestone 22 (`GAMMA`), oak 7.5, lead 111. Forces in the solver are per metre of vault length.

World axes: x across the church (north negative), y up, z along it (west positive; the 3D page's camera opens from the north-west). The solver works in a section with the arch's crown at x = 0 and its springing at y = 0, the left (negative x) half; `X(s, x)` mirrors a left-side position to side `s` (-1 or +1).

The builder works in frames: `frame(ox, oz, u, v)` gives a stretch its own local x (across, along `u`) and local z (along, along `v`), both unit vectors in plan, so one piece of code builds a nave running west, a choir running east and transept arms running north and south. `F.P(x, y, z)` maps local to world; `F.box`, `F.cyl`, `F.across` (a profile in local x and y, extruded along z), `F.along` (a profile in local z and y, extruded along x) and `F.dir` build geometry in the frame.

## The piece: the data model

A building is a flat list of pieces in steps. Every piece is added once, by `K.add(id, kind, name, geometry, options)`:

| Field | Meaning |
|---|---|
| `id` | Unique in the building, and structured: a stretch's prefix, a kind code, the side (`A` left, `B` right), the line or bay, a course or stone (`NBU-A3-2` is the nave's buttress on the left at line 3, course 3). The kit refuses a duplicate |
| `kind`, `name` | What it is in the step's parts list ("drum"), and what Inspect calls it ("Drum 2, pier 4 (nave, north)") |
| `geo` | A Three.js geometry in world coordinates. Built in the building module, merged into batches by the page |
| `step`, `until` | The step it goes in, and the step it comes out (centering) or `null` |
| `mat`, `tint`, `group` | Material (`stone`, `web`, `timber`, `oak`, `lead`, `glass`, `pave`, `bronze`, `copper`, `gilt`, `dark`), a glass color, and `roof` for what the Roof toggle hides |
| `w`, `bear`, `sup` | Its weight in kN, the area it bears on in m², and what it rests on: `[[id, share], ...]`, shares summing to 1 |

`K.finish()` links every piece to the pieces it rests on and throws on a support that does not exist, so a building with a broken load path does not load. `K.computeLoads(n)` gives every piece live after step `n` its `load` (its own weight plus its shares of everything resting on it) and `stress` (MPa). This is weight only, down a fixed path; the sideways pushes are the solver's business and are drawn as the force lines.

Steps: `K.bag(n, name)` starts a bag, `K.step(title, note, { focus })` starts a step (and returns its index), `K.at()` is the current step, `K.removeAt(filter)` marks pieces as coming out in the current step. `placeArch(prefix, B, opts)` adds an arch's voussoirs and keystone along any direction with their load chain to its springers; `placeCentering(prefix, B, opts)` adds the timber frame under it.

## The building contract

The 3D page loads a building with `import()` and reads these exports. A module either exports them directly (Notre-Dame, Amiens) or exports `make(design)` that returns them (your own).

| Export | What the page does with it |
|---|---|
| `pieces`, `steps` | The build: batches, the booklet, the bags, the slider |
| `computeLoads(n)`, `live(p, n)` | Color by load and Inspect; which batches are shown at step `n` |
| `forceLines()` | `[{ z, at, normal, radial, end, lines: [{ pts, r }], bases }]`: one entry per bay line, drawn as red tubes; the page shows the nearest one seen broadside, or the one just behind the cut, among those whose vault stands |
| `STEP_STRUCK` | The first strike of a main vault; no line is drawn before it |
| `HIDERS` | `[{ step, west | east, msg }]`: past that step, from beyond that z, the front hides the line, and the key says so |
| `KIT` | The page's words and settings: `id`, `name` (in the header's list), `place`, `title`, `matchup`, `lede`, `about` (paragraphs), `start` (the empty-site page), `cut` (`{ min, max, value }` for the cutaway), and optionally `open` (the step to open on), `person` (`[x, z]` for the figure for scale), `back` (`{ href, label }` to the design), `falls` (the collapse). A building that is not masonry (the house) also gives `mats` (its own materials, each a function that makes one; textured ones get texture coordinates in the batches), `load` (`{ legend, xray }`: color each piece by `p.util`, the share of its allowable strength, instead of by pressure, and hide the cladding materials in `xray` meanwhile), `inspect(p, n)` (its own Inspect rows), `forces` (`{ label, note, off }`), `cards` (notes that replace the cathedral ones), `intro`, `aria`, `camera`, `near`, `whole`, `cutView` (`{ y, from }`), `ground` (a color), `shadow` (the sun's shadow box) and `pit` (a cellar hole dug at a step). Any building can give `views` (`[{ name, at: [x, y, z], look: [x, y, z] }]`: places to stand inside, `at` roughly where your feet go, since you stand on what is built there) and `rooms` (`[{ name, x0, x1, z0, z1, y0, y1 }]`: boxes that name where you are), and `insideName` (what to call anywhere else); `person: false` leaves out the figure for scale. Pieces with `site: true` (trees, lawns, cars) stay out of the framing and the camera's bounds |

`BUILDINGS` at the top of `src/main.js` lists them; `?b=<id>` picks one.

## The solver

`build({ shape, span, thick, count })` cuts a round, pointed (equilateral) or catenary arch into `count` voussoirs and returns its joints, blocks, keystone and cumulative loads. `solve(arch)` finds the minimum-thrust state: for a crown height, each joint's thrust position is a ratio of two linear functions of the horizontal thrust H, so the H values where it touches a face split the line into intervals that pass or fail as a whole; it takes the smallest feasible H over a sweep of crown heights. `minThickness` bisects on that. `thrustPoints` gives the line's points.

`pierCheck(xo, w, h, loads)` follows the resultant down a rectangular pier under point loads and says where it meets the base: `e` from 0 (outer face) to 1 (inner face), and the verdict `solid` (middle third), `cracks` (in the base, outside the middle third) or `overturns` (outside the base). `supports(arch, state, opts)` sets up one side: the wall under the springing, and with `flyer` a flyer to a buttress pier (`gap`, `bheight`, `flyerTop`, `bdepth`, `pinnacle`). With `wind: { F, y }` a storm pushes the lee side, and `upper: { yA, yB }` adds an upper tier of flyers that takes it; `btop` is the buttress's full height. With none of those three the results are exactly what they were before they existed.

The tests (`tools/test/cathedral-lab.test.js`) hold it to known results: a semicircular arch needs a depth of 0.1075 of its radius (Milankovitch), a pointed arch less than a round one and a catenary far less, a thrust line inside the stone at every joint, a 1.2 m wall that tips under a 12 m vault and stands with a flyer, and the storm's effects.

## The Gothic builder

`section(o)` takes a cross-section and solves it once: the vault (`span`, `thick`, `shape`, `springing`), the wall, the aisles (`aisle`, `aisleWall`, `aisleSpring`, `aisleTop`, `aisleRoofTop`), the levels (`arcade`, `triforium`, `cornice`), the buttresses and flyers (`bdepth`, `flyerLow`, `flyerHigh`, `tiers`), the piers' drums. It returns every position the rest needs (`XI`, `XO`, `XW`, `XA1`, `XA2`, `outer(n)`, `xbI(n)`, `xbO(n)`, the roof's `RX`, `RY`, `RIDGE`, the upper flyer's `yU`), the solved arch (`ARCH`, `SOL`) and `supports(n, storm)`.

`aisled(K, sec, runs, text)` builds one or more stretches together, step by step in the masons' order: footings, piers, arcades on centering, aisle walls and vaults, the upper walls, buttresses, flyers on centering, pinnacles, the vault on centering (transverse, diagonal and wall ribs, bosses, webs), the strike, roofs. A run is `{ T, name, F, lines, sideName, sides }`: `T` the id prefix, `F` its frame, `lines` its bay lines (local z). Each side (`sides[-1]`, `sides[1]`) says `aisles` (1 or 2), which bays are `open` (no outer wall, where another stretch's aisle crosses), `noAisleArch`, `chapels`, and `line(i)`: what stands on the outer wall at line `i`, `'buttress'`, `'corner'`, `'none'` or `{ sup }` (lean on another stretch's pier). `mainLink(i)` and `aisleLink(i)` make a stretch use another's piers, so a crossing's piers are built once. `text` gives each step's words by key, `bag(key)` starts bags, `after(key)` runs at the end of a step so a caller can add its own pieces to it, `afterStrike()` and `noRoofs` let a building stop at the strike. It returns `STEP_STRUCK`, the roof's numbers, and `chapels()`, `glaze()`, `pave()` and `forceLines()` for the caller to use later.

`front(K, sec, run, { i, out, west, towers, spires, text, id })` closes a stretch at line `i` with a wall in the vessel's outline: portals and a rose at the west, three lancets and a rose at the east, a gable, and towers with belfries and spires. `crossing(K, sec, { nave, choir, armN, armS })` adds a crossing's vault between four stretches' first transverse ribs (call its `centering`, `ribs` and `webs` from `after`), its roof and a spire. `apse(K, sec, run, { i, out, nap, chapels, text })` closes a stretch with a half-polygon on the same section: piers, ambulatory, buttresses and flyers on radial lines, half-ribs, a half-cone roof, radiating chapels, its own force lines.

## Design your own

`design.js` holds the design as a handful of choices (`DEFAULT`, `LIMITS`), and is pure: `clamp` makes any input a valid design (the URL is input), `encode`/`decode`/`query` put it in the address, `sectionOf(d)` turns it into a section in Amiens' proportions, `layoutOf(d, sec, L)` places the stretches (the nave alone, or nave, choir and arms round a crossing), `assess(d)` gives the verdict at the strike and in the storm, and `summary`, `advise` and `lands` put it in words. The design page and `yours.js` both read these, so the drawing, the plan, the verdict and the 3D build cannot disagree.

`yours.js` `make(design)` builds the stretches with one `aisled()` call (so the whole church rises together), the crossing through `after`, then the west front, the transept ends, the apse or the east end, the spire, the chapels, the glass and the storm. A design that fails stops at its failing step: after the strike (`afterStrike` adds It falls, `noRoofs`) or on the storm step. `KIT.falls = { step, motions }` lists every piece that falls with how (`out`, `dir`, `delay`, `spin`, `axis`, `rest`); `KIT.open` makes the page open on the step before.

## The 3D page

On load, `src/main.js`:

1. Picks the building from `?b=` (and for your own, the design from `?d=` or the browser), loads it with `import()`, and fills the header and the about card from `KIT`.
2. Merges the pieces into **batches**, one mesh per (step, removal, material, tint, group). Each piece remembers its range of vertices and triangles in its batch and its bounding box. About 100 batches for a cathedral of 6,000 pieces.
3. Adds a vertex shader to each batch's material for the drop into place (each piece with its own delay), so a step goes in stone by stone at the cost of one uniform per batch.
4. Builds the force lines as tubes drawn over the stone, and works out when each is **ready**: the step when the timber centering under its crown comes out.
5. Opens on the finished model (or `KIT.open`) like the picture on the box.

Then everything happens in `applyStep(n)`: batches shown or hidden (or animated in or out), loads computed, colors rewritten only for pieces whose color changed, the booklet and the bags redrawn, the collapse posed. The render loop draws **only when something changed** (`redraw()`); a still model costs nothing.

The camera: the wheel is caught before the orbit controls and zooms toward the point under the pointer, moving the orbit target to that depth; a double tap flies to a piece or the whole building; the target never leaves the building. Picking tests a ray against piece boxes, then that piece's triangles in its batch. The collapse moves each falling piece's vertices in its batch on the processor, and puts them back when you step back.

`window.cathedralLab` (`go`, `state`, `steps`, `pieces`, `batches`, `camera`, `controls`, `bayLines`, `falls`, `building`, `VERSION`), `window.designLab` and `window.archLab` are what the checks drive the pages through.

## Invariants

- Nothing below the pages touches the page. The tests load the solver, the builders and every building in Node.
- Every piece's supports exist (`K.finish()` throws), and every id is unique (`K.add` throws).
- A refactor of a building changes nothing: its fingerprint (each piece's id, step, removal, weight, bearing, supports, vertex count and carried load) is byte-identical before and after. Notre-Dame and Amiens have been held to this through the kit, the builder, the design work and the transept and apse.
- The solver's new options default to no change (`supports()` without `wind`, `upper` and `btop`).
- Every `?v=` stamp and every page's `VERSION` agree (`smoke.js`).
- Unlike the hockey engine, nothing here replays a seed, so `Math.sin` and the rest are fine; `detmath.js` is not needed.

## How to extend it

**Add a building by hand** (as Notre-Dame): create `src/<id>.js`, `createKit()`, add pieces step by step with real supports, export the contract above, add it to `BUILDINGS` in `src/main.js`, and add `?b=<id>` to the clean-load list in `tools/smoke.js`. Put its sources in `CATHEDRAL-LAB.md`.

**Add a building that is not stone** (as the house): build it on the kit in feet or whatever its drawings use, converting at the edge; give checked members `check(on)` returning one of `wood.js`'s results, and the load sources `lv` tags so `computeLoads(n)` knows what is built; export the contract with the optional `KIT` fields above. Put its sources and its assumptions in `CATHEDRAL-LAB.md`.

**Add a Gothic building** (as Amiens): describe its section with `section()`, its stretches as runs in frames with their bay lines and sides, call `aisled()` with words for each step, then add what is its own (the crossing with `crossing()` or by hand, `front()` or a custom west front, `apse()` or a custom one). Read `amiens.js` first; it is the worked example.

**Add a choice to design your own**: add it to `DEFAULT` and `LIMITS` (or `clamp` for a non-numeric one), give it a key in `KEYS` for the link, use it in `sectionOf`, `layoutOf` or `yours.js`, add its control to `design/index.html` and `update()` in `design/src/main.js`, draw it in the section or the plan if it shows there, and add a design that uses it, at the ends of its range, to the unit tests.

**Add a challenge**: one entry in `CHALLENGES` with a `test(assessment)`; add a design that meets it to the challenge test, which proves every challenge can be met.

**Change the physics**: in `solver.js`, with a unit test against a known result, and with the new behavior off by default so the buildings' fingerprints stay identical; then use it in `section().supports` or `assess`.

**After any change**: `node --test tools/test`, the fingerprints of Notre-Dame and Amiens if the kit, the builder or the solver changed, `node tools/smoke.js`, and a look at the pages at desktop and phone widths, light and dark. Then the version: `node tools/bump.js cathedral 0.x`, the changelog, the home card's badge, and the docs.

## Checking a building's fingerprint

```
node -e "
const M = await import(process.argv[1]); M.computeLoads(M.steps.length);
console.log(M.pieces.map(p => [p.id, p.step, p.until, p.w.toFixed(3), p.bear.toFixed(3), p.sup.map(([i, f]) => i + '*' + f.toFixed(4)).join(','), p.geo.attributes.position.count, p.load.toFixed(2)].join('|')).join('\n'));
" --input-type=module "$PWD/public/cathedral-lab/src/amiens.js" > /tmp/amiens.before
```

Run it before and after a change and compare the two files with `cmp`; for your own, call `make(design)` on a few designs instead.
