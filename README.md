# Quota Quest

Static allocator for the **Team Up!** sports reimbursement quota.

## Problem

Rules cap each employee at **1 funded activity per month**, or up to **3 months of
accumulated allowance inside one quarter** spent on **1–3 activities**, hard-capped at
**IDR 1,200,000 per employee per quarter**. Unused allowance dies at quarter end.

The rules cap *whose budget pays*, not *who plays*. So a squad playing 3× a month at
800k/session can still get every session reimbursed — rotate the funders:

| Session | Funded by |
|---|---|
| Session 1 | A, B |
| Session 2 | C, D |
| Session 3 | E, F |

Quota Quest does that assignment and shows the remaining headroom per person.

## Rules encoded

- Session valid only with **≥ 4 employees** from **≥ 2 departments**
- All permanent / contract / probation employees eligible
- One funded activity per person per calendar month
- ≤ 3 funded activities per person per quarter, ≤ 1,200,000 total
- No carry-over across quarters — each quarter solved independently

## Use

Open `index.html`. Paste roster (`Name, Department`) and sessions
(`YYYY-MM-DD | cost | Name, Name, ...`), hit **Allocate**.

## Deploy (GitHub Pages)

Repo → Settings → Pages → Source: **Deploy from a branch**, branch `main`, folder `/ (root)`.

## Caveat

Allocator is greedy (oldest session first, funders sorted by remaining budget). Produces
good plans, not proven-optimal ones.
