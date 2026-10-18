# Changelog

## site-audit 0.2.3 — 2026-10-18
- Works outside the desktop app: the interactive browser pass (step 2) is skipped when the built-in browser tools aren't available, and its rows are reported as manual checks instead of being improvised; `preview_start` has a terminal fallback.
- Shorter skill description (the usage line moved into the body) so it stays well under the loader's 1024-character limit.

## seo-content 0.6.0 — 2026-10-18
- New tool `ranking_changes`: decay detector for a domain or one page — keywords it lost (DataForSEO Labs "lost" mode) and keywords whose position dropped, each with previous vs current position, 12-month search volume and volume trend, plus new/up/down/lost totals. `/seo-gaps` uses it for refresh work when DataForSEO is on.
- New tool `keyword_cluster`: grows 1–5 seed keywords into a topic cluster from Keyword Ideas, Related Keywords and Keyword Suggestions, merged into one list that shows which sources found each keyword.
- **Breaking:** paid DataForSEO tools no longer fall back to US/English when no locale is passed — `location_code` and `language_code` are required (from `locale` in `.seo-content.json`; Poland 2616/pl, Germany 2276/de). A German or Polish site queried with US data used to look plausible and be wrong.
- Backlinks wording fixed: the Backlinks API is pay-as-you-go from the balance (~$0.024 per check), not a separate subscription.

## seo-content 0.5.0 — 2026-10-13
- New tool `backlinks_summary`: live backlink totals for a domain or URL (backlinks, referring domains, nofollow share, broken links, rank, spam score, top TLDs/countries) via the DataForSEO Backlinks API. On request only — it is never called by `/seo-gaps` or `/blog-draft`.
- A DataForSEO API that is not active on the account now reports a setup fix instead of a raw error.

## motion-editor 0.1.0 — 2026-10-06
- New plugin: `/motion-editor` builds a local, deterministic motion-graphics editor (Vite + React + Canvas `renderFrame`, timeline/keyframes/easing/presets, undo/redo, Playwright + ffmpeg MP4 export) from a strict, test-verified spec adapted from Nate Parrott's prompt.
- Intake first: asks for resources (logos, fonts, brand) and look references (videos, GIFs, screenshots) by path, samples them into `reference/STYLE.md`, and uses it for the editor's defaults and presets — the app still opens an empty project.

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
