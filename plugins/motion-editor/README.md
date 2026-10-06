# motion-editor

Build a local, deterministic motion-graphics editor app (Vite + React + Canvas `renderFrame`,
Playwright + ffmpeg MP4 export) from a strict, test-verified spec. Before building, the skill asks for
your **resources** (logos, fonts, brand colors) and **look references** (videos, GIFs, screenshots) by
path, studies them, and turns them into a `STYLE.md` that drives the editor's defaults and presets.

```text
/motion-editor [target-dir]
```

Spec adapted from a prompt by Nate Parrott (see `skills/motion-editor/references/spec.md`).

## Requirements
Node 20+, ffmpeg in PATH (also used to sample frames from reference videos), Playwright (installed by the generated app).

## Tests
The generated app ships its own unit, e2e and export pixel-diff tests; the skill requires them to pass
before anything is listed as working.
