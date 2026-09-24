---
name: site-audit
description: Pre-launch / regression quality audit of a website (Next.js-first, works on any URL and other frameworks) — SEO, performance & Core Web Vitals, accessibility, responsiveness, semantic HTML, fonts, images, 3rd-party scripts, GDPR. Audits one sample of EVERY page type (from routes + sitemap), not just the home page; runs code scan, HTTP checks, headless multi-page DOM audit and median-of-3 Lighthouse in one command; writes a tracked was→now checklist into the repo and re-checks it later with before/after diffs. Use when the user says "audit this page/site", "check before launch", "QA the site", "is this SEO/a11y ready", "run the site audit again", "recheck the audit", or invokes /site-audit. Usage: /site-audit [url] [--repo <path>] [--pages types|single|all|N] [--quick] [--recheck] [--fix] [--no-save]
---

# Site audit

The checklist ([checklist.md](checklist.md)) is the source of truth for items, IDs and severities.
`$SKILL_DIR` below = the **base directory of this skill** (shown above as "Base directory for this skill") —
works for a plugin install and a copy in `~/.claude/skills/` alike. Scripts are in `$SKILL_DIR/scripts/`.
Requires Node ≥ 22, Chrome/Chromium (or `CHROME_PATH`), ripgrep; Lighthouse runs via `npx`. No npm install.

## Arguments
| Arg | Meaning |
|---|---|
| `url` | Site to audit. Omitted → resolve (step 0). |
| `--repo <path>` | Project root. Default: cwd if it has a `package.json`. No repo → skip code scan, discover pages from sitemap only. |
| `--pages` | `types` (default: one URL per route template, capped by `maxPages`), `single`, `all` (every sitemap URL), or a number. |
| `--quick` | `--pages single`, no Lighthouse, no interactive browser pass. |
| `--recheck` | Re-audit against the latest tracked doc: fill the **Now** column, add a score row, list fixed/new/open. |
| `--fix` | After the report, fix findings one step per commit (never push). |
| `--no-save` | Don't write the tracked doc into the repo (chat report only). |

## Per-project config — `<repo>/.site-audit.json` (optional)
Template: [templates/site-audit.config.example.json](templates/site-audit.config.example.json).
Keys: `reportDir` (default `docs/audit`), `localUrl` / `launchConfig` (production server to audit),
`sourceDirs`, `ignorePaths` (legacy/export folders the code scan must skip), `privateRoutes`,
`pages` (extra sample URLs, e.g. for dynamic routes missing from the sitemap), `maxPages`, `viewports`,
`accepted` (exceptions: `{id, match, reason, until?}` — shown as ✓ accepted, never re-flagged).
When the user says a finding is intentional ("leave it", "that's on purpose", "client decides"),
add it to `accepted` (create the file if needed) instead of just remembering it in chat.

## Workflow

### 0. Resolve the target (don't ask if you can find it)
1. `url` given → use it. Else `.site-audit.json` `localUrl`, else a production-ish config in
   `<repo>/.claude/launch.json` (name/args containing `prod`/`start`) → `preview_start` by name,
   else a listening server (`lsof -iTCP -sTCP:LISTEN -nP | grep node`), else ask.
