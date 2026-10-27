#!/usr/bin/env bash
# Integration check against the free DataForSEO Sandbox: every request body the plugin sends goes through the same
# validation as production (required fields, filter paths, operators, sorting), but the data is sample data and
# nothing is billed. Also checks our filter paths against the free Available Filters list of the live API.
# Opt-in, needs your own API credentials in the environment (never pass them as arguments):
#   read -rs DATAFORSEO_PASSWORD && DATAFORSEO_LOGIN=you@example.com DATAFORSEO_PASSWORD="$DATAFORSEO_PASSWORD" bash tests/sandbox.sh; unset DATAFORSEO_PASSWORD
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; SRV="$HERE/../server"
[ -n "${DATAFORSEO_LOGIN:-}" ] && [ -n "${DATAFORSEO_PASSWORD:-}" ] || { echo "SKIP sandbox — set DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD"; exit 0; }
DATAFORSEO_API_BASE=https://sandbox.dataforseo.com/v3 node --input-type=module -e '
const lib = await import(process.argv[1] + "/lib.mjs");
const { DATAFORSEO_LOGIN: l, DATAFORSEO_PASSWORD: p } = process.env;
const loc = { location_code: 2276, language_code: "de" };
const DOWN = [["ranked_serp_element.serp_item.rank_changes.is_down", "=", true]];
const checks = [
  ["ranked_keywords (competitor_gap)", () => lib.dfsRankedKeywords(l, p, "example.com", { ...loc, limit: 5 })],
  ["ranked_keywords lost mode, page target", () => lib.dfsRankedKeywords(l, p, lib.labsTarget("example.com/blog/post").target, { ...loc, mode: "lost", limit: 5, detail: true })],
  ["ranked_keywords is_down filter", () => lib.dfsRankedKeywords(l, p, "example.com", { ...loc, limit: 5, detail: true, filters: DOWN })],
  ["keyword_cluster (ideas + related + suggestions)", async () => { const r = await lib.dfsKeywordCluster(l, p, ["pflegegrad"], { ...loc, limit: 5 }); if (Object.keys(r.errors).length) throw new Error(JSON.stringify(r.errors)); return r; }],
  ["keyword_overview", () => lib.dfsSearchVolume(l, p, ["pflegegrad"], loc)],
  ["serp organic", () => lib.dfsSerp(l, p, "pflegegrad", loc)],
];
let failed = 0;
for (const [name, run] of checks) {
  try { await run(); console.log("PASS sandbox", name); }
  catch (e) { failed++; console.log("FAIL sandbox", name, "—", e.message); }
}
process.exit(failed ? 1 : 0);
' "$SRV" || exit 1

# Filter and sort paths we send, checked against the live Available Filters list (free endpoint).
node --input-type=module -e '
const auth = "Basic " + Buffer.from(process.env.DATAFORSEO_LOGIN + ":" + process.env.DATAFORSEO_PASSWORD).toString("base64");
const body = await (await fetch("https://api.dataforseo.com/v3/dataforseo_labs/available_filters", { headers: { authorization: auth } })).json();
const all = body.tasks?.[0]?.result?.[0];
if (!all) { console.log("FAIL available filters:", body.status_message || body.tasks?.[0]?.status_message); process.exit(1); }
const find = (ep) => all[ep]?.google; // result[0].<endpoint>.<engine>.<field path> = type
const want = {
  ranked_keywords: ["ranked_serp_element.serp_item.rank_group", "ranked_serp_element.serp_item.rank_changes.is_down", "keyword_data.keyword_info.search_volume"],
  keyword_ideas: ["keyword_info.search_volume"],
  keyword_suggestions: ["keyword_info.search_volume"],
  related_keywords: ["keyword_data.keyword_info.search_volume"],
};
const fail = [];
for (const [ep, paths] of Object.entries(want)) {
  const fields = find(ep);
  if (!fields) { fail.push(ep + ": endpoint not in list"); continue; }
  for (const f of paths) if (!(f in fields)) fail.push(ep + ": " + f);
}
if (fail.length) { console.log("FAIL available filters:", fail.join("; ")); process.exit(1); }
console.log("PASS available filters — " + Object.values(want).flat().length + " paths");
' || exit 1
