<img src="logo.svg" width="56" alt="">

# Quota Quest

Static allocator for the **Team Up!** sports reimbursement quota.

## Problem

Rules cap each employee at **1 funded activity per month**, or up to **3 months of
accumulated allowance inside one quarter** spent on **1-3 activities**, hard-capped at
**IDR 1,200,000 per employee per quarter**. Unused allowance dies at quarter end.

The rules cap *whose budget pays*, not *who plays*. So a squad playing 3× a month at
800k/session can still get every session reimbursed: rotate the funders:

| Session | Funded by (report names) |
|---|---|
| Session 1 | A, B, C, D |
| Session 2 | E, F, G, H |
| Session 3 | A, B, E, F |

Quota Quest does that assignment and shows the remaining headroom per person.

## Rules encoded

- Each reimbursement report must name **≥ 4 funders** from **≥ 2 departments**; session cost splits across them
- A person can appear on at most **3 reports per quarter**
- All permanent / contract / probation employees eligible
- **Quarterly accumulation** (default): up to 3 reports per person per quarter, no monthly limit
- **Strict monthly** (toggle): also limits a person to 1 report per calendar month
- ≤ 1,200,000 claimed per person per quarter
- No carry-over across quarters: each quarter solved independently

## Screens

| Screen | Use |
|---|---|
| [`index.html`](index.html): Planner | Desk work. Paste the roster (`Name, Department`), then add sessions with **+ Add session**: date picker, cost, tap names to pick who played. Re-plans on every edit. |
| [`callsheet.html`](callsheet.html): Photo call sheet | Courtside, on a phone. Pick the session, see exactly which faces must be in the frame, tick them off, shoot the proof photo with the caption burned in. |

## Installable on Android (PWA, not an APK)

The planner is a Progressive Web App: open the Pages URL in Chrome on Android →
**Add to home screen**. It then launches full-screen with its own icon and works offline,
since the service worker caches the whole app.

Why not a native APK: GitHub Pages serves static files only, so an APK could not be
built or distributed from this repo. A PWA gets the home-screen icon, offline use and
camera access with zero build toolchain.

Camera needs HTTPS: GitHub Pages provides it. If permission is denied the checklist
still works; shoot with the normal camera app.

## Planned vs done

| State | Meaning |
|---|---|
| **Planned** | Editable. Tap any roster name in the session row to add or drop a player; funders re-solve instantly. |
| **Ineligible** | Not claimable at all: under 4 players, one department, or nobody left with quota. **Mark done** is disabled and the reason is printed under it. |
| **Short** | Claimable, but quota covers only part of the cost. **Mark done** stays enabled, showing `claims 600k of 800k`, since the covered part is still a real claim. |
| **Done** | The photo exists. Funders and amounts are frozen forever, the player list is read-only, and there is no delete: only a quarter reset clears it. |

Sessions are never deleted individually. That is deliberate: a done report is a filed
claim, and a planned one costs nothing to leave in place. Use **Reset quarter** to clear.

## Roster

One editable row per person, **+ Add person** to append, **Remove** to drop. Removing
someone also drops them from every planned session. Anyone funding a done report is
frozen: their row shows `funds report` instead of a Remove button and the name field is
read-only, because the claim is already filed. Someone who merely played in a done
session is not frozen, since the filed claim does not name them. Renaming a person on planned sessions
updates those sessions in place.

## Export / import

**Export JSON** downloads the whole state: roster, sessions, done reports with their
frozen funders, settings: as `quota-quest-YYYY-MM-DD.json`. **Import JSON** replaces
the device's state after a confirmation naming the counts. That is how you move a plan
from laptop to phone, hand over to the next organiser, or keep a backup before a
quarter reset.

Import is validated: wrong file tag, malformed dates, non-positive costs, an empty
roster, or a session marked done with no funders are all rejected with the reason.
Unknown player names are dropped silently.

## Immutable reports

A session's funder list is stored **on the session record**, not recomputed each time.
Capturing the proof photo marks the report **done**: those names and amounts freeze forever,
because you cannot go back and re-shoot last month's game. Done reports claim their
quota first; every later session is planned around what is left.

**Mark done** confirms first, naming the exact funders and amounts about to freeze.

