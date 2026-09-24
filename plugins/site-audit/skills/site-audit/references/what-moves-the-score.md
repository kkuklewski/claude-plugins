# What actually moved the scores (field notes)

Distilled from fixing real Next.js App Router marketing sites one step per commit from a `/site-audit`
report. Numbers are typical ranges, not one site's exact results. Use it to rank fixes by payoff, and to set expectations with the client.

| Stage | Mobile perf | A11y | Notes |
|---|---|---|---|
| First audit | mid-60s | low 90s | FCP ~3 s, LCP ~6 s |
| Structure, keyboard, headers, prefetch | mid-70s | high 90s | |
| + contrast, slider/animation libraries removed | ~90 (PageSpeed Insights) | 100 | desktop ~100 across the board |

Local Lighthouse (simulated throttling on a laptop) often reads ~10 points lower than PageSpeed
Insights for the same build. Compare like with like: same tool, same machine, same URL, median of 3.

## Biggest wins, in order of payoff

1. **Undo `experimental.inlineCss`** (Next). It can put 100 KB+ of CSS in every HTML response *and* again in the
   RSC payload — reverting it can cut gzipped HTML by more than half and FCP by ~0.5 s. Check `http.txt` "HTML weight" first; a regression here
   hides behind every other number. Look at recent config commits, not only the metric.
2. **Remove slider/animation libraries** (e.g. Swiper, GSAP — often ~30 % of a page's transferred JS). Native CSS does the
   same job: `scroll-snap` carousels with a ~60-line hook for arrows/dots, `animation-timeline: view()` for
   scroll reveals, keyframes for hover bounces. A server component that statically imports a client component ships
   its chunk even when it renders nothing: load rarely-used client widgets with `next/dynamic` from a small
   client wrapper.
3. **`prefetch={false}` on footer / dropdown / secondary links.** Typically cuts RSC prefetches by ~70 % and total requests by ~30 %. Cheap, safe.
4. **Contrast** is usually most of the accessibility gap (low 90s → 100). Darken the brand colour for *text and buttons* only
   (e.g. teal `#2a9d8f` 3.3:1 → `#1e7a6f` 5.2:1 on white) and keep the original for large decoration; the brand owner
   must approve, so show before/after screenshots. Also common: translucent text (`text-white/80`, `text-black/40`) and light accent colours on
   off-white backgrounds. Add a dark variant token (e.g. `accent-dark`) instead of one-off hex values.
5. **Landmarks and keyboard**: `<header>`, labelled `<nav>`s, skip link, `aria-expanded` + Enter/Esc on dropdowns,
   `focus-visible` rings, no `<a><button>` nesting, 24 px targets, form fields inside their `<label>`.

## Things that did *not* pay off (don't repeat)

- Splitting the cookie-banner text so it isn't the LCP element: LCP element changed, LCP time didn't. When the
  simulated LCP is fonts + JS before first paint, moving the element does nothing. Reduce what loads first instead.
- Full-page CSS fades on scroll reveal: Lighthouse samples mid-fade and reports contrast failures on text that is
  fine at rest. Animate `translate` only (`animation-fill-mode: backwards`, gated by `@supports` and
  `prefers-reduced-motion: no-preference`).

## Verify carefully after a big dependency swap

- Restart the production server and hard-reload before judging a layout: a tab left open on the old bundle mixes
  new CSS with old markup and looks "broken".
- Headless hidden panes don't run `requestAnimationFrame`/smooth scroll — verify interactive widgets in Playwright.
- Check every page type × 375 and 1440 px, plus keyboard, after replacing a carousel or animation library.

## Tool false positives seen (re-check by eye before "fixing")

- "dev build detected" on a production URL when the HTML embeds framework dev strings.
- Contrast "white on off-white 1.1:1" for text sitting on a photo or gradient (background detection stops at the
  first opaque ancestor), and for text mid-reveal.
- `focus:outline-none` reported even when `focus-visible:` styles replace it.
