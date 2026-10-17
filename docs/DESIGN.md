# Design

How the site looks, reads and behaves, and the rules a new page or feature follows to fit in. The rules came out of the projects as they were built; each project's own doc has its details (`docs/CATHEDRAL-LAB.md`, The look; `docs/RING-KART.md`).

## Principles

1. **The thing itself first.** Each page opens on the rink, the cathedral or the car, not on an explanation. The explanation is one click away (How it works, the ? buttons, the booklet).
2. **Plain words a fan would use.** The hockey lab speaks hockey ("net chances", "man-on-man", "a clear cost"), Cathedral Lab speaks masonry ("line of thrust", "strike the centering"). Never a file name, a parameter or a function on the page.
3. **Say what is real and what is not.** Anything inferred or mocked (positions at a real shot, replay movement, a scripted drop-in) is labeled where it is shown.
4. **Never say more than the numbers show.** A lab verdict is "too close to call" whenever its 95% interval includes zero, and the baseline's headline leads with chances because they are the number to trust.
5. **One strong color for what matters.** The thrust line, the team color on a slider, the carrier's best pass. Everything else is quiet.

## Voice and copy

- Plain and factual. Short sentences. No marketing.
- No em dashes, anywhere, in the pages or the docs.
- Name a control by what it does: "Test against the baseline", "Play from the start", "Print or save as PDF".
- A button that cannot do anything yet is disabled, not hidden, with a reason nearby (Rerun the baseline is enabled only after an edit).
- Numbers carry their unit and their uncertainty: "4.6 chances a game to 3.6", "within the normal swing from luck at 50 games".
- System descriptions in `systems.json` are shown to visitors, so they are written in hockey terms.
- The About dialog (How it works) explains everything in the page's own terms and ends with a glossary. Data sources are listed once, folded, in the Settings drawer.

## Typography

| Use | Face | Where |
|---|---|---|
| Display: titles, scoreboard, view switcher, buttons | Barlow Condensed 600 and 800 | the projects (`--display`) |
| Body | Barlow 400 to 600 | the projects (`--body`) |
| Everything | Inter 400 to 700 | the home page, Under the hood, Play Review |
| Ring Kart's big words, and its numbers | Racing Sans One, and Bungee (since Ring Kart 0.14; Shrikhand and Righteous before, which read as generic 70s retro); Barlow for reading | Ring Kart |
| Code | the system monospace | Under the hood |

Each has a real fallback stack (`'Arial Narrow'`, `system-ui`) so a page still reads before the fonts arrive. Titles use `clamp()` sizes and `text-wrap: balance`. Running text is capped at about 62 to 80 characters a line.

## Color

Colors are CSS custom properties on `:root`, one set per stylesheet. The hockey lab's tokens, which Cathedral Lab shares:

| Token | Light | Use |
|---|---|---|
| `--bg` | `#e9ecef` | the page |
| `--panel`, `--raised` | `#f7f8fa`, `#ffffff` | cards and controls |
| `--fg`, `--fg-dim` | `#16202c`, `#5c6978` | text, secondary text |
| `--line` | `#d2d8e0` | borders and rules |
| `--link` | `#0b4ea2` | links and focus rings |
| `--ice`, `--ice-line-red`, `--ice-line-blue` | `#f3f8fc`, `#c8102e`, `#0b4ea2` | the rink |
| `--home`, `--home-2` | `#000000`, `#ffb81c` | the Bruins |
| `--away`, `--away-2`, `--away-3` | `#af1e2d`, `#ffffff`, `#192168` | the Canadiens |
| `--bos-tint`, `--mtl-tint` (and `-edge`) | pale gold, pale red | a team's card |

The home page and Under the hood use a warmer paper palette (`--bg: #f6f4ef`, `--accent: #1f5f9e`). Ring Kart has its own look, a 1970s Saturday-morning cartoon: cream paper, brown ink, mustard, orange and red racing stripes (`--bg: #f6ead2`, `--ink: #2a1a0e`, `--mustard`, `--orange`), with the HUD drawn as inked stickers over a full-bleed 3D stage, because it is a game and should feel like one.

Team colors are the clubs' own. Good, flat and bad verdicts use green, gray and red, always with words beside them, never color alone.

