#!/usr/bin/env bash
# HTTP-level checks: robots, sitemap, indexing headers, compression, caching, TTFB, 404, security headers.
# Usage: http-checks.sh <url>
set -uo pipefail
URL="${1:?usage: http-checks.sh <url>}"
ORIGIN=$(printf '%s' "$URL" | sed -E 's#^(https?://[^/]+).*#\1#')
HOST=$(printf '%s' "$ORIGIN" | sed -E 's#^https?://##; s#:.*##')
UA="Mozilla/5.0 (site-audit)"
hdr() { curl -sS -o /dev/null -D - -A "$UA" -H 'Accept-Encoding: br, gzip' "$1" | tr -d '\r'; }
field() { grep -i "^$1:" | head -1 | cut -d: -f2- | sed 's/^ //'; }

echo "== Page: $URL"
curl -sS -o /dev/null -A "$UA" -H 'Accept-Encoding: br, gzip' \
  -w 'status=%{http_code}  ttfb=%{time_starttransfer}s  total=%{time_total}s  size=%{size_download}B  redirects=%{num_redirects}\n' -L "$URL"
H=$(hdr "$URL")
echo "content-encoding: $(printf '%s' "$H" | field content-encoding)"
echo "cache-control:    $(printf '%s' "$H" | field cache-control)"
echo "x-robots-tag:     $(printf '%s' "$H" | field x-robots-tag)"
echo "x-powered-by:     $(printf '%s' "$H" | field x-powered-by)   (Next.js sets this; poweredByHeader:false hides it)"
echo "x-nextjs-cache:   $(printf '%s' "$H" | field x-nextjs-cache)  x-vercel-cache: $(printf '%s' "$H" | field x-vercel-cache)"

echo; echo "== HTML weight (what the browser must parse before first paint)"
TMPH=$(mktemp); curl -sS -A "$UA" -L -o "$TMPH" "$URL"
GZ=$(curl -sS -A "$UA" -L -H 'Accept-Encoding: gzip' -o /dev/null -w '%{size_download}' "$URL")
node -e '
const h=require("fs").readFileSync(process.argv[1],"utf8"), gz=+process.argv[2];
const sum=(re)=>[...h.matchAll(re)].reduce((a,m)=>a+m[1].length,0);
const kb=(n)=>(n/1024).toFixed(0)+" KB";
const style=sum(/<style[^>]*>([\s\S]*?)<\/style>/g), rsc=sum(/self\.__next_f\.push\(([\s\S]*?)\)<\/script>/g);
const inlineJs=sum(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g);
const head=h.indexOf("</head>");
const blockingCss=(h.slice(0,head).match(/<link[^>]+rel="stylesheet"[^>]*>/g)||[]).length;
console.log(`raw ${kb(h.length)} | gzip ${kb(gz)} | inline <style> ${kb(style)} | inline JS ${kb(inlineJs)} (RSC payload ${kb(rsc)}) | <head> ${kb(head)} | render-blocking stylesheets ${blockingCss}`);
console.log(`preload links ${(h.match(/rel="preload"/g)||[]).length} | prefetch links ${(h.match(/rel="prefetch"/g)||[]).length} | <img> ${(h.match(/<img/g)||[]).length}`);
if(gz>60*1024) console.log("!! HTML > 60 KB compressed — check inlined CSS (experimental.inlineCss), large RSC payload, or data serialized into the page");
if(style>50*1024 && rsc>style) console.log("!! large inline CSS and an even larger RSC payload — CSS may be serialized twice");
' "$TMPH" "$GZ"
rm -f "$TMPH"

echo; echo "== Security headers (extra)"
for h in strict-transport-security x-content-type-options referrer-policy content-security-policy x-frame-options permissions-policy; do
  v=$(printf '%s' "$H" | field "$h" | cut -c1-110); printf '%-28s %s\n' "$h" "${v:-MISSING}"
done

echo; echo "== Indexing"
case "$HOST" in
  localhost|127.*|*.local) echo "local host — indexing checks not meaningful";;
  *.vercel.app|*.netlify.app|*staging*|*preview*|*dev.*)
    echo "preview/staging host: should be noindex → x-robots-tag='$(printf '%s' "$H" | field x-robots-tag)'";;
  *) echo "production host: must NOT be noindex → x-robots-tag='$(printf '%s' "$H" | field x-robots-tag)'";;
esac

echo; echo "== robots.txt"
R=$(curl -sS -A "$UA" -w '\n__STATUS__%{http_code}' "$ORIGIN/robots.txt")
echo "status: ${R##*__STATUS__}"; printf '%s\n' "${R%__STATUS__*}" | head -20

echo; echo "== sitemap"
SM=$(printf '%s' "${R%__STATUS__*}" | grep -i '^sitemap:' | head -1 | cut -d: -f2- | sed 's/^ //')
SM=${SM:-$ORIGIN/sitemap.xml}
S=$(curl -sS -A "$UA" -w '\n__STATUS__%{http_code}' "$SM")
BODY=${S%__STATUS__*}
echo "url: $SM  status: ${S##*__STATUS__}  <url> entries: $(printf '%s' "$BODY" | grep -o '<loc>' | wc -l | tr -d ' ')"
printf '%s' "$BODY" | grep -o '<loc>[^<]*' | sed 's/<loc>/  /' | head -5
# sitemap host should match the audited origin (common bug: localhost or wrong domain in metadataBase)
printf '%s' "$BODY" | grep -o '<loc>[^<]*' | sed 's/<loc>//' | sed -E 's#^(https?://[^/]+).*#\1#' | sort -u | sed 's/^/  hosts in sitemap: /'

echo; echo "== 404 handling"
curl -sS -o /dev/null -A "$UA" -w "status for /this-page-should-not-exist-$$: %{http_code} (expect 404)\n" "$ORIGIN/this-page-should-not-exist-$$"

echo; echo "== Static asset caching & minification"
HTML=$(curl -sS -A "$UA" -L "$URL")
JS=$(printf '%s' "$HTML" | grep -oE '/_next/static/[^"]+\.js' | head -1)
CSS=$(printf '%s' "$HTML" | grep -oE '/_next/static/[^"]+\.css' | head -1)
for A in $JS $CSS; do
  AH=$(hdr "$ORIGIN$A")
  echo "$A"
  echo "  cache-control: $(printf '%s' "$AH" | field cache-control)   encoding: $(printf '%s' "$AH" | field content-encoding)"
  LINES=$(curl -sS -A "$UA" "$ORIGIN$A" | wc -l | tr -d ' ')
  echo "  lines: $LINES  (a few lines = minified; hundreds+ = dev build or not minified)"
done
[ -z "$JS$CSS" ] && echo "no /_next/static assets found — not a Next.js page, or assets on a CDN domain"
{ printf '%s' "$HTML" | grep -oE '<script[^>]+src="[^"]+"' | grep -qE 'react-refresh|hmr-client|webpack-hmr|next-devtools|_dev_|/_next/static/chunks/(main-app|webpack|app-pages-internals|app/layout)\.js("|\?)' || printf '%s' "$HTML" | grep -q '"buildId":"development"'; } && echo "!! Looks like a DEV build (next dev) — perf numbers are not representative"
exit 0
