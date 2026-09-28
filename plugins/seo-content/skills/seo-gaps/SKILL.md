---
name: seo-gaps
description: Find content opportunities from a site's own Google Search Console data — striking-distance queries (pos 4.5–20), weak snippets, cannibalisation, content gaps (impressions but no page in the top 20), decaying pages — optionally add competitor gaps and search volume (DataForSEO), then write one content brief per opportunity for /blog-draft. Each user brings their own Google key; nothing is shared. Use when the user says "what should we write about", "SEO content gaps", "blog ideas from Search Console", "why is traffic dropping", "which pages to refresh", "set up seo-content", or invokes /seo-gaps. Usage: /seo-gaps [--setup] [--days 90] [--competitors a.com,b.com] [--briefs N] [--refresh-only]
---

# SEO gaps → content briefs

Data comes from the plugin's **seo-content MCP server** (tools `setup_check`, `gsc_opportunities`, `gsc_query`,
`ga4_landing_pages`, `competitor_gap`, `keyword_volume`, `serp_snapshot`). Credentials are per user:
the Google service-account key file path and optional DataForSEO login/password are set with
`/plugin configure seo-content@kkuklewski` and live on that user's machine (password in the OS keychain).
**Never ask for, print, or write a key, password or key-file contents** — not in chat, not in the repo.

## Arguments
| Arg | Meaning |
|---|---|
| `--setup` | Only run the setup flow (step 0) and stop. |
| `--days N` | Analysis window, default 90 (the previous N days are used for decay). |
| `--competitors a,b` | Override `competitors` from config for this run (paid, DataForSEO). |
| `--briefs N` | How many briefs to write, default 5. `0` = report only. |
| `--refresh-only` | Only existing-page work (striking distance, low CTR, decay, cannibalisation) — no new posts. |

## Per-project config — `<repo>/.seo-content.json` (committed, no secrets)
Template: [../../templates/seo-content.config.example.json](../../templates/seo-content.config.example.json).
Holds site IDs and editorial settings shared by the team: `siteUrl` (Search Console property), `siteOrigin`,
`ga4PropertyId` (optional), `country` (ISO alpha-3, optional), `locale` (DataForSEO location/language codes),
`brandTerms`, `competitors`, `minImpressions`, `outputDir` (default `docs/seo`), `blog.*` (language, audience,
voice, wordCount, cta, avoidTopics, reviewers). No repo → keep the config in the chat and skip saving files.

## Workflow

### 0. Preflight — every run (the whole run for `--setup`)
1. Read `.seo-content.json`. Missing → step 0.3.
2. Call `setup_check` with `siteUrl` and `ga4PropertyId` from config. The seo-content tools aren't available at
   all → the plugin's MCP server didn't start: tell the user to run `/plugin configure seo-content@kkuklewski`,
   then restart Claude Code. Otherwise act on each source:
   - `google: missing` → stop and walk the user through it, in their language:
     a) Google Cloud console → create/select **their own** project → enable **Google Search Console API**
        (and **Google Analytics Data API** for GA4);
     b) IAM → Service accounts → create one (no roles needed) → Keys → Add key → JSON → save it outside any
        git repo, e.g. `~/.config/seo-content/<site>.json`, then `chmod 600` it;
     c) `/plugin configure seo-content@kkuklewski` → paste the **path** (never the contents);
     d) restart Claude Code (the MCP server reads settings at start) → `/seo-gaps --setup` again.
   - `searchConsole: missing` → show the `fix` (add the service-account email as a user on the property —
     Restricted is enough). If `sites` is non-empty, offer those properties as choices.
   - `ga4: missing` → show the fix, continue without GA4. `ga4: off` → mention once, continue.
   - `dataforseo: off` → one line: competitor gaps / volumes / SERP snapshots are off; continue.
3. No config yet: take `sites` from `setup_check` and ask (AskUserQuestion) which property; then ask only what
   can't be inferred — brand terms (suggest from the domain), blog language, audience, voice, optional GA4 ID,
   optional competitors. Infer `siteOrigin` from the property and `locale` from language/country
   (Poland 2616/`pl`, Germany 2276/`de`, UK 2826/`en`, US 2840/`en`). Write `.seo-content.json`
   and tell the user to commit it — it holds IDs, not secrets.
4. `--setup` → print a status table (source → ok / off / missing → next step) and stop.

### 1. Pull and rank
- `gsc_opportunities` with `siteUrl`, `days`, `minImpressions`, `brandTerms`, `country`.
  Small site (summary.impressions < 1000 or every list empty) → retry once with `minImpressions: 10` and say so.
- GA4 configured → `ga4_landing_pages`; prefer topics near pages that convert (`keyEvents`), deprioritise refresh
  work on pages nobody engages with.
- Competitors configured (or `--competitors`) and DataForSEO on → **state the estimated cost first**
  (~$0.01–0.05 per competitor), then `competitor_gap`. DataForSEO off → skip (preflight already said so).
- Existing content: fetch `<siteOrigin>/sitemap.xml` (follow nested sitemaps, cap 500 URLs) to know which posts
  exist. For an opportunity that points at an existing URL, read that page's title/H1/H2s before choosing
  "refresh" vs "new post" — never propose a post that duplicates an existing one.

### 2. Decide — one action per opportunity
| Signal | Action |
|---|---|
| `contentGaps` (esp. `question: true`); `competitor_gap` rows with ≥ 2 competitors | **New post** |
| `strikingDistance` on a thin or off-topic page | **New post** or **new section**, judged from the page's headings |
| `strikingDistance` on a matching page | **Refresh**: missing subtopics, FAQ, internal links |
| `lowCtr` | **Snippet rewrite**: title + meta description, 2 variants |
| `cannibalisation` | **Consolidate**: pick the canonical page; merge + redirect, or de-optimise the other |
| `decay` | **Refresh** — `gsc_query` with `pageContains` shows which queries were lost |

Cluster same-intent queries (plurals, word order, synonyms) into one opportunity before ranking. Drop anything
in `blog.avoidTopics`. With `--refresh-only`, skip New post rows. Rank by potential clicks × business fit
(GA4 conversions, `blog.cta`).

### 3. Write the report and briefs
Into `<outputDir>/` (create it):
- `seo-gaps-YYYY-MM-DD.md` — headline numbers, one table per action type (query / page / impressions / position /
  why / action), then which data sources were used and which were off.
- `briefs/<slug>.md` — for the top `--briefs N` New post / new section items, from
  [../../templates/brief.md](../../templates/brief.md). DataForSEO on → `serp_snapshot` for the primary keyword
  (~$0.002 each) fills "What ranks now" and People-also-ask; off → write `not checked — DataForSEO off` there
  and build the outline from the site's own query cluster.

End with the next command: `/blog-draft <outputDir>/briefs/<slug>.md`.

## Rules
- Every number comes from tool output — never invent volumes, positions or traffic. The CTR curve only ranks
  opportunities; call estimates estimates.
- Paid calls (DataForSEO) only when the user configured it, with the cost stated before the call.
- Search Console only knows queries the site already appears for; when the gap list is short, say so and suggest
  `competitor_gap` rather than guessing keywords.
- Secrets stay in the MCP server's env: never echo env vars, read the key file, or write credentials into
  `.seo-content.json`, reports or commits.
- Don't commit or publish; the user reviews the report and briefs first.
