# Keystone

Build a famous building piece by piece, the way a big brick architecture kit does, except every piece is a real structural element and the building stands or falls for the same reasons the real one did. The audience is a high school freshman who has built the brick kits and likes how things work, so real forces and real units are fine.

Version 0.3 (site 0.87). Live at `/keystone/` (the 3D build) and `/keystone/arch-lab/` (the arch lab). It began as two prototypes built in a chat session: a 3D proof of three bays of Notre-Dame's nave and a 2D arch lab, each a single file with the solver pasted in.

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

How the solver works (`public/keystone/src/solver.js`): for a crown height, every joint's thrust position is a ratio of two linear functions of the horizontal thrust H, so the H values where it touches either face split the line into intervals that pass or fail as a whole. It tests each interval and keeps the smallest feasible H, over a sweep of crown heights: the minimum-thrust state, the one an arch settles into once its walls lean out a hair. Minimum thickness is a bisection on that. Walls and buttress piers are rectangles checked by where the resultant of the arch's thrust and their own weight meets the base; a flying buttress is a strut that carries all of the vault's horizontal thrust to the buttress pier.

Checked against known results in `tools/test/keystone.test.js`: a semicircular arch's minimum thickness is 0.1075 of its radius (Milankovitch), and the solver gets 0.1075 at 41 and 81 stones; a pointed arch needs less than a round one and a catenary far less; a 1.2 m wall 20 m tall tips under a 12 m pointed vault and stands with a flying buttress.

The 3D bay uses the same solver at its own dimensions (12 m pointed vault 0.7 m deep, walls 1.2 m thick to 24 m, buttress piers 3.8 m deep with pinnacles): about 39 kN per metre of outward push, 50 kN per metre in each flyer, the wall's base resultant at 0.53 of its width and the buttress's at 0.40, both inside the middle third.

## Buildings

