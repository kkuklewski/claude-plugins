#!/usr/bin/env bash
# Scaffold plugins/<name> from templates/plugin-skeleton and add it to the marketplace catalog.
# Usage: scripts/new-plugin.sh <kebab-name> "<one-line description>" [category]
set -euo pipefail
NAME="${1:?usage: new-plugin.sh <kebab-name> \"<description>\" [category]}"; DESC="${2:?description required}"; CAT="${3:-productivity}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; DEST="$ROOT/plugins/$NAME"
[[ "$NAME" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]] || { echo "name must be kebab-case"; exit 1; }
[ -e "$DEST" ] && { echo "$DEST already exists"; exit 1; }
cp -R "$ROOT/templates/plugin-skeleton" "$DEST"
mv "$DEST/skills/__NAME__" "$DEST/skills/$NAME"
find "$DEST" -type f -exec sed -i.bak -e "s|__NAME__|$NAME|g" -e "s|__DESCRIPTION__|${DESC//|/\\|}|g" {} \; -exec rm -f {}.bak \;
node -e '
const fs=require("fs"),f=process.argv[1],m=JSON.parse(fs.readFileSync(f,"utf8"));
m.plugins.push({name:process.argv[2],source:"./plugins/"+process.argv[2],description:process.argv[3],version:"0.1.0",category:process.argv[4],tags:[]});
fs.writeFileSync(f,JSON.stringify(m,null,2)+"\n")' "$ROOT/.claude-plugin/marketplace.json" "$NAME" "$DESC" "$CAT"
echo "created $DEST and registered it in .claude-plugin/marketplace.json"
echo "next: edit plugins/$NAME/skills/$NAME/SKILL.md, add a row to README.md, run scripts/validate.sh"