2. **Never trust perf numbers from `next dev`.** `run-all.sh` warns when it detects a dev build.
   Then use the deployed URL, or a production server from launch.json; only if neither exists,
   ask before running `next build && next start -p <free port>` (a build can clobber a running dev server's `.next`).
3. `--recheck`: find the newest `<reportDir>/site-audit-*.md` + matching `.json`; audit the same URL/scope.

### 1. Run every automated phase in ONE call
```bash
bash "$SKILL_DIR/scripts/run-all.sh" <url> --repo <repo> [--pages types] [--runs 3] [--baseline auto]
```
(`--quick` → `--pages single --no-lh`; `--recheck` → `--baseline auto` or the json path.) Takes ~1–4 min;
run it in the background and do step 2 meanwhile. It prints an index; then **read the text outputs,
not the raw JSON**:
- `pages.md` — issues aggregated across all page types × viewports (a layout bug appears once, with the pages it hits), per-page weight table.
- `lh-mobile.txt`, `lh-desktop.txt` — median-of-N scores with spread, metrics, LCP element, failing audits **with the elements behind them**.
- `http.txt` — robots, sitemap, indexing, HTML weight (raw/gzip/inline CSS/RSC payload), caching, minification, 404, security headers.
- `code-scan.txt` — source-only static leads (private routes and ignored paths already excluded).
- `compare.md` — before/after, when a baseline exists.
- `pages.json` `notes` — e.g. dynamic routes with no sample URL → tell the user / add to `pages`.

### 2. Interactive browser pass (built-in browser; skip with --quick)
Only what scripts can't judge — on the home page (shared layout) plus any template with menus/dialogs:
- **Keyboard:** Tab ×15 reading `document.activeElement.outerHTML.slice(0,120)`; first stop = skip link;
  focus ring visible (zoom screenshot); dropdowns: Enter/Space opens, Esc closes and returns focus, closed items not tabbable;
  modals: focus moves in, is trapped, returns on close.
- **Visual sweep** at 320 / 768 / 1440 (+1920 for wide layouts) on templates where `pages.md` shows overflow or
  small targets, else home + one content template. Before any screenshot: `scrollIntoView` the area and wait ~1 s —
  lazy images paint late (a blank box is usually timing, not a bug). Reset with `resize_window preset: desktop`.
- **200 % text:** `document.documentElement.style.fontSize='200%'` → screenshot → nothing clipped → reset.
- Pitfall: with `srcset`, `img.naturalWidth` is density-scaled — judge served size from `?w=` / the network, not naturalWidth.

### 3. Verify before you report
- Code-scan hits are leads: open the file before calling it a failure.
- For the biggest perf problem, find the cause, not just the metric: HTML weight in `http.txt`, LCP element,
  request mix in `pages.md`; check recent config commits (`git log -p -5 -- next.config.*`) for regressions.
- Next.js version matters (`code-scan.txt` prints it: 16+ → `<Image preload>`, `proxy.ts`). Unsure about an API → Context7 `/vercel/next.js`.
- Rank fixes by payoff with [references/what-moves-the-score.md](references/what-moves-the-score.md) (measured wins, dead ends, known false positives).
- Contrast rows carry a suggested passing colour (`→ try #xxxxxx`); brand colours usually need the client's OK → mark ⏸.

### 4. Report
**Chat:** verdict line `❌ C · ⚠️ I · ℹ️ M · ✅ passed · ✓ accepted`, LH mobile/desktop scores, then one table per
checklist group (failures first): `Status | # | Item | Sev | Pages | Evidence | Fix (file:line)`, then **Top 5 to fix first** (impact ÷ effort).
Status: ✅ pass · ❌ fail · ⚠️ partial/heuristic · 👁 manual check needed (say what to look at) · ✓ accepted · — n/a.
Never ✅ something you didn't check.

**Tracked doc (default when a repo exists; skip with `--no-save`):** write `<reportDir>/site-audit-<YYYY-MM-DD>.md` from
[templates/report.md](templates/report.md) and copy the run's `summary.json` next to it as `site-audit-<YYYY-MM-DD>.json`.
This doc is **the only plan** — don't create a second copy in `~/.claude/plans` or elsewhere; if plan mode needs a
plan, point it at this file. Don't commit unless asked (or in `--fix`).

**`--recheck`:** update the existing doc in place: Now column (✅ / ◐ / ☐ / 🆕 regression), new row in Scores,
tick finished steps, append new findings; save the new json as the next baseline. Show `compare.md` highlights in chat.

### 5. `--fix` (or when the user asks to work through the steps)
One step per commit, in doc order: change → verify (typecheck/lint/build + re-run the relevant check, e.g.
`multi-page.mjs <url> --viewports 375`) → tick the step and the rows' Now column in the doc → commit. Don't push.
Don't stop to ask between steps unless a step needs a decision only the user/client can make — mark it ⏸ and continue.

## Script reference (for partial re-runs)
Run as `bash "$SKILL_DIR/scripts/<script>"` / `node "$SKILL_DIR/scripts/<script>"`.

| Script | Use |
|---|---|
| `run-all.sh <url> [...]` | everything above |
| `pages.mjs <url> [--repo] [--mode]` | page-type discovery → JSON |
| `multi-page.mjs <pages.json\|url...> [--repo] [--viewports] [--out]` | headless DOM audit + aggregation |
| `lighthouse.sh <url> mobile\|desktop [--runs N] [--out]` | median Lighthouse + summary |
| `http-checks.sh <url>` · `code-scan.sh <repo>` | single phases |
| `compare.mjs <old.json> <new.json>` | before/after markdown |
| `dom-audit.js` | same audit for the in-app browser: paste the whole file into `javascript_tool` |

## Rules
- Read-only on the project unless `--fix` or the user asks; the tracked doc + `.site-audit.json` are the only files written by default.
- Only audit sites the user owns/works on; keep Lighthouse runs on third-party sites to a minimum.
- Headings, landmarks and skip links come from shared layouts *and* per-template components — judge them per page type, which `pages.md` already does.
