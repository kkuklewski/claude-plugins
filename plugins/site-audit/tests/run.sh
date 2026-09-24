#!/usr/bin/env bash
# Regression test: audit two fixture pages headlessly and assert which checklist IDs fire.
# Usage: bash tests/run.sh   (needs Node >= 22 + Chrome)
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; S="$HERE/../skills/site-audit/scripts"
OUT=$(mktemp -d); PORT=$((20000 + RANDOM % 20000))
node -e 'const h=require("http"),fs=require("fs"),p=require("path");h.createServer((q,r)=>{const f=p.join(process.argv[1],q.url.split("?")[0]);fs.readFile(f,(e,d)=>{r.writeHead(e?404:200,{"content-type":"text/html"});r.end(e?"":d)})}).listen(+process.argv[2])' "$HERE/fixtures" "$PORT" & SRV=$!
trap '{ kill $SRV; wait $SRV; } 2>/dev/null; rm -rf "$OUT"' EXIT
sleep 0.5
node "$S/multi-page.mjs" "http://localhost:$PORT/bad.html" "http://localhost:$PORT/good.html" --viewports 375 --out "$OUT" >/dev/null 2>&1 || { echo "FAIL: multi-page.mjs crashed"; exit 1; }
node -e '
const {issues}=JSON.parse(require("fs").readFileSync(process.argv[1]+"/pages-issues.json","utf8"));
const on=(page)=>new Set(issues.filter(i=>i.pages.includes(page)).map(i=>i.id));
const bad=on("/bad.html"), good=on("/good.html");
const mustFire=["1.12","2.3","2.8","2.9","1.14","2.10","3.7","5.6","5.8","5.9","5.10","5.3","4.4"];
const mustNotFireOnGood=["1.12","2.2","2.3","2.8","2.9","1.14","5.3","5.6","5.8","5.9","5.10","4.4"];
let fail=0;
for(const id of mustFire) if(!bad.has(id)){console.log("FAIL bad.html: expected",id);fail++}
for(const id of mustNotFireOnGood) if(good.has(id)){console.log("FAIL good.html: unexpected",id,issues.find(i=>i.id===id&&i.pages.includes("/good.html")).msg);fail++}
console.log(fail?`${fail} failure(s)`:`PASS — bad.html fired ${bad.size} checks, good.html clean on ${mustNotFireOnGood.length} checks`);
process.exit(fail?1:0)' "$OUT"
