# seo-content

Turn a site's own Google Search Console data into content opportunities and review-ready blog drafts —
without a Semrush/Ahrefs subscription. Search Console + GA4 are free; competitor gaps, search volume, keyword
clusters, decay data and SERP snapshots are optional via pay-as-you-go [DataForSEO](https://dataforseo.com)
(typically a few $/month).

```text
/seo-gaps [--setup] [--days 90] [--competitors a.com,b.com] [--briefs N] [--refresh-only]
/blog-draft <brief.md | topic> [--format md|mdx] [--out <path>]
```

| Skill | Does |
|---|---|
| `/seo-gaps` | Finds striking-distance queries (pos 4.5–20), weak snippets, cannibalisation, content gaps (impressions but no page in the top 20, questions first), decaying pages; optional competitor gaps. Writes a dated report + one brief per new-post opportunity. |
| `/blog-draft` | Brief → draft in the site's language, voice and frontmatter shape, with title/meta variants, `[VERIFY]` markers on every claim to check, and a reviewer checklist for the content team. Scores the draft against the term plan. Never publishes. |

## Quick start

| | Step | Time | Needed? |
|---|---|---|---|
| 1 | [Install the plugin](#1-install) | 1 min | yes |
| 2 | [Create a Google key for the site](#2-google-key-free) | 5–10 min | yes |
| 3 | [Add your DataForSEO API key](#3-dataforseo-api-key-optional-paid) | 5 min | optional |
| 4 | [Run `/seo-gaps --setup` in the site's repo](#4-first-run) | 2 min | yes |

Without step 3 everything based on Search Console and GA4 works; only the paid extras are off.

**You need:** [Claude Code](https://code.claude.com), Node ≥ 22 (`node -v`), access to the site's Search Console
property. No npm install — the MCP server has zero dependencies.

### 1. Install

In Claude Code:

```text
/plugin marketplace add kkuklewski/claude-plugins
/plugin install seo-content@kkuklewski
```

Then restart Claude Code (on the desktop app: fully quit with Cmd+Q, closing the window is not enough).
User scope (the default) is right: one install serves every client; each client's settings live in that client's repo.

### 2. Google key (free)

One service-account key per client. Already have one for that client (e.g. for GA)? Reuse it and skip to c.

1. [Google Cloud console](https://console.cloud.google.com/) → create or pick a project → **APIs & Services →
   Library** → enable **Google Search Console API** (and **Google Analytics Data API** if you want GA4 data).
2. **IAM & Admin → Service accounts → Create service account** (any name, no roles needed) → open it →
   **Keys → Add key → Create new key → JSON**. A `.json` file downloads.
3. Move it out of Downloads, outside any git repo, and lock it down:
   ```bash
   mkdir -p ~/.config/my-client && mv ~/Downloads/*.json ~/.config/my-client/sa.json && chmod 600 ~/.config/my-client/sa.json
   ```
4. Open the file once and copy the `client_email` value (looks like `name@project.iam.gserviceaccount.com`).
   Add that email as a user in **Search Console → Settings → Users and permissions** (Restricted is enough) and,
   for GA4, in **Admin → Property access management** (Viewer).

You don't paste the key anywhere: `/seo-gaps --setup` finds it under `~/.config/` and stores only its **path** in
the repo's `.seo-content.json`.

### 3. DataForSEO API key (optional, paid)

Enables `competitor_gap`, `keyword_volume`, `keyword_cluster`, `ranking_changes`, `serp_snapshot`, `term_plan` and
`backlinks_summary`.

1. Sign up at [app.dataforseo.com/register](https://app.dataforseo.com/register) and confirm your e-mail.
   New accounts get $1 of trial credit; to keep going, top up once (minimum $50, the balance never expires —
   everything is pay-as-you-go, no subscription).
2. Open [app.dataforseo.com/api-access](https://app.dataforseo.com/api-access). You need two values:
   - **API login** — your account e-mail;
   - **API password** — the generated one shown on that page. **Not** the password you log in to the website with.
3. Save them in the plugin — pick one:
   - **In Claude Code (easiest):** run `/plugin`, open **seo-content → Configure**, fill in *DataForSEO API login*
     and *DataForSEO API password*.
   - **In a terminal:** paste the API password when the cursor waits (nothing is shown), then press Enter:
     ```bash
     read -rs DFS_PW && printf '{"dataforseo_login":"you@example.com","dataforseo_password":"%s"}' "$DFS_PW" | claude plugin configure seo-content@kkuklewski --values-stdin; unset DFS_PW
     ```
     Replace `you@example.com` with your API login. `claude plugin configure seo-content@kkuklewski` shows which
     options are set.
4. Restart Claude Code. The plugin reads its settings once, at start.

The password is marked sensitive, so it goes to your OS keychain, not into a file.

### 4. First run

Open Claude Code in the client's repo (or any folder for that site) and run:

```text
/seo-gaps --setup
```

It finds the Google key, checks Search Console, GA4 and DataForSEO, tells you exactly what's missing, asks a few
questions (property, brand terms, blog language and voice) and writes `.seo-content.json`. Commit that file —
it holds IDs and settings, **no secrets**, so the whole team shares it. Then run `/seo-gaps`.

## Updating

```text
/plugin marketplace update kkuklewski
/plugin update seo-content@kkuklewski
```

Restart Claude Code afterwards. From a terminal: `claude plugin marketplace update kkuklewski && claude plugin update seo-content@kkuklewski`.
What changed is in the [changelog](../../CHANGELOG.md).

## Troubleshooting

| Message | Fix |
|---|---|
| The seo-content tools don't exist in Claude Code | Plugin not loaded: check `/plugin` shows it enabled, then fully restart Claude Code. |
| `google: missing` … not a service-account key | You downloaded an OAuth client file. Create a key under **Service accounts → Keys** (step 2). |
| `searchConsole: missing` … has no access | Add the key's `client_email` as a user on that Search Console property. |
| … is not enabled in your Google Cloud project | Enable that API in the same Cloud project as the key, wait a minute, retry. |
| Google rejected the service-account key | The key was deleted or disabled — create a new key for the same service account. |
| `No Google service-account key configured` | Run `/seo-gaps --setup` (it looks under `~/.config/`) or set `googleKeyFile` in `.seo-content.json`. |
| `SETUP NEEDED: DataForSEO is not configured` | Step 3, then restart. |
| `DataForSEO rejected the login/password` | You used the website password; take the API password from app.dataforseo.com/api-access. |
| `DataForSEO balance is empty` | Top up at app.dataforseo.com. |
| `DataForSEO account is not verified` | Finish verification at app.dataforseo.com. |
| `location_code and language_code are required` | Add `locale` to `.seo-content.json` (see below) — the plugin never guesses a country. |

## Per-site settings — `.seo-content.json`

Template: [templates/seo-content.config.example.json](templates/seo-content.config.example.json). `/seo-gaps --setup`
writes it for you; the fields worth knowing:

| Field | Example | Meaning |
|---|---|---|
| `siteUrl` | `sc-domain:example.com` | Search Console property |
| `googleKeyFile` | `~/.config/my-client/sa.json` | **Path** to the key — keep it under `~/` so it works on every teammate's machine |
| `locale` | `{ "location_code": 2276, "language_code": "de" }` | Market for DataForSEO: Poland 2616/`pl`, Germany 2276/`de`, UK 2826/`en`, US 2840/`en` ([all codes](https://docs.dataforseo.com/v3/dataforseo_labs/locations_and_languages/)) |
| `brandTerms` | `["example"]` | Queries containing these are left out |
| `competitors` | `["rival.com"]` | Used by `competitor_gap` (paid) |
| `blog.*` | language, audience, voice, wordCount, cta | How `/blog-draft` writes |

## Your keys stay yours

Every user configures **their own** credentials; nothing is shared through the plugin or the repo.

| What | Where it lives |
|---|---|
| Google service-account key — **one per client** | JSON file on your disk, outside any repo. The client repo's `.seo-content.json` stores only its **path**. An optional default key can be set in the plugin settings. |
| DataForSEO login / password (optional) | Plugin settings; the password is `sensitive` → your OS keychain. |
| Site IDs, brand terms, tone of voice | `<repo>/.seo-content.json` — committed, shared by the team, **no secrets**. |

Credentials reach only the bundled MCP server's environment — they are never put into prompts or skill text.

**Before you give it credentials, you can check what it does.** The server is two short files with no
dependencies: [server/mcp.mjs](server/mcp.mjs) (the tools) and [server/lib.mjs](server/lib.mjs) (the HTTP calls).
It talks to exactly three hosts — `oauth2.googleapis.com`/`www.googleapis.com` (Search Console),
`analyticsdata.googleapis.com` (GA4) and `api.dataforseo.com` — reads only the key file you point it at, and writes
files only where a tool is told to (`savePlan`). Google access is read-only (`webmasters.readonly`,
`analytics.readonly`).

## What the paid tools cost

All DataForSEO calls state their cost before running and report `costUsd` after.

| Tool | Does | ~Cost |
|---|---|---|
| `competitor_gap` | Keywords competitors rank top-20 for and you don't | $0.01–0.05 per competitor |
| `keyword_volume` | Volume, CPC, difficulty, intent for up to 700 keywords | ~$0.01–0.1 |
| `keyword_cluster` | Seed → topic cluster from Keyword Ideas, Related Keywords and Keyword Suggestions, with which sources found each keyword | ~$0.05 per seed |
| `ranking_changes` | Decay: keywords a domain/page **lost** or **dropped** on, with previous position, 12-month volume and trend — tells a ranking loss from falling demand | ~$0.03–0.05 per target |
| `serp_snapshot` | Live Google top-10, featured snippet, People-also-ask | ~$0.002 |
| `term_plan` | NeuronWriter-style term plan from the top-10 (below) | $0.004–0.02 per keyword |
| `backlinks_summary` | Backlink totals for a domain/URL — **on request only** | ~$0.024 |

### Term plan
`term_plan` takes the live Google top-10 for a keyword, parses each ranking page's main content (menus, footers
and sidebars excluded), and returns what they have in common: target length and H2/H3 count, the 1–3-word terms
most of them use with a "use N–M times" range scaled to that length, the terms they put in headings, the
People-also-ask questions and every competitor's heading outline. With `draftFile` it also scores a markdown draft
0–100 and lists missing and overused terms. `savePlan` stores the plan next to the brief; `planFile` scores later
drafts against that saved plan for free, so revisions are compared against the same competitors (the live top 10
shifts between runs). Directory and social sites are skipped and positions 11–20 fill in for them. Inflected forms
are merged by a light suffix stemmer (Polish, English, German), so "cateringu dietetycznego" counts as
"catering dietetyczny".

## Limits
- Search Console only knows queries the site already appears for (last 16 months). Brand-new topics need
  `competitor_gap` / `keyword_cluster` (DataForSEO) or your own ideas.
- Smaller markets have less long-tail data in DataForSEO (Polish ≈ 3M keywords with live rankings, German ≈ 28M,
  US ≈ 200M): head and mid-tail commercial queries are well covered, very niche topics less so.
- The term plan is a coverage checklist from word statistics, not semantic analysis: expect some generic words
  in the list, and don't write to the numbers.
- Drafts are drafts: facts are marked `[VERIFY]` for the content team, nothing is published automatically.

## Tests
```bash
bash tests/run.sh
```
Offline, no credentials: opportunity analysis on fixture rows, term plan on fixture pages, DataForSEO request bodies
and response mapping against a stubbed fetch, MCP handshake, the setup messages for missing/wrong credentials, and
the locale guard.
