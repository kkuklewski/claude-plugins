---
name: motion-editor
description: Build a local, deterministic motion-graphics editor app — Vite + React + TypeScript, one pure Canvas renderFrame shared by preview and export, timeline/keyframes/easing/presets, undo/redo, project folders, Playwright + ffmpeg MP4 export — from a strict, test-verified spec. Always asks first for the user's resources and look-reference examples (paths). Use when the user says "build a motion editor", "motion graphics tool", "After Effects-like editor", "make better motion graphics", "animation editor with export to MP4", or invokes /motion-editor. Usage: /motion-editor [target-dir]
---

# motion-editor

`$SKILL_DIR` = the base directory of this skill (shown above as "Base directory for this skill").
The full build spec is `$SKILL_DIR/references/spec.md` — read it completely before writing code.

## Arguments
- `target-dir` (optional): where to create the app. Default: ask, suggesting `./motion-editor`.

## Workflow

### 0. Intake — ask before anything else
Ask the user exactly this (one message, wait for the answer):

> Before I start:
> 1. **Resources** — do you have assets I should use (logos, images, SVGs, fonts, brand colors/guidelines)? Give me a path (folder or files).
> 2. **Look references** — do you have examples of how the motion graphics should look/feel (videos, GIFs, screenshots, links)? Give me a path or URLs.
> 3. Where should I create the app? (default `./motion-editor`)
>
> Answer "none" to any of these and I'll go with sensible defaults.

Only proceed once answered. If a given path does not exist, say so and ask again — never guess.

### 1. Read the resources and references (if any)
- List each path recursively; classify files (image / svg / font / video / gif / doc / other).
- Images, screenshots, PDFs: open them with Read and look at them.
- Videos/GIFs: extract frames with ffmpeg (e.g. `ffmpeg -i in.mp4 -vf fps=2,scale=960:-1 frames/%03d.png`
  into the scratchpad) and look at a representative sample; note pacing between frames.
- URLs: fetch/read them only if the user gave them.
- Write `reference/STYLE.md` in the target dir summarizing, with concrete values:
  palette (hex), typography (families, weights, sizes relative to frame height), motion vocabulary
  (entrance/exit types, distances, durations in ms, easing curves — guess cubic-bezier/spring values),
  stagger intervals, scene length, aspect ratios, cursor usage. Cite which file each observation came from.
- Show the user a 5–8 line digest of STYLE.md and ask for corrections before building.

### 2. How resources/references shape the build (and the limits)
The spec's goal still holds: **the app opens an empty project and renders nothing automatically.**
References change defaults and tooling, not content:
- STYLE.md values become the **defaults**: animation-preset durations/distances/easings, the easing
  picker's named presets, default font/colors for new text and shapes, stagger interval, default aspect/fps.
- User fonts and brand colors become a **Library/Brand panel** (one-click import / swatches) — assets
  are copied byte-for-byte only when the user adds them to a project.
- One user image (or a generated fixture if none) is used as the **e2e test fixture**.
- Copy resources into `reference/` only if the user agrees; otherwise reference them by path in STYLE.md.
- Never build a demo video from the references.

### 3. Build
Follow `references/spec.md` exactly: environment → architecture → data model → Phase 1 (fully built
and verified) → Phase 2 → export → out-of-scope handling. Adapt shortcuts to the OS (Cmd on macOS,
Ctrl elsewhere). If you deviate from the stack, justify it in the README.

### 4. Verify — actually run, never claim
Run the unit tests, the Playwright e2e flow and the export pixel-diff test from the spec's
`<verification>` section. Fix failures until green, or record them honestly.

### 5. Deliver
README with install, run, editing basics, save/open, export (UI + CLI), and the sections
"Works (tested)", "Not implemented", "Known limitations" — listing as working ONLY what passed tests.
Also mention in README how STYLE.md influenced defaults. Report to the user: how to run it, test results
(with counts), and anything not implemented.

## Rules
- Intake (step 0) is mandatory, even if the user's message already sounds complete — unless they
  already gave the resource and reference paths (or said "none") in the same request.
- Determinism over cleverness: output depends only on (project, time).
- No runtime AI/API calls; fully offline.
- Long tasks (npm install, Playwright install, export tests): run in the background so a dropped
  connection doesn't kill them.
