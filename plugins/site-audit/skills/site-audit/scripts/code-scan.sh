#!/usr/bin/env bash
# Static scan of a web repo for checklist leads. Hits are leads, not verdicts — confirm in the file.
# Scans only SOURCE roots (src/ app/ pages/ components/ lib/ styles/ … or .site-audit.json "sourceDirs"),
# honours .gitignore (rg default) + .site-audit.json "ignorePaths", and skips private routes
# (admin/api/login… + robots Disallow + "privateRoutes") for SEO checks.
# Usage: code-scan.sh [repo-path]
set -uo pipefail
exec </dev/null  # rg reads stdin when no path is given and stdin is not a tty
ROOT="${1:-.}"; cd "$ROOT" || exit 1
[ -f package.json ] || { echo "no package.json in $ROOT — static scan skipped"; exit 0; }
command -v rg >/dev/null || { echo "ripgrep (rg) required"; exit 1; }
HERE="$(cd "$(dirname "$0")" && pwd)"

# ---- config (via node; all keys optional). bash 3.2-safe list reading (no mapfile).
cfgl() { node -e '
const fs=require("fs");let c={};try{c=JSON.parse(fs.readFileSync(".site-audit.json","utf8"))}catch{}
const k=process.argv[1];
const v=k==="src"?(c.sourceDirs&&c.sourceDirs.length?c.sourceDirs:["src","app","pages","components","lib","styles","ui","hooks","content","features","modules"]).filter(d=>fs.existsSync(d))
      :k==="ignore"?(c.ignorePaths||[]):(c.privateRoutes||[]);
console.log(v.join("\n"))' "$1"; }
SRCDIRS=(); while IFS= read -r l; do [ -n "$l" ] && SRCDIRS+=("$l"); done < <(cfgl src)
IGNORES=(); while IFS= read -r l; do [ -n "$l" ] && IGNORES+=("$l"); done < <(cfgl ignore)
PRIV=(); while IFS= read -r l; do [ -n "$l" ] && PRIV+=("$l"); done < <(cfgl priv)
[ ${#SRCDIRS[@]} -eq 0 ] && SRCDIRS=(.)
EX=(--glob '!node_modules' --glob '!.next' --glob '!out' --glob '!dist' --glob '!build' --glob '!.git' --glob '!coverage' --glob '!*.min.*' --glob '!*.map' --glob '!**/*.test.*' --glob '!**/*.spec.*' --glob '!**/__tests__/**')
for g in ${IGNORES[@]+"${IGNORES[@]}"}; do EX+=(--glob "!$g"); done
CODE=(--type-add 'web:*.{ts,tsx,js,jsx,mdx,vue,svelte,astro}' --type web)
STYLE=(-g '*.{css,scss,sass,less}')

# hits <label> <rg args...>  — searches SRCDIRS only; prints total + first 12
hits() {
  local label="$1"; shift
  local out; out=$(rg -n --no-heading "${EX[@]}" "$@" "${SRCDIRS[@]}" 2>/dev/null)
  local n; n=$(printf '%s' "$out" | grep -c .)
  echo "-- $label: $n hit(s)"
  [ -n "$out" ] && printf '%s\n' "$out" | head -12 | cut -c1-220 | sed 's/^/   /'
  [ "$n" -gt 12 ] && echo "   … $((n-12)) more"
  return 0
}

echo "== Project"
node -e 'const p=require("./package.json");const d={...p.dependencies,...p.devDependencies};
const fw=d.next?"next":d.astro?"astro":d.nuxt?"nuxt":d["@sveltejs/kit"]?"sveltekit":d["@remix-run/react"]||d["react-router"]?"remix/react-router":d.gatsby?"gatsby":d.vite?"vite":"unknown";
console.log("framework:",fw,"| next:",d.next||"-","| react:",d.react||"-","| tailwind:",d.tailwindcss||"-","| @next/third-parties:",d["@next/third-parties"]||"-","| jsx-a11y:",d["eslint-plugin-jsx-a11y"]?"yes":"(via eslint-config-next?)")' | tee /tmp/.site-audit-fw.$$
FW=$(sed -E 's/framework: ([^ ]+).*/\1/' /tmp/.site-audit-fw.$$); rm -f /tmp/.site-audit-fw.$$
echo "source roots scanned: ${SRCDIRS[*]}   ignored: ${IGNORES[*]:-(gitignore only)}"
APP=""; for d in app src/app; do [ -d "$d" ] && APP="$d"; done
PAGES=""; for d in pages src/pages; do [ -d "$d" ] && PAGES="$d"; done

# private route regex for filtering page files
PRIV_RE='(^|/)(admin|api|login|logout|signin|signup|register|dashboard|account|auth|panel|settings|checkout|cart|preview|draft)(/|$)'
for p in ${PRIV[@]+"${PRIV[@]}"}; do PRIV_RE="$PRIV_RE|${p#/}(/|$)"; done
if [ -n "$APP" ]; then
  ROBOTS_DIS=$( (cat $APP/robots.* public/robots.txt 2>/dev/null) | grep -oiE "disallow['\": ]+[^'\",]+" | sed -E "s/.*[\"' :]//" | sed 's#^/##; s#/$##' | grep -v '^$' | tr '\n' '|' | sed 's/|$//')
  [ -n "$ROBOTS_DIS" ] && PRIV_RE="$PRIV_RE|(^|/)($ROBOTS_DIS)(/|$)"
fi

if [ "$FW" = next ]; then
  echo "router: app=${APP:-no} pages=${PAGES:-no}  | config: $(ls next.config.* 2>/dev/null | tr '\n' ' ')"
  node -e 'const v=require("./package.json");const n=(v.dependencies||{}).next||(v.devDependencies||{}).next||"";const m=+(n.match(/\d+/)||[0])[0];if(m>=16)console.log("Next "+m+": <Image priority> → preload, middleware.ts → proxy.ts")'
  [ -f src/middleware.ts ] || [ -f middleware.ts ] && echo "-- middleware.ts present (Next 16+: rename to proxy.ts)"
  if [ -n "$APP" ]; then
    echo; echo "== Metadata & file conventions ($APP)"
    LAYOUT=$(ls $APP/layout.* 2>/dev/null | head -1)
    echo "root layout: ${LAYOUT:-MISSING}"
    if [ -n "$LAYOUT" ]; then
      grep -q 'lang=' "$LAYOUT" && echo "  <html lang>: $(grep -o 'lang=[^ >]*' "$LAYOUT" | head -1)" || echo "  <html lang>: MISSING"
      grep -q 'metadataBase' "$LAYOUT" && echo "  metadataBase: yes" || echo "  metadataBase: MISSING"
      grep -q 'template' "$LAYOUT" && echo "  title template: yes" || echo "  title template: no"
      grep -qE '^\s*["'\'']use client' "$LAYOUT" && echo "  !! root layout is a client component"
      grep -qE 'next/font' "$LAYOUT" && echo "  next/font in root layout: yes" || echo "  next/font in root layout: no"
      grep -qE 'id=["'\'']main|#main|skip' "$LAYOUT" "$APP"/*/layout.* 2>/dev/null && echo "  skip link / #main in a layout: yes" || echo "  skip link / #main in a layout: not found"
    fi
    for f in sitemap robots manifest icon apple-icon favicon opengraph-image not-found error global-error; do
      found=$(ls $APP/$f.* 2>/dev/null | head -1); [ -z "$found" ] && [ -f "public/$f.xml" ] && found="public/$f.xml"; [ -z "$found" ] && [ -f "public/$f.txt" ] && found="public/$f.txt"
      printf '  %-16s %s\n' "$f" "${found:-—}"
    done
    echo; echo "== Public pages without their own metadata (private routes skipped; may inherit from a layout)"
    n=0
    while IFS= read -r p; do
      route=$(printf '%s' "${p#$APP/}" | sed -E 's#\([^)]*\)/##g; s#/?page\.[a-z]+$##')
      printf '%s' "$route" | grep -qE "$PRIV_RE" && continue
      if ! grep -qE 'export (const metadata|async function generateMetadata|function generateMetadata)' "$p"; then
        dir=$(dirname "$p"); inh=""
        while [ "$dir" != "$APP" ] && [ "$dir" != "." ]; do ls "$dir"/layout.* >/dev/null 2>&1 && grep -qE 'export (const metadata|async function generateMetadata)' "$dir"/layout.* && inh=" (inherits $(ls "$dir"/layout.* | head -1))" && break; dir=$(dirname "$dir"); done
        echo "   /$route  $p$inh"; n=$((n+1))
      fi
    done < <(rg --files "${EX[@]}" -g 'page.{tsx,ts,jsx,js,mdx}' "$APP" 2>/dev/null | sort)
    [ $n -eq 0 ] && echo "   none"
  fi
  if [ -n "$PAGES" ]; then
    echo; echo "== Pages router"
    hits "pages using next/head" -l 'next/head'
    ls $PAGES/_document.* 2>/dev/null | xargs -I{} sh -c 'grep -q "lang=" {} && echo "   _document lang: yes" || echo "   _document lang: MISSING"'
  fi
else
  echo "(not Next.js — Next-specific checks skipped; generic checks below still apply)"
  for f in public/robots.txt public/sitemap.xml public/favicon.ico; do printf '  %-22s %s\n' "$f" "$([ -f "$f" ] && echo yes || echo —)"; done
fi

echo; echo "== Fonts"
hits "Google Fonts via <link>/@import (self-host: next/font or @fontsource)" 'fonts\.(googleapis|gstatic)\.com'
[ "$FW" = next ] && hits "next/font usage" "${CODE[@]}" "from ['\"]next/font"
echo "-- non-woff2 font files in public/: $(find public -type f \( -iname '*.ttf' -o -iname '*.otf' -o -iname '*.woff' \) 2>/dev/null | wc -l | tr -d ' ')"

echo; echo "== Images"
if [ "$FW" = next ]; then
  hits "raw <img> (prefer next/image)" "${CODE[@]}" '<img\s'
  hits "<Image> missing alt" "${CODE[@]}" -U '<Image\b(?:(?!alt=)[^>])*?/>' --pcre2
  hits "<Image fill> without sizes" "${CODE[@]}" -U '<Image\b(?=[^>]*\bfill\b)(?:(?!sizes=)[^>])*?/>' --pcre2
  hits "priority prop (Next 16+: use preload)" "${CODE[@]}" '<Image[^>]*\bpriority\b'
  rg -q "formats" next.config.* 2>/dev/null && echo "-- images.formats: $(rg -o "formats:[^\]]*\]" next.config.* | head -1)" || echo "-- images.formats: default (webp)"
