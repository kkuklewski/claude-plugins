#!/usr/bin/env bash
# Smoke test: render one still from the bundled example and check it is a 1080x1920 PNG.
# Usage: bash tests/run.sh   (needs Node + playwright with Chromium; skips otherwise)
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; S="$HERE/../skills/reel"
OUT=$(mktemp -d); trap 'rm -rf "$OUT"' EXIT
cp "$S/examples/website-audit.json" "$OUT/example.json"
if ! node -e 'import("playwright").catch(()=>require(require("path").join(require("child_process").execSync("npm root -g").toString().trim(),"playwright")))' >/dev/null 2>&1; then
  echo "SKIP — playwright not installed"; exit 0; fi
PNG=$(node "$S/scripts/render.mjs" "$OUT/example.json" --still 4.5 2>&1) || { echo "FAIL: render.mjs crashed: $PNG"; exit 1; }
node -e '
const b=require("fs").readFileSync(process.argv[1]);
const w=b.readUInt32BE(16), h=b.readUInt32BE(20);
if(w!==1080||h!==1920){console.log("FAIL: still is "+w+"x"+h);process.exit(1)}
console.log("PASS — rendered 1080x1920 still")' "$PNG"
