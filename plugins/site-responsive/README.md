# site-responsive

A Claude Code skill for the responsive fix loop of a web page: look at it on several devices in
[Responsively App](https://responsively.app), measure it in Chromium **and** WebKit from 280 to
1440 px, fix what's found, re-measure until clean.

```text
/site-responsive                              the route(s) you just changed, on the running dev server
/site-responsive http://localhost:3000 / /pricing
/site-responsive --report-only                measure and report, no code changes
```

## What it measures

Per engine (Chromium, WebKit) × viewport (280, 375, 393, 768, 1024, 1440; add more with
`SWEEP_WIDTHS=264,320`) × route:

| Metric | Meaning |
|---|---|
| `overflow` | page wider than the viewport (`scrollWidth - clientWidth`) |
| `wide` | elements whose box pokes past the viewport, outside any clipping ancestor |
| `clipped` | text cut off inside its own box |
| `hiddenOnLoad` | text in the first viewport still invisible on load (waits for a scroll reveal) |
| `hidden` | text still invisible after scrolling the whole page (reveal never fired) |
| `small` | links/buttons under 24 px |
| `brokenImg` | images that failed to load |

Full-page JPEGs (Chromium) and `results.json` with selectors and text go to the output folder you pass.

The sweep also runs on its own:

```bash
node <plugin>/skills/site-responsive/scripts/sweep.mjs http://localhost:3000 /tmp/sweep / /pricing
```

## Requirements

- Node ≥ 18 and **Playwright in the project** (the sweep loads the project's own copy):
  `npm i -D playwright && npx playwright install chromium webkit`
- Optional, recommended: Responsively App + its MCP server for the visual pass
  ```bash
  claude mcp add --scope user responsively -- npx -y @responsively/mcp
  ```
  Without it the skill reviews the sweep's screenshots instead.

Pairs with [site-audit](../site-audit): run `/site-audit` for the whole-site quality report, and
`/site-responsive` to fix the responsive findings page by page.
