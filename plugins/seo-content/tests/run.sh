#!/usr/bin/env bash
# Regression test: opportunity analysis on fixture rows + MCP server handshake and setup messages.
# No network, no credentials. Usage: bash tests/run.sh   (needs Node >= 22)
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; SRV="$HERE/../server"
node --input-type=module -e '
const { analyze, competitorGap, expectedCtr } = await import(process.argv[1] + "/analyze.mjs");
const r = (query, page, impressions, clicks, position) => ({ query, page, impressions, clicks, ctr: clicks / impressions, position });
const rows = [
  r("acme login", "/login", 900, 400, 1.1),            // brand → excluded
  r("running shoes for flat feet", "/shoes", 800, 10, 8.2),  // striking distance
  r("trail running shoes", "/trail", 600, 5, 2.1),      // low CTR at a good position
  r("marathon plan", "/plan-a", 300, 10, 6), r("marathon plan", "/plan-b", 250, 8, 7),  // cannibalisation
  r("how to lace running shoes", "/shoes", 120, 0, 34), // content gap, question
  r("shoe sizes chart", "/sizes", 60, 0, 28),           // content gap
];
const pagesNow = [{ page: "/old", clicks: 10, position: 9 }, { page: "/shoes", clicks: 50, position: 8 }];
const pagesPrev = [{ page: "/old", clicks: 100, position: 4 }, { page: "/shoes", clicks: 55, position: 8 }, { page: "/gone", clicks: 40, position: 5 }];
const a = analyze({ rows, pagesNow, pagesPrev }, { brandTerms: ["acme"], minImpressions: 50 });
const fail = [];
const ok = (c, m) => c || fail.push(m);
ok(a.summary.nonBrandRows === 6, "brand rows not excluded");
ok(a.strikingDistance[0]?.query === "running shoes for flat feet", "striking distance");
ok(!a.strikingDistance.some((x) => x.position < 4.5), "striking distance includes top positions");
ok(a.lowCtr[0]?.query === "trail running shoes", "low CTR");
ok(a.cannibalisation[0]?.query === "marathon plan" && a.cannibalisation[0].pages.length === 2, "cannibalisation");
ok(a.contentGaps[0]?.query === "how to lace running shoes" && a.contentGaps[0].question, "question gap first");
ok(a.contentGaps.some((g) => g.query === "shoe sizes chart" && !g.question), "non-question gap");
ok(a.decay.map((d) => d.page).join() === "/old,/gone", "decay: " + a.decay.map((d) => d.page));
ok(expectedCtr(1) > expectedCtr(5) && expectedCtr(15) > expectedCtr(40), "ctr curve");
const gap = competitorGap([
  { competitor: "a.com", items: [{ keyword: "Best Trail Shoes", volume: 900, position: 3 }, { keyword: "running shoes for flat feet", volume: 500, position: 2 }] },
  { competitor: "b.com", items: [{ keyword: "best trail shoes", volume: 900, position: 5 }, { keyword: "how to lace running shoes", volume: 300, position: 4 }] },
], rows);
ok(gap[0]?.keyword === "Best Trail Shoes" && gap[0].competitors.length === 2, "gap shared keyword first");
ok(!gap.some((g) => g.keyword === "running shoes for flat feet"), "gap keeps keyword we already rank top-20 for");
ok(gap.some((g) => g.keyword === "how to lace running shoes" && g.yourPosition === 34), "gap keeps keyword we rank beyond 20");
if (fail.length) { console.log("FAIL analyze:", fail.join("; ")); process.exit(1); }
console.log("PASS analyze — 12 checks");
' "$SRV" || exit 1

