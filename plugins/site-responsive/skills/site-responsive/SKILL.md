---
name: site-responsive
description: Responsive QA loop for a web page — visual pass in Responsively App (via its MCP) on phone, tablet and desktop, then a Chromium + WebKit sweep from 280 to 1440 px that measures horizontal overflow, elements poking past the viewport, clipped text, content still hidden on load or after scrolling, tap targets under 24 px and broken images; fixes, and re-sweeps until every number is 0. Use when the user says "check responsiveness", "check mobile", "does this work on phone/iPad", "responsive pass", "fix overflow on mobile", after a page redesign, or invokes /site-responsive. Usage: /site-responsive [url] [/route ...] [--report-only]
---

# site-responsive

`$SKILL_DIR` = the base directory of this skill (shown above as "Base directory for this skill").
Reference bundled files as `$SKILL_DIR/scripts/...` — never hard-code `~/.claude/...` paths.

Two instruments, both needed: **Responsively** shows what a human sees on several devices at once
(layout, rhythm, crowding); the **sweep** measures what eyes miss (a 3 px overflow on Safari, a
heading that only fades in after a scroll, a 20 px icon link). Neither alone is a pass.

## Arguments

```text
/site-responsive [url] [/route ...] [--report-only]
```

| Arg | Meaning |
|---|---|
| `url` | Base URL. Omitted → the running dev server (`package.json` dev script / `.claude/launch.json` port); start it if needed. |
| `/route ...` | Routes to check. Omitted → the route(s) changed in this session, else `/`. |
| `--report-only` | Measure and report; don't edit code. |

## Requirements

- **Playwright in the project** (the sweep uses the project's own copy):
  `npm i -D playwright && npx playwright install chromium webkit`.
- **Responsively App** + its MCP server, optional but recommended for the visual pass:
  `claude mcp add --scope user responsively -- npx -y @responsively/mcp` (tools `mcp__responsively__*`).
  Without it, do the visual pass from the sweep's screenshots.

## Workflow

1. **Resolve** base URL and routes. Confirm the server answers (`curl -sI <url><route>`).
2. **Visual pass (Responsively).** `navigate` to the route, `set_active_devices` to a small phone,
   a standard phone, a tablet and a laptop (`list_devices` for names), `screenshot`, and look for:
   crowded or overlapping blocks, text running into the edge, images cropped badly, sticky bars
   covering content, decorations bleeding off-screen, menus that don't open (`click` to test).
3. **Measure (sweep).** From the project root:
   ```bash
   node "$SKILL_DIR/scripts/sweep.mjs" <url> <outDir> /route [/route ...]
   ```
   `outDir` in a scratch/temp dir, not the repo. Extra widths: `SWEEP_WIDTHS=264,320`.
   Viewports: 280, 375, 393, 768, 1024, 1440 — each in Chromium and WebKit. Output per
   engine × viewport × route: `overflow`, `hiddenOnLoad`, `hidden`, `wide`, `clipped`, `small`,
   `brokenImg`; details (selectors, text) in `<outDir>/results.json`; full-page JPEGs (Chromium) in `<outDir>`.
4. **Fix** (skip with `--report-only`), smallest change per finding, never changing visible text or data:

   | Finding | Usual cause → fix |
   |---|---|
   | `overflow` > 0 / `wide` | Decoration with negative offset, fixed width, long word/URL → clip the decoration's own container, `max-w-full`, `min-w-0` on flex/grid children, `break-words`/`overflow-wrap:anywhere`. Keep a page-level `overflow-x: clip` as a safety net, not as the fix. |
   | `clipped` | Fixed height or `overflow:hidden` on a text box → let it grow, or reduce size at that breakpoint. |
   | `hiddenOnLoad` | Above-the-fold block waits for a scroll-triggered reveal → show it immediately when it starts in the viewport. |
   | `hidden` (after full scroll) | Reveal/GSAP trigger never fires (pinned section, wrong start) → fix the trigger or give a visible fallback. Pinned sections intentionally hiding later steps can be accepted — say why. |
   | `small` | Icon/text links under 24 px → padding or `min-h-6 min-w-6` (44 px for primary touch actions). |
   | `brokenImg` | Wrong path or missing asset. |

   For one-off tiny widths use a max-width variant (e.g. Tailwind `max-[359px]:`) instead of
   changing the design for everyone.
5. **Re-sweep** the same routes until every number is 0 (or each remaining one is an accepted,
   explained exception), then repeat the Responsively pass on the fixed routes.
6. **Report** a short table: route × viewport with the counts before → after, the fixes (file:line),
   accepted exceptions with reasons, and the screenshot folder. If the project has an overflow e2e
   test (e.g. `scrollWidth <= clientWidth` across browsers), run it too.

## Rules

- Test WebKit, not just Chromium — Safari overflow and clipping bugs are the common miss.
- Never change visible copy, data or the design system to make a number go down; restyle around it.
- Don't commit or push unless asked; screenshots and `results.json` stay out of the repo.
- For a full-site quality audit (SEO, performance, accessibility) use `/site-audit`; this skill is the
  focused responsive fix loop.
