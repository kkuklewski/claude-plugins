#!/usr/bin/env node
// Summarise 1..N Lighthouse JSON reports: pick the median run (by Performance), print scores (+ spread),
// metrics, and failing audits WITH the elements behind them; write a small diffable summary JSON.
// Usage: lh-summary.mjs <mode> <out.json> <run1.json> [run2.json ...]
import { readFileSync, writeFileSync } from 'node:fs';

const [mode, outFile, ...files] = process.argv.slice(2);
const runs = files.map((f) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; } }).filter((r) => r && r.categories);
if (!runs.length) { console.log('no usable Lighthouse runs'); process.exit(1); }
const perf = (r) => r.categories.performance?.score ?? 0;
const sorted = [...runs].sort((a, b) => perf(a) - perf(b));
const r = sorted[Math.floor((sorted.length - 1) / 2)];
const a = r.audits;

const scores = Object.fromEntries(Object.entries(r.categories).map(([k, c]) => [k, Math.round(c.score * 100)]));
const spread = Object.fromEntries(Object.keys(r.categories).map((k) => {
  const v = runs.map((x) => Math.round((x.categories[k]?.score ?? 0) * 100));
  return [k, [Math.min(...v), Math.max(...v)]];
}));
const metricIds = { FCP: 'first-contentful-paint', LCP: 'largest-contentful-paint', TBT: 'total-blocking-time', CLS: 'cumulative-layout-shift', SI: 'speed-index', TTFB: 'server-response-time' };
const metrics = Object.fromEntries(Object.entries(metricIds).map(([k, id]) => [k, a[id]?.numericValue != null ? +a[id].numericValue.toFixed(k === 'CLS' ? 3 : 0) : null]));

const nodesOf = (au) => {
  const out = [];
  const walk = (x) => {
    if (!x || typeof x !== 'object') return;
    if (x.type === 'node' && (x.selector || x.snippet)) { out.push(`${x.selector || ''} ${x.snippet ? '— ' + x.snippet.slice(0, 90) : ''}`.trim()); return; }
    for (const v of Array.isArray(x) ? x : Object.values(x)) walk(v);
  };
  walk(au.details);
  return [...new Set(out)].slice(0, 4);
};
const lcpNode = nodesOf(a['lcp-breakdown-insight'] || a['largest-contentful-paint-element'] || {})[0] || null;

const failing = [];
for (const [cat, c] of Object.entries(r.categories)) {
  for (const ref of c.auditRefs) {
    const x = a[ref.id];
    if (!x || x.score === null || x.score >= 0.9 || ['informative', 'notApplicable', 'manual'].includes(x.scoreDisplayMode)) continue;
    if (cat === 'performance' && ref.group === 'metrics') continue; // metrics shown separately
    failing.push({ cat, id: ref.id, title: x.title, score: Math.round(x.score * 100), value: x.displayValue || null, weight: ref.weight || 0, nodes: nodesOf(x) });
  }
}
failing.sort((p, q) => p.cat.localeCompare(q.cat) || q.weight - p.weight || p.score - q.score);

const summary = { url: r.finalDisplayedUrl, mode, lighthouse: r.lighthouseVersion, fetchTime: r.fetchTime, runs: runs.length, scores, spread, metrics, lcpElement: lcpNode, failing };
writeFileSync(outFile, JSON.stringify(summary, null, 1));

const fmt = (k, v) => v == null ? '-' : k === 'CLS' ? v : v >= 1000 ? (v / 1000).toFixed(1) + ' s' : v + ' ms';
console.log(`== Lighthouse ${mode} — ${summary.url} (lh ${summary.lighthouse}, median of ${runs.length})`);
console.log(Object.entries(scores).map(([k, v]) => `${k} ${v}${spread[k][0] !== spread[k][1] ? ` (${spread[k][0]}–${spread[k][1]})` : ''}`).join(' | '));
console.log(Object.entries(metrics).map(([k, v]) => `${k} ${fmt(k, v)}`).join(' | '));
if (lcpNode) console.log(`LCP element: ${lcpNode}`);
let cat = '';
for (const f of failing) {
  if (f.cat !== cat) { cat = f.cat; console.log(`[${cat}]`); }
  console.log(`  ${String(f.score).padStart(3)}  ${f.title}${f.value ? `  (${f.value})` : ''}`);
  for (const n of f.nodes.slice(0, cat === 'performance' ? 1 : 3)) console.log(`         ↳ ${n}`);
}
console.log(`summary: ${outFile}`);
