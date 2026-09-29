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
| `/blog-draft` | Brief → draft in the site's language, voice and frontmatter shape, with title/meta variants, `[VERIFY]` markers on every claim to check, and a reviewer checklist for the content team. Scores the draft against the term plan. Never publishes. |

### Term plan (NeuronWriter-style, DataForSEO)
`term_plan` takes the live Google top-10 for a keyword, parses each ranking page's main content (menus, footers
and sidebars excluded), and returns what they have in common: target length and H2/H3 count, the 1–3-word terms
most of them use with a "use N–M times" range scaled to that length, the terms they put in headings, the
People-also-ask questions and every competitor's heading outline. With `draftFile` it also scores a markdown draft
0–100 and lists missing and overused terms. `savePlan` stores the plan next to the brief; `planFile` scores later
drafts against that saved plan for free, so revisions are compared against the same competitors (the live top 10 shifts
between runs). Directory and social sites are skipped and positions 11–20 fill in for them. Inflected forms are merged by a light suffix stemmer (Polish, English,
German), so "cateringu dietetycznego" counts as "catering dietetyczny". Cost: ~$0.004–0.02 per keyword.

## Your keys stay yours

Every user configures **their own** credentials; nothing is shared through the plugin or the repo.

| What | Where it lives |
|---|---|
| Google service-account key — **one per client** | JSON file on your disk, outside any repo (e.g. `~/.config/<client>/sa.json`). The client repo's `.seo-content.json` stores only its **path** (`googleKeyFile`). An optional default key can be set in the plugin settings. |
| DataForSEO login / password (optional) | Plugin settings; the password is `sensitive` → your OS keychain. |
| Site IDs, brand terms, tone of voice | `<repo>/.seo-content.json` — committed, shared by the team, **no secrets**. |

Credentials reach only the bundled MCP server's environment — they are never put into prompts or skill text.

## Setup (once per person, ~10 min)

1. Install:
   ```text
   /plugin marketplace add kkuklewski/claude-plugins
   /plugin install seo-content@kkuklewski
   ```
2. Per client: Google Cloud console → the client's (or your) project → enable **Google Search Console API** (and **Google Analytics Data API**
   for GA4) → IAM → Service accounts → create → Keys → Add key → JSON. Save it e.g. as
   `~/.config/<client>/sa.json` and `chmod 600` it. Already have a key for that client (e.g. for GA)? Reuse it.
3. Add the service account's `client_email` as a user in **Search Console** (Settings → Users and permissions,
   Restricted is enough) and, optionally, **GA4** (Admin → Property access management, Viewer).
4. Optional: `/plugin configure seo-content@kkuklewski` → DataForSEO login/password for competitor data
   (and a default key file). Restart Claude Code after changing plugin settings.
5. In the client's repo: `/seo-gaps --setup` — finds the key, checks every source, tells you exactly what's
   missing, and writes `.seo-content.json` (with `googleKeyFile`) for the team.

Install scope: **user** (default) — one install works for all clients; each client's key path, property and
tone of voice live in that client's repo, so IDs never mix.

## Requirements
Node ≥ 22. No npm install — the MCP server has zero dependencies.

## Limits
- Search Console only knows queries the site already appears for (last 16 months). Brand-new topics need
  `competitor_gap` (DataForSEO) or your own ideas.
- No backlink data.
- The term plan is a coverage checklist from word statistics, not semantic analysis: expect some generic words
  in the list, and don't write to the numbers.
- Drafts are drafts: facts are marked `[VERIFY]` for the content team, nothing is published automatically.

## Tests
```bash
bash tests/run.sh
```
Offline: opportunity analysis on fixture rows, term plan on fixture pages, MCP handshake, and the setup messages for missing/wrong credentials.