# Term plan on fixture pages (Polish inflection must merge; stop words and one-page terms must not appear).
node --input-type=module -e '
const { termPlan, parseMarkdown, fromContentParsing, stem, scoreSavedPlan } = await import(process.argv[1] + "/terms.mjs");
const filler = (n) => Array.from({ length: n }, (_, i) => "słowo" + i).join(" ");
const page = (url, body, heads) => ({ url, headings: heads.map(([level, text]) => ({ level, text })), text: body + " " + filler(200) });
const pages = [
  page("https://a.pl", "Catering dietetyczny dla firm w Szczecinie. Cateringu dietetycznego szukają pracownicy. Zawsze świeże posiłki.", [[1, "Catering dla firm"], [2, "Ile kosztuje catering dietetyczny?"]]),
  page("https://b.pl", "Nasz catering dietetyczny dowozimy do biura. Posiłki dla pracowników i faktura dla firmy.", [[2, "Catering dietetyczny do biura"]]),
  page("https://c.pl", "Catering dietetyczny w pracy: posiłek regeneracyjny i faktura VAT.", [[2, "Faktura za catering"]]),
  { url: "https://empty.pl", headings: [], text: "za mało" },
];
const md = "---\ntitle: x\n---\n# Catering dla firm\n\nCatering dietetyczny do biura [VERIFY: catering catering catering], faktura dla firmy. " + filler(300) + "\n\n---\n## Review checklist (delete before publishing)\n- [ ] catering catering catering";
const p = termPlan(pages, { keyword: "catering dietetyczny", lang: "pl", paa: ["Czy catering można wliczyć w koszty?"], draft: parseMarkdown(md) });
const fail = []; const ok = (c, m) => c || fail.push(m);
const t = (x) => p.terms.find((y) => y.term === x);
ok(stem("dietetycznego") === stem("dietetyczny"), "stemmer merges inflection");
ok(t("catering dietetyczny")?.pages === "3/3", "phrase across inflected forms: " + JSON.stringify(t("catering dietetyczny")));
ok(!p.terms.some((x) => /^(zawsze|nasz|dla)$/.test(x.term)), "stop words kept");
ok(!t("posiłek regeneracyjny"), "one-page phrase kept");
ok(p.skipped.length === 1 && p.competitors.length === 3, "thin page not skipped");
ok(p.keyword.pagesUsingExact === 3, "keyword usage");
ok(p.questions[0].source === "people-also-ask" && p.questions.some((q) => q.q.startsWith("Ile kosztuje")), "questions");
ok(p.draftScore && p.draftScore.keywordInH1 === false && p.draftScore.score > 0 && p.draftScore.score <= 100, "draft score " + JSON.stringify(p.draftScore));
ok(parseMarkdown(md).text.split("catering").length < 6, "review checklist excluded from draft");
const h1 = termPlan(pages, { keyword: "catering dla firm", lang: "pl", draft: parseMarkdown("# Catering w Szczecinie dla firm\\n" + filler(300)) });
ok(h1.draftScore.keywordInH1 === false, "H1 keyword needs the words in order");
ok(termPlan(pages, { keyword: "catering firm", lang: "pl", draft: parseMarkdown("# Catering dla firm\\n" + filler(300)) }).draftScore.keywordInH1, "H1 keyword ignores stop words between");
const saved = JSON.parse(JSON.stringify(p));
const again = scoreSavedPlan(saved, parseMarkdown(md));
ok(again.score === p.draftScore.score && again.terms === p.draftScore.terms, "saved plan scores the same as the live plan");
ok(termPlan(pages.slice(0, 2), {}).error, "fewer than 3 pages → error");
const cp = fromContentParsing({ header: { primary_content: [{ text: "MENU" }] }, main_topic: [{ h_title: "Tytuł", level: 1, primary_content: [{ text: "Treść" }] }], secondary_topic: [{ h_title: "Sidebar", level: 3 }] });
ok(cp.headings.length === 1 && !cp.text.includes("MENU") && !cp.text.includes("Sidebar"), "content parsing keeps main topic only");
if (fail.length) { console.log("FAIL terms:", fail.join("; ")); process.exit(1); }
console.log("PASS term plan — 14 checks");
' "$SRV" || exit 1

