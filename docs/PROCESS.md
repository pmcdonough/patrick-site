# How it was built

How this repo came to be and the working method behind it, so that someone reading the code knows how much to trust it and how to keep working the same way. The detail of each step is in `CHANGELOG.md` (every version), `docs/HISTORY.md` (before version numbers) and `docs/RESTRUCTURE.md` (the move to modules). The decisions themselves are in `docs/DECISIONS.md`.

## Who did what

Nearly all of the code and documentation was written by Claude, directed, reviewed and tested by the site's owner. The owner's part is the product: what to build, how a coach or a visitor would use it, what a number should mean, and whether the result is right, often from a screenshot of something that looked wrong. Claude's part is the design and the code, the measurement, and the checks that show a change did what it said. Each new step starts with Claude saying whether it agrees with a request and why, before changing anything.

## The phases

| When | Phase | What it produced |
|---|---|---|
| 2026-10-12 to 10-13 | **One long chat session**, request by request, one HTML file | the rink, real rules, systems, rosters, line changes, EDGE-calibrated skating, MoneyPuck ratings (`docs/HISTORY.md`, 24 steps before any version number) |
| 2026-10-13 to 10-14 | **Versioned chat builds**, each version a full-repo zip uploaded to GitHub (sim 0.21 to about 0.33, site up to 0.40) | the data files with sources, the expected-goal model fit on 237,055 shots (0.29), Play Review 0.1, headless checks, the home page |
| 2026-10-14 | **Claude Code in the terminal** (site 0.41 on): Claude runs the checks itself and commits each version | `LOCAL-SETUP.md`, the reproducible matchup lab `tools/lab.js` (0.34), shots decided by expected goals (0.35), the Watch and Test views (0.36 to 0.38) |
| 2026-10-15 | **The restructure** (sites 0.50 to 0.56), planned in writing first, done in steps behind a safety net | the engine as 12 modules that never touch the page, the engine's own math (`detmath.js`), `newGame(seed)`, unit tests, Play Review on the sim's modules (`docs/RESTRUCTURE.md`) |
| 2026-10-15 to 10-16 | **Engine and product work on the new base** | angling, every goal behind a save roll, coverage fixes against the reality check, the Game plan lab as its own view, Review a game and What if he passed, CI on every push (site 0.68) |
| 2026-10-16 | **Outside review** of the Game plan lab (`review/FEEDBACK.md`, not committed), worked through item by item, each agreed or argued before any change | the baseline's headline leading with chances, lopsided games measured and explained, the plan cards' redesign (sims 0.63 to 0.66) |
| 2026-10-16 | **More projects**, each in its own session, sometimes three at once in the same folder | Cathedral Lab (as Keystone, from two chat prototypes, site 0.85), Ring Kart (site 0.94); the sessions split files between them and commit only their own |

About a hundred commits in five days, one per site version since 0.41.

## The working loop

Every change, large or small, goes the same way:

1. **Agree on the problem.** A request or a screenshot comes in. The first answer says whether it is right (the crease in sim 0.71 began with the rule itself: there has been no whistle just for being in the crease since 1999) and what the change would be.
2. **Measure before changing.** Find out how often it happens and why, with a trace in Node over seeded games. "Attackers stand on the goalie 1.2% of the time, and 0.6% of the preferred passes go to a man in the crease" is the kind of number a change starts from.
3. **Change data first, code second.** If a number is wrong, it is a data edit with its description updated. If behavior is wrong, the code changes and any new threshold goes into data.
4. **Measure after.** The same trace, the same seeds. Then both reference levels: every one of 200 saved games either finishes exactly as before, or the change explains why it did not.
5. **Check the balance it moved.** A fix that adds goals gets its calibration factor re-set, and the points split at both settings is checked.
6. **Write it down.** The changelog says what changed for a visitor. `docs/ENGINE.md` (Lessons learned) says what was wrong and how it was fixed, so nobody brings it back. What was tried and did not work goes in the roadmap's ruled-out list with its number.
7. **Ship it** as one commit with the versions in the subject, push, wait for the GitHub run, and check the live footer.

## How things are measured

The engine is a simulation, so "it looks better" is not evidence. The method:

- **Seeded games.** A game depends only on its seed, so a run of 100 games reproduces exactly. Any difference from the saved reference is the code's doing.
- **Fingerprints.** The reference keeps a fingerprint of every game, not just the averages, so "identical" means all 100 games.
- **Paired comparisons.** A strategy test plays the same seeds as its baseline (common random numbers), and its verdict is the paired 95% interval of the difference. An effect is real only when its interval excludes zero.
- **The right number first.** Expected-goal differential separates strategies in about 100 games; records need thousands. The lab leads with chances for that reason.
- **The real game as the target.** The reality check compares the baseline with each club's real 2025-26 rates, and the gaps are the to-do list (`docs/ROADMAP.md`). The one calibration factor that hides a gap (`goalie.tierGoalScale`) is recorded with every value it has had and why.
- **Ruling things out counts.** Many sensible fixes measured nothing, or made it worse. Each is recorded with its number, so the next attempt starts from there.

## How the code was kept changeable

- **A safety net before the restructure.** The checks over HTTP, the per-game fingerprints and the order check went in first (site 0.50), so that moving a single file into twelve modules could be proven to change nothing. Each step was one version with every check passing.
- **Bugs found by the checks.** Making the checks stricter found real bugs: browsers and Node computing `Math.sin` differently (fixed by `detmath.js`), and a dead pass that froze play for a period in one game in ten (sim 0.46).
- **Small modules with a map.** `docs/ENGINE.md` names the file for every function, and files are sectioned with `// ---------- Name ----------` comments, so a change starts by reading one section, not the whole engine.
- **The rules are written down.** `CLAUDE.md` holds the rules of the road, the checks for each kind of change and the shipping checklist. It is loaded at the start of every Claude Code session, so each session works the same way.

## Working with several sessions at once

On the last day three Claude Code sessions worked in the same folder (hockey, Cathedral Lab, Ring Kart). The method that kept them apart:

- Each session owns its project's files and docs; site-wide docs have one owner, agreed between the sessions by message.
- Each session commits only its own files, named by path, never `git add -A`.
- Shipping edits to shared files (the changelog, the home page, the version lines) go in one session's commit at a time.

## Keeping it this way

The habits worth keeping, in short: say whether you agree before changing anything; measure first; numbers in data; one commit per version; re-save references only on purpose and say so; record what was ruled out; every page checked in a real browser before it ships.
