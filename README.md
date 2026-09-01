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

## Use

Open `index.html`. Paste roster (`Name, Department`) and sessions
(`YYYY-MM-DD | cost | Name, Name, ...`), hit **Allocate**.

## Deploy (GitHub Pages)

Repo → Settings → Pages → Source: **Deploy from a branch**, branch `main`, folder `/ (root)`.

## Caveat

Allocator is greedy: oldest session first, report seeded with the highest-headroom candidates,
cost split evenly and capped by each person's remaining quota (surplus re-spread, extra funders
added until covered). Good plans, not proven-optimal ones. If quota cannot stretch to 4 *paying*
names, the session is reported unfunded rather than filed short-staffed.
