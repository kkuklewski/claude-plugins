# Site audit: {{host}}

Tracked checklist — **the only copy**. Re-run with `/site-audit --recheck`; it updates the
**Now** column, the score history, and ticks steps. Raw data for this run: `site-audit-{{date}}.json`.

**Scope:** {{n}} page types × {{viewports}} px — {{page list}}
**Build audited:** {{production URL | local prod build (next start) — never next dev}}

## Scores
| Date | LH mobile P / A / BP / SEO | LH desktop P / A / BP / SEO | LCP (mobile) | ❌ C | ⚠️ I | ℹ️ M |
|---|---|---|---|---|---|---|
| {{date}} (baseline) | | | | | | |

## Findings — was → now
| # | Was | Item | Sev | Pages | Evidence | Fix | Step | Now |
|---|---|---|---|---|---|---|---|---|
| 2.9 | ❌ | Heading levels skipped | C | /services, /pricing | h1 → h3 "Our plans" | `PlanCard.tsx:42` h3 → h2 | 3 | ☐ |

Now: ☐ open · ✅ fixed (verified) · ◐ partial · ✓ accepted (reason) · ⏸ blocked (who)

## Steps (ordered by impact ÷ effort — one commit each)
### [ ] 1. <title> (<severity>, <effort>)
Files: … · Verify: …

## Accepted exceptions
Mirrored in `.site-audit.json` → `accepted`, so re-runs don't re-flag them.
| # | Item | Reason | Until |
|---|---|---|---|
