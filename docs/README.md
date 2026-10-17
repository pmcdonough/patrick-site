# Documentation

Every doc in the repo, what it is for, and where to start depending on why you are here.

## Where to start

**Curious how it works.** `../README.md`, then `ARCHITECTURE.md`. The site's own Under the hood page (`public/under-the-hood/`, the easter egg in the home page footer) tells the same story for visitors.

**Going to change something.** `../LOCAL-SETUP.md` to set up and run the checks, `../CLAUDE.md` for the rules and the shipping checklist, `EXTENDING.md` for the recipe, then the project's own docs below. Read `DECISIONS.md` before undoing a decision.

**Interested in the models.** `MODELING.md` for every model and how far to trust it, `XG-MODEL.md` for the expected-goal fit, `ENGINE.md` (Baselines) for how the engine compares with the NHL, `CATHEDRAL-LAB.md` (Physics) for the masonry.

**Interested in how it was made.** `PROCESS.md`, then `HISTORY.md`, `RESTRUCTURE.md` and `../CHANGELOG.md`.

## Site-wide

| Doc | What it covers |
|---|---|
| `../README.md` | the front door: the projects, how to run it, the repo map |
| `ARCHITECTURE.md` | the system, the stack and what was left out, the pure-core pattern, the hockey engine's shape, shared code, versions and caching, browser storage, the layers of checks, deploys |
| `DESIGN.md` | principles, voice and copy, type, color tokens, light and dark, layout, components, canvas, motion, print, phones, a checklist for new pages |
| `EXTENDING.md` | recipes for common changes, from a number in a data file to a new project, and how to ship |
| `DECISIONS.md` | the decisions that shape the repo, each with when, why and what it costs |
| `PROCESS.md` | who did what, the phases, the working loop, how things are measured |
| `ROADMAP.md` | where each project stands and what comes next, in priority order |
| `RAW-INPUTS.md` | every raw input file: what it is, its URL, retrieval date, the command that uses it |
| `../LOCAL-SETUP.md` | one-time setup on a new machine and every check |
| `../CLAUDE.md` | project memory for Claude Code: rules of the road, the checks for each change, shipping a version, the current state |
| `../CHANGELOG.md` | every version of the site and each project |

## Hockey Strategy Lab and Play Review

| Doc | What it covers |
|---|---|
| `HOCKEY-LAB.md` | the project overview: the three views, what the engine models, the data files, sources |
| `ENGINE.md` | the code: file structure, coordinates, where each function lives, invariants, reference numbers, system effects, lessons learned |
| `MODELING.md` | every model: measured, calibrated or inferred, where it lives, known weaknesses, what tracking data would change |
| `XG-MODEL.md` | the expected-goal model: data, method, fit, shooter finishing, how both pages use it |
| `PLAY-REVIEW.md` | Play Review's pipeline, reconstruction, scoring, replay and limits |
| `RESTRUCTURE.md` | how the single-file page became modules (sites 0.50 to 0.56), and what was found on the way |
| `HISTORY.md` | what was built before version numbers, in order |

## Cathedral Lab

| Doc | What it covers |
|---|---|
| `CATHEDRAL-LAB.md` | concept, modes, the physics, the buildings as built, design your own, simplifications, the look, checks, roadmap |
| `CATHEDRAL-LAB-CODE.md` | the code: layers, the piece data model, the building contract, the solver, kit, builder and design APIs, the 3D page, invariants, recipes |

## Ring Kart

| Doc | What it covers |
|---|---|
| `RING-KART.md` | the session, the lap, the driving model, the cars, the world, checks, real lap times |

## Keeping the docs true

- A change that moves a number updates the doc that records it in the same commit: `ENGINE.md` (Baselines) for the references, `MODELING.md` for a model, a project's doc for its behavior.
- Versions are written in `../CLAUDE.md` ("What this repo is" and "State"), the first line of `ROADMAP.md` and `../CHANGELOG.md`; `ARCHITECTURE.md` gives them "as of this writing" and may lag.
- Something that was wrong and is now fixed goes into a Lessons learned list. Something tried that did not work goes into the roadmap's ruled-out notes, with its number.
- A new decision gets a new entry in `DECISIONS.md`; an old one is replaced by a later entry, not rewritten.
- Docs follow the site's copy rules: plain, short sentences, no em dashes.
