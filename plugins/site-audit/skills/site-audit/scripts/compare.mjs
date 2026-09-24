#!/usr/bin/env node
// Before/after diff of two summary.json files written by run-all.sh (for --recheck).
// Usage: compare.mjs <baseline-summary.json> <current-summary.json>   → markdown on stdout
import { readFileSync } from 'node:fs';
const [bf, cf] = process.argv.slice(2);
if (!bf || !cf) { console.error('usage: compare.mjs <baseline.json> <current.json>'); process.exit(1); }
const B = JSON.parse(readFileSync(bf, 'utf8')), C = JSON.parse(readFileSync(cf, 'utf8'));
const out = [`## Before → after (${B.date} → ${C.date})`, ''];
const arrow = (b, c, higherBetter = true) => b == null || c == null ? '' : c === b ? '=' : (c > b) === higherBetter ? '▲' : '▼';
for (const mode of ['mobile', 'desktop']) {
  const b = B.lighthouse?.[mode], c = C.lighthouse?.[mode];
  if (!b && !c) continue;
  out.push(`**Lighthouse ${mode}**`, '', '| | before | after | |', '|---|---|---|---|');
  for (const k of Object.keys({ ...b?.scores, ...c?.scores })) out.push(`| ${k} | ${b?.scores?.[k] ?? '-'} | ${c?.scores?.[k] ?? '-'} | ${arrow(b?.scores?.[k], c?.scores?.[k])} |`);
  for (const k of Object.keys({ ...b?.metrics, ...c?.metrics })) out.push(`| ${k} | ${b?.metrics?.[k] ?? '-'} | ${c?.metrics?.[k] ?? '-'} | ${arrow(b?.metrics?.[k], c?.metrics?.[k], false)} |`);
  out.push('');
}
const idx = (S) => new Map((S.issues || []).map((i) => [i.key || i.id + '|' + i.msg, i]));
const bi = idx(B), ci = idx(C);
const fixed = [...bi].filter(([k]) => !ci.has(k)).map(([, i]) => i);
const added = [...ci].filter(([k]) => !bi.has(k)).map(([, i]) => i);
const open = [...ci].filter(([k]) => bi.has(k)).map(([, i]) => i);
const row = (i) => `| ${i.id} | ${i.accepted ? 'accepted' : i.sev} | ${i.msg} | ${(i.pages || []).length} |`;
out.push(`**Page issues:** ✅ ${fixed.length} fixed · 🆕 ${added.length} new · ⏳ ${open.length} still open`, '');
for (const [title, list] of [['✅ Fixed', fixed], ['🆕 New (regressions?)', added], ['⏳ Still open', open]]) {
  if (!list.length) continue;
  out.push(`### ${title}`, '', '| # | Sev | Issue | Pages |', '|---|---|---|---|', ...list.map(row), '');
}
console.log(out.join('\n'));