## Quarter checks

Everything in the scheme is per quarter: the IDR 1,200,000 cap, the 3-report limit,
and reset. So the add-session form shows the quarter the picked date falls into, right
under the field. If it is not the quarter you are already working in (the quarter of
your newest session, or today's if there are none) it turns amber, explains that
quarters never share budget, and asks for confirmation on submit. Import does the same
check and reports when a file spans more than one quarter.

Results are reported **per quarter**: session cost, reimbursed, out of pocket, coverage,
done reports, quota used, and the per-person quota table: one card each. Only when more
than one quarter exists is a combined all-quarters total shown, below them.

## Quarter reset

Each quarter's card has a **Reset** button. Unused allowance never carries over, so a
reset deletes that quarter's sessions: done reports included: and returns everyone's
quota to full. Confirmation required; not undoable.

## Proof photo

Required faces = the funders named on that session's report (≥ 4, spanning ≥ 2
departments). Ticking them off gates a valid/invalid banner. Captured photos are
stamped with date, cost and the funder names, then saved or passed to the Android
share sheet. Photos never leave the device: no server, no upload.

## Files

- `index.html`: planner UI
- `callsheet.html`: phone call sheet + camera
- `alloc.js`: data store (`localStorage` key `quotaquest.v2`) + allocator core
- `logo.svg`: header mark (inlined in both pages, `currentColor` so it follows the theme)
- `favicon.svg`, `apple-touch-icon.png`, `icon-*.png`: icons
- `manifest.webmanifest`, `sw.js`: PWA shell
- `.nojekyll`: serve files as-is

## Logo

Four filled dots: the four employees a report must name: inside a quota ring left
open at the bottom, for allowance that never carries into the next quarter. Inline SVG
using `currentColor`, so it picks up the accent colour in light and dark themes.

## Deploy (GitHub Pages)

`.github/workflows/pages.yml` uploads the repo as-is on every push to `main`. Set
Settings > Pages > Source to **GitHub Actions**.

Deliberately **not** the Jekyll workflow: Jekyll runs every `.html` through Liquid, so a
stray `{%` or `{{` inside the app's JS or CSS can blank part of the page on Pages while
`file://` works fine. `callsheet.html` already contains `width:100%}`, which Liquid reads
as a tag close.

If an installed copy behaves differently from the deployed site, the build stamp is in
the page footer. **Force refresh app** clears the offline cache and re-registers the
service worker without touching your data.

## Android notes

The whole app is written in ES2017 syntax on purpose: no optional chaining, no nullish
coalescing, no object spread. Android in-app WebViews (links opened from WhatsApp,
Slack, Gmail) can be years behind Chrome, and one unsupported operator is a parse error
that kills the entire script, which shows up as dead buttons and blank fields rather
than an error.

Other hardening for touch:

- Any uncaught error paints a red banner naming the error and the build, instead of
  failing silently.
- `render()` is wrapped, so a draw failure still leaves the roster and your data intact.
- Clicks go through one delegated handler, not inline `onclick` attributes, so a name
  containing a quote can never break a button.
- Tapping a name chip flips it in place and defers the re-solve by 350ms. Rebuilding
  the row on every tap replaced the node under the finger, so fast taps did nothing.
- Fields are read on blur, not per keystroke, so typing does not rebuild the row you
  are editing. Inputs are 16px and buttons at least 42px tall under `pointer:coarse`.
- A corrupt or half-written `localStorage` value loads as empty rather than throwing.
  Verified against 10 malformed shapes, all render with no crash banner.

## Local vs deployed

The two are the same code, but not the same storage: `localStorage` is per origin, so a
plan entered on `file://` is invisible to `username.github.io` and vice versa. Move a
plan across with **Export JSON** then **Import JSON**.

Exported `.json` files are gitignored. They hold real names and claim amounts.

## Caveat

Allocator is greedy: oldest session first, report seeded with the highest-headroom candidates,
cost split evenly and capped by each person's remaining quota (surplus re-spread, extra funders
added until covered). Good plans, not proven-optimal ones. If quota cannot stretch to 4 *paying*
names, the session is reported unfunded rather than filed short-staffed.