# MCP handshake: initialize → tools/list → setup_check with no key, then with a non-service-account file.
BAD=$(mktemp -d)/bad.json; echo '{"type":"authorized_user"}' > "$BAD"; trap 'rm -rf "$(dirname "$BAD")"' EXIT
mcp() {
  printf '%s\n' \
    '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"t","version":"0"}}}' \
    '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
    '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
    '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"setup_check","arguments":{}}}' \
    '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"serp_snapshot","arguments":{"keyword":"x"}}}' \
  | env -i PATH="$PATH" "$@" node "$SRV/mcp.mjs" & PID=$!
  sleep 1.5; kill $PID 2>/dev/null; wait $PID 2>/dev/null
}
node -e '
const lines = require("fs").readFileSync(0, "utf8").trim().split("\n").map(JSON.parse);
const by = Object.fromEntries(lines.map((l) => [l.id, l]));
const fail = [];
const ok = (c, m) => c || fail.push(m);
ok(by[1]?.result?.serverInfo?.name === "seo-content", "initialize");
ok(by[2]?.result?.tools?.length === 9, "tools/list count " + by[2]?.result?.tools?.length);
const setup = JSON.parse(by[3]?.result?.content?.[0]?.text || "{}");
ok(setup.google?.status === "missing" && /plugin/.test(setup.google.fix), "setup_check google missing + fix");
ok(setup.dataforseo?.status === "off", "setup_check dataforseo off");
ok(by[4]?.result?.isError && /SETUP NEEDED: DataForSEO/.test(by[4].result.content[0].text), "paid tool without creds → setup message");
ok(!lines.some((l) => l.id === undefined), "no stray output");
if (fail.length) { console.log("FAIL mcp (no key):", fail.join("; ")); process.exit(1); }
console.log("PASS mcp handshake, no-credentials setup messages");
' < <(mcp) || exit 1
node -e '
const lines = require("fs").readFileSync(0, "utf8").trim().split("\n").map(JSON.parse);
const setup = JSON.parse(lines.find((l) => l.id === 3).result.content[0].text);
if (setup.google?.status !== "missing" || !/not a service-account/.test(setup.google.error)) { console.log("FAIL mcp (wrong key type):", JSON.stringify(setup.google)); process.exit(1); }
console.log("PASS wrong key type is explained");
' < <(mcp SEO_GOOGLE_KEY_FILE="$BAD" DATAFORSEO_LOGIN='${user_config.dataforseo_login}') || exit 1

# Per-client key: the keyFile argument wins over the plugin default, and a non-JSON file never leaks its content.
LEAK=$(mktemp -d)/secret.json; echo 'TOPSECRET-CONTENT not json' > "$LEAK"
node -e '
const lines = require("fs").readFileSync(0, "utf8").trim().split("\n").map(JSON.parse);
const g = (id) => JSON.parse(lines.find((l) => l.id === id).result.content[0].text).google;
const fail = [];
if (!/\/nope\/client\.json/.test(g(1).error)) fail.push("keyFile arg ignored: " + g(1).error);
if (g(2).status !== "missing" || JSON.stringify(g(2)).includes("TOPSECRET")) fail.push("key content leaked or wrong status");
if (!/\.json/.test(g(3).error)) fail.push("non-.json path accepted");
if (fail.length) { console.log("FAIL per-client key:", fail.join("; ")); process.exit(1); }
console.log("PASS per-client keyFile overrides default, no content leak");
' < <(printf '%s\n' \
  "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"setup_check\",\"arguments\":{\"keyFile\":\"/nope/client.json\"}}}" \
  "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"setup_check\",\"arguments\":{\"keyFile\":\"$LEAK\"}}}" \
  "{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"tools/call\",\"params\":{\"name\":\"setup_check\",\"arguments\":{\"keyFile\":\"/etc/hosts\"}}}" \
  | env -i PATH="$PATH" SEO_GOOGLE_KEY_FILE="$BAD" node "$SRV/mcp.mjs" & P=$!; sleep 1.5; kill $P 2>/dev/null; wait $P 2>/dev/null) || { rm -rf "$(dirname "$LEAK")"; exit 1; }
rm -rf "$(dirname "$LEAK")"
