# claude-plugins

Kamil Kuklewski's [Claude Code](https://code.claude.com) plugin marketplace: practical skills for
web development, QA and AI-assisted engineering. Each plugin is independent — install only what you need.

## Install

```text
/plugin marketplace add kkuklewski/claude-plugins
/plugin install <plugin>@kkuklewski
```

## Plugins

| Plugin | Skill(s) | What it does |
|---|---|---|
| [site-audit](plugins/site-audit) | `/site-audit` | Pre-launch & regression audit of a website: SEO, Core Web Vitals, accessibility, responsiveness, semantic HTML. Audits every page type, writes a tracked was→now checklist into your repo, re-checks it later. Next.js-first, works on any URL. |
| [ladder-adoption](https://github.com/kkuklewski/ladder-adoption) | `/ladder`, `/incident-response` | Find your rung on the Steps of AI Adoption and the next one up. Lives in its own repo; listed here for one-stop install. |

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
scripts/validate.sh               validate the catalog, every plugin, and run plugin tests
```

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
