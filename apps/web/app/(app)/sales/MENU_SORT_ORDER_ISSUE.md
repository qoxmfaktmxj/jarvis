# Sales menu sortOrder zone conflict

Status: open · decision needed before fix · last updated 2026-05-02

## Conflict

CLAUDE.md / `jarvis-architecture` skill ("RBAC 메뉴 트리" section) reserves the
SALES NAV zone as `sortOrder` 150–198. The current seed at
`packages/db/seed/menus.ts:96-103` violates that range — finance + extra menus
use sortOrder 220–232:

| File line | code                              | sortOrder |
| --------- | --------------------------------- | --------- |
| 97        | `sales.purchases`                 | 220       |
| 98        | `sales.tax-bills`                 | 222       |
| 99        | `sales.month-exp-sga`             | 224       |
| 100       | `sales.plan-div-costs`            | 226       |
| 101       | `sales.companies`                 | 230       |
| 102       | `sales.contract-uploads`          | 231       |
| 103       | `sales.plan-view-permissions`     | 232       |

The 220–232 band collides with the ADMIN zone (200 ≤ sortOrder < 400) — for
example `admin.organizations` at 220 (line 108) shares an order with
`sales.purchases`. Sidebar / CommandPalette ordering is undefined when two
visible items share a sortOrder.

## Options

1. **Renumber `menus.ts`** to fit within 150–198 (compress all SALES menus).
   Pro: minimal doc churn, preserves the documented zone. Con: requires
   re-seeding + downstream ordering shifts; dense band means future SALES
   additions need re-spacing.
2. **Update CLAUDE.md + `jarvis-architecture` skill** to extend the SALES NAV
   zone to 150–250 (or split SALES into two bands: NAV 150–198 + FINANCE
   220–250). Pro: matches reality without re-seeding. Con: shrinks the ADMIN
   band, requires moving any colliding ADMIN menus.
3. **Move finance / extra to a dedicated band** (e.g. ADMIN-adjacent
   240–280) and update both code + docs. Pro: clean separation. Con: most
   churn — code, seed, audit log resourceId, and any Sidebar tests.

## Decision needed

A maintainer must pick before either fix. **Do not touch `menus.ts` in the
session that produced this note** — the goal here was to surface the drift.

## References

- Seed: `packages/db/seed/menus.ts:96-103` (sales finance/extra band)
- Seed: `packages/db/seed/menus.ts:106-119` (admin band 200–330)
- Skill: `.claude/skills/jarvis-architecture/SKILL.md` "RBAC 메뉴 트리" section
- Project guide: `CLAUDE.md` 변경 이력 (RBAC 메뉴 트리 도입 2026-04-30)
