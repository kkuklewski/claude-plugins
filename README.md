# claude-plugins

Kamil Kuklewski's [Claude Code](https://code.claude.com) plugin marketplace: practical skills for
web development, QA and AI-assisted engineering. Each plugin is independent — install only what you need.

## Install

In Claude Code:

```text
/plugin marketplace add kkuklewski/claude-plugins
/plugin install <plugin>@kkuklewski
```

Restart Claude Code afterwards (desktop app: quit with Cmd+Q). Plugins that need API keys explain where to get
them and how to add them in their own README — keys are entered per user via `/plugin` → *plugin* → **Configure**
and stay on your machine (sensitive values in the OS keychain), never in a repo.

## Update

```text
/plugin marketplace update kkuklewski
/plugin update <plugin>@kkuklewski
```

Then restart Claude Code. From a terminal: `claude plugin marketplace update kkuklewski && claude plugin update <plugin>@kkuklewski`.
What changed: [CHANGELOG.md](CHANGELOG.md).

## Plugins

| Plugin | Skill(s) | What it does |
|---|---|---|
| [site-audit](plugins/site-audit) | `/site-audit` | Pre-launch & regression audit of a website: SEO, Core Web Vitals, accessibility, responsiveness, semantic HTML. Audits every page type, writes a tracked was→now checklist into your repo, re-checks it later. Next.js-first, works on any URL. |
| [seo-content](plugins/seo-content) | `/seo-gaps`, `/blog-draft` | Content opportunities from your own Google Search Console data (quick wins, cannibalisation, content gaps, decay; optional competitor gaps, keyword clusters and ranking-loss data via pay-as-you-go DataForSEO) → briefs → review-ready blog drafts for your content team. Each user brings their own keys — [step-by-step setup](plugins/seo-content#quick-start). |
| [motion-editor](plugins/motion-editor) | `/motion-editor` | Build a local, deterministic motion-graphics editor (timeline, keyframes, easing, presets, MP4 export via Playwright + ffmpeg) from a strict, test-verified spec. Asks for your resources and look references first and derives the editor's defaults from them. |
| [simple-brain-assess](plugins/simple-brain-assess) | `/simple-brain-assess` | Read-only assessment of an AI second brain, personal or company-wide: finds human bottlenecks such as approval gates and unread digests, measures flow, structure, trust and ownership, checks enterprise governance with `--enterprise`, and proposes the smallest next step from manual approval to AI curation with a veto. |
| [simple-brain-kit](plugins/simple-brain-kit) | `/simple-brain-kit` | Set up a working simple brain for a person or company on their own infrastructure: vault lanes, decision records that start switched off (AI curation with a veto, perspective tier, verification with verbatim quotes, voice capture, discovery), nightly playbooks, a read-only brain-mcp server with an optional append-only capture endpoint, and a staged rollout. The build step after `/simple-brain-assess`. |
| [ladder-adoption](https://github.com/kkuklewski/ladder-adoption) | `/ladder`, `/incident-response` | **Deprecated (2026-10-20).** Use [simple-brain-assess](plugins/simple-brain-assess) instead: one skill that checks whether the knowledge base is healthy and whether the nightly routines and agents actually did their work. It stays listed so existing installs keep working, and gets no new features. |

## Repository layout

```text
.claude-plugin/marketplace.json   catalog — one entry per plugin
plugins/<name>/
  .claude-plugin/plugin.json      plugin manifest (name, version, description)
  skills/<skill>/SKILL.md         one folder per skill (+ scripts/, templates/, references/)
  tests/                          plugin's own regression tests (optional)
  README.md
templates/plugin-skeleton/        starting point for a new plugin
scripts/new-plugin.sh <name>      scaffold a plugin from the skeleton and register it in the catalog
scripts/validate.sh               validate the catalog, every plugin, run plugin tests and the leak scan
scripts/leak-scan.py              fail on secrets, real IPs, home paths, e-mails or infra IDs anywhere in the repo
```

The leak scan also reads a private denylist that is never committed (`~/.config/claude-plugins/leak-denylist.txt`,
or `LEAK_DENYLIST`): one case-insensitive regex per line for names that are private by themselves, such as
clients, your own hosts and account IDs. A line that must keep a match ends with `leak-scan: allow`.

## Adding a plugin

```bash
scripts/new-plugin.sh my-plugin "One-line description"
# edit plugins/my-plugin/skills/my-plugin/SKILL.md
scripts/validate.sh
```

A plugin may hold several related skills (`skills/a/`, `skills/b/`); unrelated skills get their own plugin.
Skills reference their own files via the skill's base directory (not hard-coded `~/.claude/...` paths),
so they work both as an installed plugin and as a copy in `~/.claude/skills/`.

## License

MIT — see [LICENSE](LICENSE).
