# Changelog

## site-audit 0.2.2 — 2026-09-25
- Dev-build detection uses script URLs, the dev overlay and `buildId` only (no false "dev build" on production pages).
- Contrast skips text sitting on photos/videos/background images and text that is translucent or animating; waits for finite animations to finish before sampling.
- Visible focus is measured (real Tab keypress, then each control focused and its styles compared) instead of guessed from CSS selectors.
- Fixture tests cover all three.

## site-audit 0.2.1 — 2026-09-24
- New `references/what-moves-the-score.md`: typical before/after ranges from real Next.js sites, ranked fixes, dead ends and known false positives. SKILL.md points to it when verifying findings.

## site-audit 0.2.0 — 2026-09-24
- First public release in this marketplace.
- Audits one sample per page type (routes + sitemap + internal links) at 375/1440 px in headless Chrome (CDP, no npm deps).
- `run-all.sh` runs code scan, HTTP checks, DOM audit and median-of-3 Lighthouse in one command.
- Tracked was→now report in the repo, `--recheck` with before/after diff, `.site-audit.json` config with accepted exceptions.
- HTML-weight checks (inline CSS / RSC payload), contrast fixes with suggested colours, framework fallback for non-Next projects.
