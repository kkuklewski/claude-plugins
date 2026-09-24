# Site audit checklist (Next.js)

Severity: **C** Critical · **I** Important · **M** Minor.
Source column: `code` = code-scan.sh · `dom` = multi-page.mjs / dom-audit.js (every page type × viewport) ·
`http` = http-checks.sh · `lh` = Lighthouse (median of N) · `kbd` = interactive browser pass · `manual`.
Issue IDs below are what `pages.md`, `summary.json` and `.site-audit.json` → `accepted` refer to.

## 1. Best practices (build & structure)
| # | Item | Sev | Source | Pass criteria / Next.js fix |
|---|------|-----|--------|------------------------------|
| 1.1 | Design tokens / style guide | I | code, manual | One source of truth for colors, type scale, spacing (Tailwind theme / `@theme` / CSS vars). No hard-coded hex colors scattered in components. A `/styleguide` or Storybook page is a plus. |
| 1.2 | Relative units for typography & spacing | C | code, dom | `font-size` in rem/em/clamp(rem…), never px; `html { font-size }` not set in px (overrides user browser setting). Tailwind: no `text-[14px]`. |
| 1.3 | Global 3rd-party scripts in root layout | I | code | GA/GTM/pixels loaded once in `app/layout.tsx` via `next/script` or `@next/third-parties` (`<GoogleTagManager>`), not per page, not raw `<script>`. |
| 1.4 | Page-specific scripts scoped to that route | I | code | Widgets used on one page live in that page/segment layout with a sensible `strategy` (`afterInteractive` default, `lazyOnload` for non-critical, `beforeInteractive` only when truly required). |
| 1.5 | Global styles leveraged, no CSS bloat | C | code, lh | Shared components/utilities instead of one-off styles; Lighthouse "Reduce unused CSS" not flagged; no giant global CSS imported in client components. |
| 1.6 | Unused CSS / dead code cleanup | I | code, lh | No unused CSS modules/classes, unused components/deps; Tailwind content paths correct so purge works. |
| 1.7 | Unused JS / client bundle cleanup | I | code, lh | Minimal `"use client"` surface (not on root layout / whole pages); heavy libs (animation, charts, maps) loaded with `next/dynamic`; Lighthouse "Reduce unused JavaScript" not flagged. |
| 1.8 | Minified CSS | C | http | Production build (`next build`) — minification is automatic; verify the audited URL is a prod build, not `next dev`. |
| 1.9 | Minified JS | C | http | Same as 1.8; also no source maps shipped publicly unless intended (`productionBrowserSourceMaps`). |
| 1.10 | Fonts self-hosted, woff2, only what's used | I | code, dom | `next/font/google` or `next/font/local` (woff2), `display: 'swap'`, subsets set, only needed weights; no `<link href="fonts.googleapis.com">` or CSS `@import` of Google Fonts. |
| 1.11 | Favicon / app icons | M | code, dom | `app/favicon.ico` + `app/icon.(png|svg)` + `app/apple-icon.png` (180×180), or `metadata.icons`. Web manifest (`app/manifest.ts`) optional. |
| 1.12 | `lang` attribute | C | code, dom | `<html lang="…">` in root layout; for i18n, set dynamically per locale (`app/[lang]/layout.tsx`). |
| 1.13 | Primary font on body/html | C | code, dom | Font className/variable applied on `<html>` or `<body>` once, not repeated per text component. |
| 1.14 | Semantic tags | C | dom | Exactly one `<main>`; `<header>`, `<nav>` (with `aria-label` if >1), `<footer>`; sections as `<section>`/`<article>`; no clickable `<div onClick>`. |
| 1.15 | Proper layout structure | C | code, dom | main → section → container (max-width, `mx-auto`, consistent horizontal padding via a shared `Container` component). |
| 1.16 | No console errors / hydration errors | M | dom, lh | Clean console on every page type. |

## 2. SEO
| # | Item | Sev | Source | Pass criteria / Next.js fix |
|---|------|-----|--------|------------------------------|
| 2.1 | Lighthouse SEO ≥ 90 | I | lh | — |
| 2.2 | Meta titles on every page | C | code, dom | `metadata.title` / `generateMetadata`; root layout `title: { default, template: '%s — Brand' }`; unique, ~30–60 chars. |
| 2.3 | Meta descriptions on every page | C | code, dom | `metadata.description`, unique, ~70–160 chars. |
| 2.4 | Preview/staging domains not indexed | I | http | `*.vercel.app` / staging hosts send `X-Robots-Tag: noindex` or `robots: { index: false }` when `VERCEL_ENV !== 'production'`; production must NOT be noindex. |
| 2.5 | Sitemap | C | code, http | `app/sitemap.ts` (or static `public/sitemap.xml`) returning all public routes incl. dynamic ones; referenced in robots.txt. |
| 2.6 | robots.txt | I | code, http | `app/robots.ts` with `sitemap:` URL; not `Disallow: /` in production. |
| 2.7 | Canonical + metadataBase | I | code, dom | `metadataBase` in root layout; `alternates.canonical` per page; OG image (`opengraph-image.tsx` or `metadata.openGraph.images`). |
| 2.8 | Only one H1 per page | C | dom | Exactly one `<h1>`; style other big text with classes, not heading tags. |
| 2.9 | Heading hierarchy | C | dom | No skipped levels (h1→h3). |
| 2.10 | Image alt text | I | dom, code | Every `<Image>`/`<img>` has `alt`; decorative images `alt=""`. |
| 2.11 | Link targets | M | dom | External links `target="_blank" rel="noopener noreferrer"`; internal links via `next/link`, same tab. |
| 2.12 | Correct 404 status | I | http | Unknown routes return HTTP 404 (`not-found.tsx`), not 200 soft-404. |

