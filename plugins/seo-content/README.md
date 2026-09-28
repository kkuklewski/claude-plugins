# seo-content

Turn a site's own Google Search Console data into content opportunities and review-ready blog drafts —
without a Semrush/Ahrefs subscription. Search Console + GA4 are free; competitor gaps, search volume and
SERP snapshots are optional via pay-as-you-go [DataForSEO](https://dataforseo.com) (typically a few $/month).

```text
/seo-gaps [--setup] [--days 90] [--competitors a.com,b.com] [--briefs N] [--refresh-only]
/blog-draft <brief.md | topic> [--format md|mdx] [--out <path>]
```

| Skill | Does |
|---|---|
| `/seo-gaps` | Finds striking-distance queries (pos 4.5–20), weak snippets, cannibalisation, content gaps (impressions but no page in the top 20, questions first), decaying pages; optional competitor gaps. Writes a dated report + one brief per new-post opportunity. |
| `/blog-draft` | Brief → draft in the site's language, voice and frontmatter shape, with title/meta variants, `[VERIFY]` markers on every claim to check, and a reviewer checklist for the content team. Never publishes. |

## Your keys stay yours

Every user configures **their own** credentials; nothing is shared through the plugin or the repo.

| What | Where it lives |
|---|---|
| Google service-account key (JSON file) | On your disk, outside any repo. The plugin only stores its **path**. |
| DataForSEO login / password (optional) | Plugin settings; the password is `sensitive` → your OS keychain. |
| Site IDs, brand terms, tone of voice | `<repo>/.seo-content.json` — committed, shared by the team, **no secrets**. |

Credentials reach only the bundled MCP server's environment — they are never put into prompts or skill text.

## Setup (once per person, ~10 min)

1. Install:
   ```text
   /plugin marketplace add kkuklewski/claude-plugins
   /plugin install seo-content@kkuklewski
   ```
2. Google Cloud console → your project → enable **Google Search Console API** (and **Google Analytics Data API**
   for GA4) → IAM → Service accounts → create → Keys → Add key → JSON. Save it e.g. as
   `~/.config/seo-content/<site>.json` and `chmod 600` it.
3. Add the service account's `client_email` as a user in **Search Console** (Settings → Users and permissions,
   Restricted is enough) and, optionally, **GA4** (Admin → Property access management, Viewer).
4. `/plugin configure seo-content@kkuklewski` → key-file path (+ DataForSEO login/password if you want
   competitor data). Restart Claude Code.
5. In the site's repo: `/seo-gaps --setup` — checks every source, tells you exactly what's missing, and writes
   `.seo-content.json` for the team.

Install scope: **user** (default) — one install works for all your sites; per-site settings live in each repo.

## Requirements
Node ≥ 22. No npm install — the MCP server has zero dependencies.

## Limits
- Search Console only knows queries the site already appears for (last 16 months). Brand-new topics need
  `competitor_gap` (DataForSEO) or your own ideas.
- No backlink data.
- Drafts are drafts: facts are marked `[VERIFY]` for the content team, nothing is published automatically.

## Tests
```bash
bash tests/run.sh
```
Offline: opportunity analysis on fixture rows, MCP handshake, and the setup messages for missing/wrong credentials.
