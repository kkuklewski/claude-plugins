#!/usr/bin/env bash
# Validate the marketplace catalog, every local plugin, catalog↔manifest version agreement,
# portable skill paths, and run each plugin's tests/run.sh if present.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"; FAIL=0
claude plugin validate . >/dev/null 2>&1 && echo "✔ marketplace.json" || { echo "✘ marketplace.json"; claude plugin validate .; FAIL=1; }
for P in plugins/*/; do
  N=$(basename "$P")
  claude plugin validate "$P" >/dev/null 2>&1 && echo "✔ $N manifest" || { echo "✘ $N manifest"; claude plugin validate "$P"; FAIL=1; }
  node -e '
const fs=require("fs"),n=process.argv[1];const m=JSON.parse(fs.readFileSync(".claude-plugin/marketplace.json","utf8"));
const p=JSON.parse(fs.readFileSync("plugins/"+n+"/.claude-plugin/plugin.json","utf8"));const e=m.plugins.find(x=>x.name===n);
if(!e){console.log("✘ "+n+" not listed in marketplace.json");process.exit(1)}
if(e.version&&e.version!==p.version){console.log("✘ "+n+" version mismatch: catalog "+e.version+" vs plugin "+p.version);process.exit(1)}' "$N" || FAIL=1
  if grep -rnE '(bash|node|cat|source) +~/.claude/skills|/Users/' "$P/skills" >/dev/null 2>&1; then echo "✘ $N: hard-coded local paths:"; grep -rnE '(bash|node|cat|source) +~/.claude/skills|/Users/' "$P/skills" | head -5; FAIL=1; fi
  if [ -f "$P/tests/run.sh" ]; then bash "$P/tests/run.sh" | sed "s/^/  $N tests: /" || FAIL=1; fi
done
[ $FAIL = 0 ] && echo "all good" || { echo "validation failed"; exit 1; }