## 3. Performance
| # | Item | Sev | Source | Pass criteria / Next.js fix |
|---|------|-----|--------|------------------------------|
| 3.1 | Fast load (FCP < 1.5 s, TTFB < 0.8 s), lean HTML | C | lh, http, dom | Static/ISR where possible; avoid uncached dynamic fetches on marketing pages. HTML ≤ ~60 KB gzipped: watch `experimental.inlineCss` (CSS repeated in the RSC payload) and large data serialized into the page. |
| 3.2 | Lighthouse Performance ≥ 90 (mobile) | I | lh | — |
| 3.3 | LCP < 2.5 s | I | lh, dom | LCP image uses `<Image preload>` (Next 16) / `priority` (≤15), never `loading="lazy"`; correct `sizes`; no client-only render of hero. |
| 3.4 | CLS < 0.1, TBT < 200 ms | I | lh | Reserve space for images/embeds/ads; fonts via next/font (size-adjusted fallback). |
| 3.5 | Mobile optimization | I | lh, code, dom | Heavy animations/3rd-party widgets deferred (`lazyOnload`, `next/dynamic`, IntersectionObserver); no desktop-only assets on mobile; not dozens of `<Link>` RSC prefetches on load (`prefetch={false}` on low-value links). |
| 3.6 | Next-gen image formats | C | dom, code | Images served through `next/image` (auto WebP/AVIF); `images.formats: ['image/avif','image/webp']` optional; no large raw PNG/JPG in `public/` served directly. |
| 3.7 | Image dimensions set | I | dom | `width`+`height` or `fill` with sized parent + `sizes`. |
| 3.8 | Compression & caching | I | http | HTML/JS compressed (br/gzip); `/_next/static/*` `Cache-Control: public, max-age=31536000, immutable`. |

## 4. Responsiveness (manual via breakpoint sweep)
| # | Item | Sev | Source | Pass criteria |
|---|------|-----|--------|---------------|
| 4.1 | Desktop 992 → 1920 px | C | kbd | Layout scales, no overflow, content max-width sensible at 1920. |
| 4.2 | Tablet 768 → 991 px | I | kbd | — |
| 4.3 | Mobile landscape 480 → 767 px | M | kbd | — |
| 4.4 | Mobile portrait 320 → 479 px | C | kbd, dom | No horizontal scroll at 320; tap targets ≥ 24×24 px; text readable ≥ 16px equivalent for body. |

## 5. Accessibility
| # | Item | Sev | Source | Pass criteria / Next.js fix |
|---|------|-----|--------|------------------------------|
| 5.1 | Visible focus state on all interactive elements | C | dom, kbd, code | No `outline: none` / Tailwind `outline-none` without a `focus-visible:` replacement. |
| 5.2 | Lighthouse Accessibility ≥ 90 | I | lh | — |
| 5.3 | Skip-to-main link | I | dom, kbd | First focusable element is `<a href="#main">`, target `<main id="main">` exists. |
| 5.4 | Accessible dropdowns | C | kbd, dom | Trigger is a `<button>` with `aria-expanded`/`aria-controls`; Esc closes; closed items not focusable. Prefer Radix/Headless UI/React Aria. |
| 5.5 | Accessible modals | I | kbd, dom | `<dialog>` or `role="dialog" aria-modal="true"` + label; focus moves in, is trapped, returns to trigger on close; Esc closes. |
| 5.6 | Colour contrast | C | dom, lh | ≥ 4.5:1 normal text, ≥ 3:1 large (≥ 24px or ≥ 18.66px bold). |
| 5.7 | Typography respects user settings / 200% zoom | C | dom, kbd | rem-based type; fluid `clamp()` uses rem; no clipping at 200%. |
| 5.8 | Buttons & links have accessible names | I | dom | Visible text, or `aria-label` for icon-only; `<button>` for actions, `<Link>` for navigation. |
| 5.9 | Form controls labelled | I | dom | `<label htmlFor>` or `aria-label`; errors announced. |
| 5.10 | No focusable content inside `aria-hidden` | C | dom | — |

## 6. Other
| # | Item | Sev | Source | Pass criteria |
|---|------|-----|--------|---------------|
| 6.1 | GDPR / cookie consent (if applicable) | I | dom, code, manual | No analytics/marketing cookies (`_ga`, `_fbp`, `_gcl_au`…) before consent; consent banner with reject option; Google Consent Mode v2 if using GA/Ads; privacy & cookie policy pages linked in footer. |
| 6.2 | Security headers (extra) | M | http | HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, CSP or at least `frame-ancestors` — set in `next.config` `headers()`. |
