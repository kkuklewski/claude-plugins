---
name: reel
description: Make or adjust a short vertical motion-graphics video (Instagram Reel / YouTube Short / TikTok, 1080x1920, captions, no audio) for a blog post or article. Rendered from HTML/JS with Playwright + ffmpeg, so text and numbers are exact. Use when the user asks for a Reel, Short or short promo video for a post, or to change text, numbers, timing, colors or captions in an existing one. Usage: /reel <post path or URL> | /reel <reel name> <change>
---

# Reel

`$SKILL_DIR` below = the **base directory of this skill** (shown above as "Base directory for this skill").

`$SKILL_DIR/template.html` draws every frame from a JSON config; `$SKILL_DIR/scripts/render.mjs` captures the frames
with Playwright and encodes an MP4 with ffmpeg. Each Reel is one JSON file in the user's project, by default
`reels/<post-slug>.json`. Output goes to `reels/out/` (suggest adding `reels/out/` to `.gitignore`).

**To change a Reel, edit only its JSON.** Don't touch the template unless a new scene type is genuinely needed.

## Adjust an existing Reel (the cheap path)

1. Edit `reels/<slug>.json` (text, numbers, timings, captions, theme).
2. Preview only the changed moment: `node "$SKILL_DIR/scripts/render.mjs" reels/<slug>.json --still <seconds>`, look at the PNG.
3. Render: `node "$SKILL_DIR/scripts/render.mjs" reels/<slug>.json` → `reels/out/<slug>.mp4`, and give the file to the user.

## New Reel for a post

1. Read the post. Pick a hook, one concrete number, and a payoff. Use only facts stated in the post.
2. Start from `$SKILL_DIR/examples/website-audit.json`. Keep 10–15 s, 3–4 scenes, captions ≤ 45 characters.
3. Match the site's colors via `theme` if the site isn't dark-neutral (read its CSS/Tailwind config once).
4. Preview one or two stills, then render.

## JSON format

- `duration` (s), `fps` (default 30), `brand` (top-left label), `post` (source, for reference).
- `theme` (optional): any of `bg`, `text`, `muted`, `brand`, `accent`, `warn`, `bad`, `card`, `line` as CSS colors.
- `scenes[]`, each with `start`/`end` in seconds (overlap the next scene by ~0.1 s for a crossfade):
  - `title`: `kicker`, `html` (the headline; `<span class="accent">` = accent color, `<code>` = warn color), optional `sub`, `center: true`.
  - `counter`: `kicker`, `value` (counts up from 0), `items[]` (cards slide in; `good: true` for accent dots instead of red).
  - `score`: `kicker`, `from`, `to` (0–100 ring that fills to `from`, then to `to`, turning accent-colored at the end).
- `captions[]`: `[start, end, "text"]`, burned in near the bottom (safe from Reels UI).

## Requirements

Node ≥ 18, `playwright` (project or global install, with a Chromium) and `ffmpeg` on PATH.
