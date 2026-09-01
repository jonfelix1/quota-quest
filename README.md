# Quota Quest

Static allocator for the **Team Up!** sports reimbursement quota.

## Problem

Rules cap each employee at **1 funded activity per month**, or up to **3 months of
accumulated allowance inside one quarter** spent on **1–3 activities**, hard-capped at
**IDR 1,200,000 per employee per quarter**. Unused allowance dies at quarter end.

The rules cap *whose budget pays*, not *who plays*. So a squad playing 3× a month at
800k/session can still get every session reimbursed — rotate the funders:

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
- No carry-over across quarters — each quarter solved independently

## Two screens

| Screen | Use |
|---|---|
| [`index.html`](index.html) — Planner | Desk work. Paste roster (`Name, Department`) and sessions (`YYYY-MM-DD \| cost \| Name, Name, ...`), hit **Allocate**. Plan saves to the browser. |
| [`callsheet.html`](callsheet.html) — Photo call sheet | Courtside, on a phone. Pick the session, see exactly which faces must be in the frame, tick them off, shoot the proof photo with the caption burned in. |

## Installable on Android (PWA, not an APK)

The call sheet is a Progressive Web App: open the Pages URL in Chrome on Android →
**Add to home screen**. It then launches full-screen with its own icon, works offline
(service worker caches the whole app), and uses the rear camera through the browser.

Why not a native APK: GitHub Pages serves static files only, so an APK could not be
built or distributed from this repo. A PWA gets the home-screen icon, offline use and
camera access with zero build toolchain.

Camera needs HTTPS — GitHub Pages provides it. If permission is denied the checklist
still works; shoot with the normal camera app.

## Proof photo

Required faces = the funders named on that session's report (≥ 4, spanning ≥ 2
departments). Ticking them off gates a valid/invalid banner. Captured photos are
stamped with date, cost and the funder names, then saved or passed to the Android
share sheet. Photos never leave the device — no server, no upload.

## Files

- `index.html` — planner UI
- `callsheet.html` — phone call sheet + camera
- `alloc.js` — shared allocator core
- `manifest.webmanifest`, `sw.js`, `icon-*.png` — PWA shell
- `.nojekyll` — serve files as-is

## Deploy (GitHub Pages)

Repo → Settings → Pages → Source: **Deploy from a branch**, branch `main`, folder `/ (root)`.

## Caveat

Allocator is greedy: oldest session first, report seeded with the highest-headroom candidates,
cost split evenly and capped by each person's remaining quota (surplus re-spread, extra funders
added until covered). Good plans, not proven-optimal ones. If quota cannot stretch to 4 *paying*
names, the session is reported unfunded rather than filed short-staffed.