else
  hits "<img> without alt" "${CODE[@]}" -U '<img\b(?:(?!alt=)[^>])*?>' --pcre2
fi
echo "-- raster images in public/ > 200KB:"; find public -type f \( -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.gif' \) -size +200k 2>/dev/null | head -10 | while read -r f; do echo "   $(du -k "$f" | cut -f1)KB $f"; done

echo; echo "== Scripts / 3rd party"
hits "raw <script> tags (use next/script or framework equivalent)" "${CODE[@]}" '<script\b(?![^>]*type=["'\'']application/ld\+json)' --pcre2
[ "$FW" = next ] && hits "next/script + strategy" "${CODE[@]}" 'strategy=|from ["'\'']next/script'
hits "trackers" "${CODE[@]}" -i 'gtag|googletagmanager|GoogleAnalytics|GoogleTagManager|fbq\(|hotjar|clarity\.ms|plausible|posthog|cdn\.segment|analytics\.js'
hits "consent handling" "${CODE[@]}" -i "consent|cookiebot|onetrust|cookie-?banner"
echo "-- 'use client' files: $(rg -l "${EX[@]}" "${CODE[@]}" "^['\"]use client" "${SRCDIRS[@]}" 2>/dev/null | wc -l | tr -d ' ')   | next/dynamic imports: $(rg -l "${EX[@]}" "${CODE[@]}" "from ['\"]next/dynamic" "${SRCDIRS[@]}" 2>/dev/null | wc -l | tr -d ' ')"
rg -q 'inlineCss' next.config.* 2>/dev/null && echo "-- !! experimental.inlineCss enabled — inflates HTML (CSS repeated in RSC payload); verify HTML weight"

