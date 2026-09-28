# Changelog

## seo-content 0.2.0 — 2026-09-28
- Per-client Google keys: `googleKeyFile` in each repo's `.seo-content.json` (a path, never the key) is passed to every Google tool and wins over the plugin's default key, so client IDs and access never mix. The default key in plugin settings is now optional.
- `/seo-gaps --setup` looks for an existing client key under `~/.config/<client>/` before walking through creating one; no restart needed when the key changes.
- Key loading never echoes file content (non-JSON files, wrong key types) and only accepts `.json` paths.

## seo-content 0.1.0 — 2026-09-28
- New plugin: `/seo-gaps` (Search Console → ranked opportunities → content briefs) and `/blog-draft` (brief → review-ready draft with `[VERIFY]` markers and a reviewer checklist).
- Bundled zero-dependency MCP server: Search Console, GA4 Data API, optional DataForSEO (competitor gaps, volume, SERP snapshot).
- Per-user credentials via plugin `userConfig` (DataForSEO password in the OS keychain; Google key stays a local file); per-site settings in a committed `.seo-content.json` without secrets.
- `setup_check` explains exactly what's missing (API not enabled, service account not added to the property, wrong key type).

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
