# reel

Short vertical motion-graphics videos (Instagram Reels, YouTube Shorts, TikTok — 1080×1920, 30 fps, burned-in captions, no audio) for blog posts.

Claude writes no video from scratch each time: one HTML/JS template draws every frame from a small JSON file, Playwright captures the frames and ffmpeg encodes the MP4. Text and numbers are exact, renders are deterministic, and changing a caption or a number is a one-line JSON edit plus a re-render.

```text
/reel content/posts/my-post.md        # new Reel for a post
/reel my-post change caption 2 to "…"  # adjust an existing one
```

Scene types: `title`, `counter` (number counting up + cards), `score` (0–100 ring, e.g. Lighthouse before → after). Colors are configurable per Reel via `theme`.

## Requirements

- Node ≥ 18
- `playwright` with Chromium (project or global install)
- `ffmpeg` on PATH

## Tests

`bash tests/run.sh` renders a still from the bundled example (skips if Playwright or Chromium is missing).