1. Notre-Dame de Paris. The cross-section through a nave bay is the key teaching view. In 0.1 and 0.2: three bays, 871 pieces in 39 steps. Since 0.3: the whole nave, ten bays and 60 m, 3,265 pieces in 41 steps in 9 bags. Next, one part per version: the west front and its towers; the transept, crossing and spire; the choir and apse, whose flyers (Jean Ravy's, 14th century) reach about 15 m in a single flight.
2. Brunelleschi's dome in Florence: drum, ribs, herringbone courses, two shells, stone and iron chains, lantern.
3. Later: the Taj Mahal as a double-dome comparison.

## The nave as built (0.3)

Ten bays of 6 m between the crossing (z = -30) and the west front (z = +30), five six-part vaults over pairs of bays, a 12 m nave. Sources agree on the six-part vaults over double bays, the double aisles and the gallery over the inner aisle; they count the bays as ten single bays or five double ones. In section, each side: the nave wall (1.2 m) on round piers 1.5 m across; the inner aisle, 6 m centre to centre, with the gallery over it; a row of slimmer aisle piers carrying the gallery's outer wall; the outer aisle, 6 m; the outer aisle wall, 1 m, between buttress piers 3.8 m deep. Levels: arcade springing 9.2 m, gallery 14.6 to 19.6, band 19.6 to 24 (the vault springs at 24), clerestory to the cornice at 34.8, ridge 45.4.

The flyers: one at every bay line, in a single flight over both aisles and the gallery roof, from 23 m on the nave wall to the buttress top at 21 m, about 11 m. Sources say Notre-Dame's flyers are single-flight; the 15 m figure usually quoted is for the choir's. Viollet-le-Duc thought the nave first had two ranks with an upright over the aisle piers; that is disputed and not modeled. In the solver this is `supports()` with `gap` 10.9 and `bheight` 21: about 39 kN per metre of push, 40 kN in each flyer, the wall's base resultant at 0.51 of its width and the buttress's at 0.39.

The elevation: the bay next to the crossing keeps the band of round openings Viollet-le-Duc restored; in the others the clerestory windows run down over the band, as they were lengthened in the 1220s.

## Current simplifications in the 3D build

- The vault's crown is about 35 m up (33 m in the real nave).
- Every bay line takes the same share of the vault. In a real six-part vault the heavy transverse lines carry more than the intermediate ones; Notre-Dame's nave piers are nevertheless all round.
- The chapels built between the buttresses in 1235 to 1245, the gallery's own vaults and floor, and the triforium are left out; the gallery has a plain lean-to roof.
- The flyer is a strut carrying all the vault's horizontal thrust; its own weight is not in the thrust line.
- The drop-in animation is scripted, not physics.

Each is said on the page.

## How it is built

```
public/keystone/
  index.html, style.css      the 3D build; style.css is shared with the arch lab
  src/main.js                the 3D page: scene, booklet, step controls, Inspect, load coloring, cutaway; VERSION
  src/notre-dame.js          the building as a kit: every piece with geometry, weight, bearing area and supports, in
                             steps and bags; the load model and the force lines. No page in it
  src/solver.js              the masonry solver, pure functions; both pages import it, the unit tests run it in Node
  src/vendor/                Three.js r128 (three.module.js, OrbitControls.js, LICENSE, README.md)
  arch-lab/index.html        the arch lab
  arch-lab/src/main.js       its page: the section drawing, the panel, Try this; VERSION
```

- Same rules as the rest of the site: plain ES modules, no build step, every file and import carries a `?v=` stamp with Keystone's version, and `node tools/smoke.js` fails if one disagrees. `node tools/bump.js keystone 0.x` sets `VERSION` on both pages and every stamp, the vendored Three.js included.
- Three.js is the site's only library. It is served from the site, not a CDN, like everything else. The one change to the vendored files is OrbitControls' import of `three`, pointed at `./three.module.js` with the version stamp so both load the same copy; `src/vendor/README.md` says how to upgrade.
- The solver and the building never touch the page. Unlike the hockey engine, nothing replays a seed, so Keystone uses `Math.sin` and friends freely; the hockey engine's `detmath.js` rule does not apply.
- The camera: scroll or pinch zooms toward the point under the pointer (the page catches the wheel before the orbit controls, which only zoom toward their target); a double tap flies to a piece or, on the sky, to the whole building; the target is kept inside the building's bounds. The line of thrust is drawn for one bay line at a time (the one nearest the camera, or just behind the cut), over the stone and without tone mapping.
- Batches: the pieces that come and go together (same step, same removal, same material, same roof group) are merged into one mesh, about 40 for the nave, about 60 draw calls a frame with shadows. Each piece keeps its range of vertices and triangles: its colors are rewritten only when they change, picking tests a ray against piece boxes and then that piece's triangles, and the drop into place runs in the vertex shader with a delay per piece.
- `window.keystone` (the 3D page) and `window.archLab` are the hooks the smoke check waits on.

## The look

Matched to the Hockey Strategy Lab, not to a CAD drawing: Barlow and Barlow Condensed, the same page colors and round-cornered panels, one strong color for what matters (the thrust, the hockey lab's red). In the arch lab, stone is flat with light seams between blocks, there are no dimension lines, every line has round ends, and the base checks are a green middle third under each base with a dot where the push lands. In 3D: even light from the sky, a soft low sun, no grid, smooth curves, and a ground that fades into the sky. The geometry and every number are unchanged by the look.

## Checks

| Run | When | Passes when |
|---|---|---|
| `node --test tools/test` | any change to the solver | `fail 0` (the Keystone tests run in under a second) |
| `node tools/smoke.js` | every change | `ERRORS: []`; it loads both Keystone pages, checks the 3D graphics started and the stamps agree |

Before shipping a visible change, look at both pages at desktop and phone widths, light and dark.

## Roadmap

1. A treadwheel crane lifting each stone.
2. The cut face drawn as a solid section, with the 2D thrust diagram on it.
3. Real rigid-body collapse when a piece is removed (statics still decides whether it fails).
4. Lab experiments in 3D: remove a flyer, thin a wall, strike the centering early.
5. The Florence dome.
6. Shareable Lab results by link.