### Light and dark

Every page follows the visitor's system theme and honors an explicit choice. The pattern, in every stylesheet:

```css
:root { /* the full light palette */ }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { /* the dark tokens */ color-scheme: dark; } }
:root[data-theme="dark"] { /* the same dark tokens */ color-scheme: dark; }
```

Only tokens change; no color is defined only in a dark block, and `body` always sets its background. Canvas drawing reads the same tokens, so the rink and the arch follow the theme. The ice stays light in dark mode, as real ice does.

## Layout

- One centered column: `max-width: 1240px` for the hockey lab, narrower for reading pages. The header, the views and the lab all share that width, so their edges line up.
- A side gutter of at least 16px at every width, plus the phone's safe-area insets (`env(safe-area-inset-left)`).
- Grids collapse to one column below about 700 to 900px (`.planpair`, `.plans`, `.test`). Nothing has a minimum width wider than a phone. Only tables and the canvas may scroll sideways, each in its own container.
- The rink canvas keeps its shape with `aspect-ratio: 200 / 109` and fills the column.
- Round corners (10 to 14px) on panels, cards and the canvas; a 1px `--line` border, no heavy shadows.

## Components

The hockey lab's pieces, reused where they fit:

| Component | Class | What it is for |
|---|---|---|
| View switcher | `nav.views` | the three views and How it works; the pressed one is solid `--fg` |
| Card | `.card` | a block of content: a plan, a result, a baseline |
| Drawer | `.drawer` | a side panel over the page: the Watch plans, Settings |
| Segmented control | `.seg` | two to four exclusive choices (replay speed, which plan to open) |
| Pill | `.pill` | a short status ("Changed", a verdict) |
| Chip | `.chip`, `.chips` | a recent game, a quick choice |
| Explainer | a `?` button with `data-term` | one term, explained in place; the same text feeds the glossary |
| Dialog | `<dialog>` | How it works |

Buttons are real `<button>` elements, with `aria-pressed` for toggles and `aria-label` where the text alone is not enough. A component that is selected sets its own colors, so a global pressed style cannot make it unreadable.

## Drawing on canvas

- Feet in the engine, pixels only at the last step. The rink is drawn from `rink.js`'s geometry, scaled to the canvas.
- Everything is drawn from the engine's state; the page never moves a player itself.
- Effects (skate trails, puck streaks, rings, the save flash, the goal light) are drawn under the players and cleared at every whistle. Each effect group has a toggle, remembered in the browser.
- Labels that must fit (the penalty box, the scorekeeper) use `fillText` with a maximum width rather than a condensed font.
- Cathedral Lab draws on demand: nothing renders unless something changed.

## Motion

Animation explains or it goes. The goal light, the save flash and the drop of a stone into place show an event. `prefers-reduced-motion` turns off the decorative ones (the hockey lab's flash and progress bar, all transitions in Cathedral Lab) and keeps the information.

## Print

Printing is the browser's job. The page makes no PDF. A Print or save as PDF button builds a report into `#printOut`, sets `body.printing` and calls `print()`; the print styles show only that report, in the light palette whatever the theme, sized to fit Letter and A4. Printing from the browser's menu builds the same report (`beforeprint`) and clears it afterward (`afterprint`). Review a game prints the shot on screen on one page; the lab prints the baseline and every test.

## Phones

Every page works at about 400px wide, in both themes, with touch. The hockey rink is small on a phone but complete (a follow-the-puck camera is parked in `docs/ROADMAP.md`). Ring Kart adds on-screen buttons and a gamepad, and eases the all-or-nothing keys and taps into steering. Before shipping a visible change, look at it at desktop and phone widths, light and dark.

## Checklist for a new page or feature

- [ ] It uses its project's tokens and fonts; no new colors without a token.
- [ ] Light, dark and the explicit theme choice all work.
- [ ] It reads at 400px with a 16px gutter and no sideways scroll.
- [ ] The copy has no internals, no em dashes, and names controls by what they do.
- [ ] Anything inferred or mocked says so.
- [ ] Numbers carry units and, where it matters, their range.
- [ ] Decorative motion stops under `prefers-reduced-motion`.
- [ ] If it can be printed, the print styles show only the report, in light colors.
