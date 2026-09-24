# site-audit

A Claude Code skill that audits a website before launch (or after changes) and keeps the
findings as a tracked checklist in your repo. Next.js-first; works on any URL and falls back to
generic checks for other frameworks.

```text
/site-audit https://example.com            full audit of every page type
/site-audit --quick                        one page, no Lighthouse
/site-audit --recheck                      re-audit, fill the "Now" column, before/after scores
/site-audit --fix                          work through the findings, one commit per step
```

## What it checks

~50 items in 6 groups — best practices, SEO, performance, responsiveness, accessibility, privacy —
each with an ID and severity ([checklist](skills/site-audit/checklist.md)).

| Phase | How |
|---|---|
| Page discovery | one sample URL per route template, from your `app/` / `pages/` routes, the sitemap and internal links; private routes skipped |
| DOM audit | headless Chrome at 375 and 1440 px on every sample: headings, landmarks, skip link, alt text, image sizing/format, LCP, contrast (with a suggested passing colour), accessible names, labels, overflow, tap targets, tracking cookies before consent, console errors |
| HTTP | robots, sitemap, indexing headers, HTML weight (inline CSS / RSC payload), compression, caching, minification, real 404, security headers |
| Code scan | source folders only: metadata per public route, file conventions, next/font, next/image, next/script, px font sizes, focus styles, Next-version deprecations |
| Lighthouse | mobile + desktop, median of 3 runs with spread, failing audits with the elements behind them |
| Interactive | Claude drives a browser for keyboard navigation, menus/modals, breakpoint screenshots and 200 % text |

Output: a chat report, `docs/audit/site-audit-<date>.md` (was → now table + steps) and a small JSON
record that the next `--recheck` diffs against.

## Requirements

Node ≥ 22, Chrome or Chromium (or `CHROME_PATH`), [ripgrep](https://github.com/BurntSushi/ripgrep).
Lighthouse runs through `npx` on first use. No `npm install`.

## Per-project config

Optional `.site-audit.json` in the project root — ignored folders, private routes, extra sample pages,
production URL, and **accepted exceptions** that stop intentional findings being re-flagged.
See [the example](skills/site-audit/templates/site-audit.config.example.json).

## Tests

```bash
bash tests/run.sh   # audits two fixture pages and asserts which checks fire
```

## Credits

The checklist began as an adaptation of a free community Webflow audit checklist; every item has
been rewritten for Next.js and extended.