echo; echo "== Typography & units"
hits "px font-size in stylesheets" "${STYLE[@]}" 'font-size:\s*\d+(\.\d+)?px'
hits "html/:root font-size in px" "${STYLE[@]}" -U '(html|:root)\s*\{[^}]*font-size:\s*\d+px' --pcre2
hits "Tailwind arbitrary px text sizes" "${CODE[@]}" 'text-\[\d+(\.\d+)?px\]'
echo "-- hard-coded hex colours in components: $(rg -o --no-filename "${EX[@]}" "${CODE[@]}" '#[0-9a-fA-F]{6}\b' "${SRCDIRS[@]}" 2>/dev/null | wc -l | tr -d ' ') (top: $(rg -o --no-filename "${EX[@]}" "${CODE[@]}" '#[0-9a-fA-F]{6}\b' "${SRCDIRS[@]}" 2>/dev/null | sort | uniq -c | sort -rn | head -4 | awk '{printf "%s×%s ",$2,$1}'))"

echo; echo "== Accessibility"
OUT=$(rg -n --no-heading "${EX[@]}" 'outline-none|outline:\s*(none|0)' "${SRCDIRS[@]}" 2>/dev/null | rg -v 'focus(-visible)?:(ring|border|outline-|shadow|underline|bg-)|focus-visible')
echo "-- outline removed with no focus style on the same line: $(printf '%s' "$OUT" | grep -c .) hit(s)"; [ -n "$OUT" ] && printf '%s\n' "$OUT" | head -12 | cut -c1-200 | sed 's/^/   /'
hits "onClick on non-interactive element" "${CODE[@]}" '<(div|span|li|img)\b[^>]*onClick'
hits "target=_blank" "${CODE[@]}" 'target=["{'\'']_blank'
hits "skip link" -g '*.{tsx,jsx,vue,svelte,astro}' -i 'skip to|skip-link|skiplink|href=["'\'']#main|przejdź do'
hits "positive tabIndex" "${CODE[@]}" 'tabIndex=\{?["'\'']?[1-9]'

echo; echo "== Indexing / headers"
hits "noindex config" "${CODE[@]}" -i 'index:\s*false|noindex'
hits "env-based indexing (VERCEL_ENV etc.)" "${CODE[@]}" 'VERCEL_ENV|NEXT_PUBLIC_VERCEL_ENV|NODE_ENV.*robots'
[ "$FW" = next ] && { rg -q 'headers\s*\(' next.config.* 2>/dev/null && echo "-- headers() in next.config: yes" || echo "-- headers() in next.config: no (no security headers from Next)"; rg -q 'poweredByHeader' next.config.* 2>/dev/null || echo "-- poweredByHeader not disabled"; }
exit 0
