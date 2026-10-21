# Changelog

## simple-brain-kit 0.2.0 — 2026-10-20
- **Architecture: core plus swappable adapters.** A "How the pieces fit" section with one diagram at the top of the skill and the README, and `references/architecture.md` with the contracts. The core is the Markdown vault in git and one MCP gateway with a read connector and an append-only capture connector; the task tracker, vector store, notifications and web discovery are adapters the owner picks at setup (the skill asks which ones they use). Replacing an adapter never changes the vault format or the decisions.
- **Capture kind `review`** (`target` + `verdict` read|reject). The read connector flags the note at once (`read`, plus `vetoed` for a reject) and `recent` hides it unless `include_read` is set. The curate playbook applies reviews before the veto check: `owner_read`, the veto fields on raw items, `rag_dismissed` on captures, withdrawal of a topic page whose sources are all vetoed. Per-item cards skip notes with `owner_read`.
- **Capture kind `task`** (title line up to 150 characters, 1000 in all). New host job `brain-jobs/capture_tasks.py` turns each one into a tracker task and writes `tracker_task` back, so a rerun never duplicates; a crash between create and write-back is recovered from a marker in the task description. Tracker adapters: Vikunja as the worked example, Jira, Linear and GitHub Issues as stubs with their endpoints.
- **Provenance and dismiss.** The capture tool description and decision 0004 say that `thought` is the owner's words only and anything the agent found or worked out is `talk_summary` (`written_by: ai`, with a banner). New `dismiss_reason` sets `rag_dismissed` for captures that aren't knowledge, such as a shopping list.
- **Counts-only morning summary in code**: `brain-jobs/morning_summary.py` with notification adapters (stdout, Telegram, Slack, email); new tasks and waiting tasks are counted, titles never sent.
- **Nightly health trend**: `brain-jobs/brain_health.py`, read-only, standard library, no model. One JSON line per day (flow, structure, trust; a rerun replaces the day), a priorities-page reminder past a threshold (never writes the page), and an index-drift check through a new index adapter interface (`none`, PostgREST/Supabase-pgvector, or your own `module:factory`) that uses the indexer's own corpus code; files changed after the last index run are pending, not drift, and an unreachable store is "not checked". Item lists stay in a report on the host; the morning summary gets one counts-only line with the weekly change, or "no measurement today". Folders, thresholds and the priorities path come from the jobs config. Systemd timer and cron examples. `brain_core.corpus`/`doc_chunks` now define the chunking once for the vector index and the check. The vault template gets an owner-only `topics/priorities.md`.
- **Vector store adapter**: `BRAIN_VECTOR_URL` plugs an external store (Supabase/pgvector example) into the same RRF fusion.
- **Model-call privacy** in `references/setup.md`: one API key and title header per app, region and zero data retention enforced per request with a router, a live test after any model switch. Gotchas now cite lessons 23–34 of simple-brain-assess.
- Tests for the review and task kinds, provenance, the dismiss flag, task dedupe and crash recovery, explicit-path commits, the counts-only summary, and the health measurement (fixture vault with known counts, fake index adapter for drift vs pending).

## simple-brain-kit 0.1.0 — 2026-10-20
- New plugin `/simple-brain-kit`: sets up a working simple brain for a person or company, with their consent and on their own infrastructure. It is the build step that `simple-brain-assess` recommends.
- Vault skeleton with lanes (raw, transcripts, captures, topics, decisions, ops), `AGENTS.md`/`CLAUDE.md` with write boundaries, and five decision records that all start as `status: proposed`: AI curation with a veto, a perspective tier, verification with verbatim quotes, append-only Brain Capture, discovery.
- Nightly playbooks with shared run rules (single context, one commit per run, never force-push, never stage dirty files, an aborting guard, query hygiene): curate and translate, verify and resolve, inspire (captured links first), and a counts-only morning summary.
- brain-mcp template (Python, official MCP SDK): read-only tools plus an optional capture endpoint at its own secret path with an `x-api-key` key. Capture writes new files only (O_EXCL), max 4 KB and 20 per day, strips control and bidi characters, JSON-quotes frontmatter, and checks the decision's `status: active` on every request. Optional hybrid search (BM25 + vectors, RRF k=60), Docker Compose with a read-only vault mount, non-rotating secrets script, host sync script, tests.
- Setup guide: cloud routines or cron, health checks from simple-brain-assess, gotchas, and a staged rollout from skeleton to discovery.

## simple-brain-assess 0.1.1 — 2026-10-20
- New step 5, "Prove the work: the last 7 nights". For every scheduled job it checks whether the job ran, whether it finished (it reads the log; a green status only means the session ended), what it produced per night, whether a night only did preparation and no real output, and whether anyone saw the result. The report has a matching table, and the health model a new target: real output on at least 5 of 7 nights.
- Lesson 16: a green run is not proof of work.

## ladder-adoption — deprecated 2026-10-20
- Marked deprecated in this catalog in favour of `simple-brain-assess`. It stays listed, so existing installs keep working, and gets no new features. Its repository is unchanged.

## simple-brain-assess 0.1.0 — 2026-10-20
- New plugin `/simple-brain-assess`: read-only assessment of an AI second brain, personal or company-wide, against a working simple-brain model, where AI curates within written bounds, claims carry evidence and the owner keeps a veto instead of approving every item.
- It maps the lanes and the decision flow and names the human bottleneck, such as approval gates with growing queues or digests nobody reads. It measures health in four areas (flow, structure, trust, ownership) with a bundled read-only `measure.py`, scores each lane on a 0–5 maturity scale, and proposes one smallest next step, or a staged rollout with `--plan`.
- `--enterprise` adds governance checks for roughly 50 to 500 people: named owners, risk-tiered review, where a human gate stays, permission-aware retrieval, personal and client data, transparency and audit. These are orientation points, not legal advice.
- It ships 15 lessons learned from moving a real vault from a manual gate to AI curation.

## seo-content 0.6.1 — 2026-10-20
- **Fix:** `ranking_changes` stripped `https://` from page targets, and DataForSEO silently answers a page without a scheme with data for the whole domain. Page targets now always carry the scheme (added when missing); a root URL becomes a bare domain.
- `ranking_changes` returns `counts` (total lost/dropped keywords from `total_count`, which DataForSEO computes over the filtered set) instead of the misleading new/up totals, which were taken from the filtered call.
- New opt-in `tests/sandbox.sh`: every request body against the free DataForSEO Sandbox (same validation as production, no charge) plus our filter paths against the Available Filters list. `DATAFORSEO_API_BASE` accepts only `api.` or `sandbox.dataforseo.com`.

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
