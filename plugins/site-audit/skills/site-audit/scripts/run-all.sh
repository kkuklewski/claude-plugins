#!/usr/bin/env bash
# One command for all automated phases. Writes everything to one folder and prints a short index.
#   code scan ‖ HTTP checks ‖ page discovery → multi-page DOM audit   (parallel)
#   then Lighthouse mobile + desktop (sequential — parallel runs skew perf scores)
#   then summary.json (+ compare.md when a baseline is given/found)
# Usage: run-all.sh <url> [--repo <path>] [--out <dir>] [--pages types|single|all|N]
#                   [--runs N] [--no-lh] [--viewports 375,1440] [--baseline <summary.json>|auto]
set -uo pipefail
exec </dev/null
HERE="$(cd "$(dirname "$0")" && pwd)"
URL="${1:?usage: run-all.sh <url> [--repo p] [--out d] [--pages types|single|all|N] [--runs N] [--no-lh] [--baseline f|auto]}"; shift
REPO=""; OUT=""; PAGES=types; RUNS=3; LH=1; VP=""; BASE=""
while [ $# -gt 0 ]; do case "$1" in
  --repo) REPO="$(cd "$2" && pwd)"; shift 2;; --out) OUT="$2"; shift 2;; --pages) PAGES="$2"; shift 2;;
  --runs) RUNS="$2"; shift 2;; --no-lh) LH=0; shift;; --viewports) VP="$2"; shift 2;; --baseline) BASE="$2"; shift 2;;
  *) echo "unknown arg $1"; exit 1;; esac; done
HOST=$(printf '%s' "$URL" | sed -E 's#^https?://##; s#[/:].*##')
OUT="${OUT:-${TMPDIR:-/tmp}/site-audit/$HOST-$(date +%Y%m%d-%H%M%S)}"; mkdir -p "$OUT"
RA=(); [ -n "$REPO" ] && RA=(--repo "$REPO")
VA=(); [ -n "$VP" ] && VA=(--viewports "$VP")
T0=$(date +%s)

# dev-build guard: perf numbers from `next dev` are meaningless
if curl -sS -m 15 -L "$URL" 2>/dev/null | grep -q 'react-refresh\|webpack-hmr\|__nextDevTools\|/_next/static/chunks/webpack.js\|turbopack-hmr'; then
  echo "!! $URL looks like a DEV server — Lighthouse performance will be wrong. Use a production build (next build && next start) or the deployed URL." | tee "$OUT/WARNING.txt"
fi

[ -n "$REPO" ] && bash "$HERE/code-scan.sh" "$REPO" > "$OUT/code-scan.txt" 2>&1 &
bash "$HERE/http-checks.sh" "$URL" > "$OUT/http.txt" 2>&1 &
( node "$HERE/pages.mjs" "$URL" ${RA[@]+"${RA[@]}"} --mode "$PAGES" > "$OUT/pages.json" 2> "$OUT/pages.err" \
  && node "$HERE/multi-page.mjs" "$OUT/pages.json" ${RA[@]+"${RA[@]}"} ${VA[@]+"${VA[@]}"} --out "$OUT" > /dev/null 2> "$OUT/multi-page.log" ) &
wait

if [ "$LH" = 1 ]; then
  bash "$HERE/lighthouse.sh" "$URL" mobile --runs "$RUNS" --out "$OUT" > "$OUT/lh-mobile.txt" 2>&1
  bash "$HERE/lighthouse.sh" "$URL" desktop --runs "$RUNS" --out "$OUT" > "$OUT/lh-desktop.txt" 2>&1
  rm -f "$OUT"/lh-*-run*.json  # keep only the small summaries
fi

# summary.json — the diffable record of this run
node -e '
const fs=require("fs"), o=process.argv[1], rd=(f)=>{try{return JSON.parse(fs.readFileSync(o+"/"+f,"utf8"))}catch{return null}};
const lh={}; for (const m of ["mobile","desktop"]) { const s=rd("lh-"+m+".json"); if (s) lh[m]={scores:s.scores,spread:s.spread,metrics:s.metrics,lcpElement:s.lcpElement,failing:s.failing.map(f=>({cat:f.cat,id:f.id,title:f.title,score:f.score}))}; }
const p=rd("pages-issues.json")||{pages:[],issues:[]}, pj=rd("pages.json")||{};
fs.writeFileSync(o+"/summary.json", JSON.stringify({date:new Date().toISOString().slice(0,16).replace("T"," "), url:process.argv[2], repo:process.argv[3]||null,
  pagesAudited:pj.pages||[], discoveryNotes:pj.notes||[], lighthouse:lh, pageSummary:p.pages, issues:p.issues.map(({key,id,sev,msg,pages,viewports,accepted})=>({key,id,sev,msg,pages,viewports,accepted}))}, null, 1));
' "$OUT" "$URL" "$REPO"

# baseline: explicit file, or "auto" = newest summary json in the repo report dir
if [ "$BASE" = auto ] && [ -n "$REPO" ]; then
  RD=$(node -e 'try{console.log(JSON.parse(require("fs").readFileSync(process.argv[1]+"/.site-audit.json","utf8")).reportDir||"docs/audit")}catch{console.log("docs/audit")}' "$REPO")
  BASE=$(ls -t "$REPO/$RD"/site-audit-*.json 2>/dev/null | head -1)
fi
[ -n "$BASE" ] && [ -f "$BASE" ] && node "$HERE/compare.mjs" "$BASE" "$OUT/summary.json" > "$OUT/compare.md"

echo "== site-audit run → $OUT  ($(( $(date +%s) - T0 ))s)"
[ -f "$OUT/WARNING.txt" ] && cat "$OUT/WARNING.txt"
for f in code-scan.txt http.txt pages.md lh-mobile.txt lh-desktop.txt compare.md summary.json; do
  [ -f "$OUT/$f" ] && printf '  %-16s %s lines\n' "$f" "$(wc -l < "$OUT/$f" | tr -d ' ')"
done
node -e 'const p=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log("  pages audited:",p.pages.length,"| notes:",p.notes.join("; ")||"-")' "$OUT/pages.json" 2>/dev/null || { echo "  page discovery failed:"; head -5 "$OUT/pages.err" "$OUT/multi-page.log" 2>/dev/null; }
for m in mobile desktop; do [ -f "$OUT/lh-$m.txt" ] && echo "  LH $m: $(sed -n 2p "$OUT/lh-$m.txt")"; done
exit 0
