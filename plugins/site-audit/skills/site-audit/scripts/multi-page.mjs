#!/usr/bin/env node
// Run dom-audit.js on many pages × viewports in headless Chrome (CDP, no deps), map raw results to
// checklist issues, apply accepted exceptions, and aggregate per issue across pages (so a layout-level
// bug shows once with the pages it affects, not N times).
// Usage: multi-page.mjs <pages.json | url...> [--repo <path>] [--out <dir>] [--viewports 375,1440]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome, loadConfig, acceptedFor, sleep } from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const repo = opt('--repo', null);
const out = opt('--out', null);
const cfg = loadConfig(repo);
const viewports = (opt('--viewports', null) || (cfg.viewports || [375, 1440]).join(',')).split(',').map(Number);
const src = args.filter((a, i) => !a.startsWith('--') && !['--repo', '--out', '--viewports'].includes(args[i - 1]));
let pages = [];
for (const s of src) {
  if (/^https?:/.test(s)) pages.push({ url: s, route: new URL(s).pathname });
  else if (existsSync(s)) pages.push(...JSON.parse(readFileSync(s, 'utf8')).pages);
}
if (!pages.length) { console.error('usage: multi-page.mjs <pages.json | url...> [--repo p] [--out dir] [--viewports 375,1440]'); process.exit(1); }
const AUDIT = readFileSync(join(here, 'dom-audit.js'), 'utf8');

// ---- raw report → checklist issues [{id, sev, msg, n?}]
function issuesOf(r, vw) {
  const I = [];
  const add = (id, sev, msg, items) => I.push({ id, sev, msg, items: items?.slice?.(0, 5) });
  const mobile = vw < 768;
  const { seo, headings: h, landmarks: l, images: im, perf: p, fonts: f, css, links: ln, a11y: a, responsive: rs, privacy: pv } = r;
  if (!seo.lang) add('1.12', 'C', '<html> has no lang');
  if (!seo.title) add('2.2', 'C', 'missing <title>');
  else if (seo.titleLength > 60 || seo.titleLength < 10) add('2.2', 'M', `title length ${seo.titleLength} (aim 10–60)`);
  if (!seo.description) add('2.3', 'C', 'missing meta description');
  else if (seo.descriptionLength < 70 || seo.descriptionLength > 160) add('2.3', 'M', `description length ${seo.descriptionLength} (aim 70–160)`);
  if (/noindex/i.test(seo.robotsMeta || '')) add('2.4', 'I', `robots meta "${seo.robotsMeta}" — intended?`);
  if (!seo.canonical) add('2.7', 'I', 'no canonical link');
  if (!seo.ogImage) add('2.7', 'M', 'no og:image');
  if (!seo.favicon.length) add('1.11', 'M', 'no favicon link');
  if (seo.isDevBuild) add('1.8', 'I', 'dev build detected — perf numbers not representative');
  if (h.h1.length !== 1) add('2.8', 'C', `${h.h1.length} <h1> elements`, h.h1);
  if (h.skippedLevels.length) add('2.9', 'C', 'skipped heading levels', h.skippedLevels);
  if (l.main !== 1) add('1.14', 'C', `${l.main} <main> landmarks`);
  if (!l.header) add('1.14', 'I', 'no <header>/banner landmark');
  if (!l.footer) add('1.14', 'I', 'no <footer>/contentinfo landmark');
  if (l.navWithoutLabelWhenMultiple) add('1.14', 'M', `${l.navWithoutLabelWhenMultiple} <nav> without aria-label (page has several)`);
  if (l.clickableDivs.count) add('1.14', 'I', 'clickable non-interactive elements', l.clickableDivs.items);
  if (im.missingAlt.count) add('2.10', 'I', `${im.missingAlt.count} images without alt`, im.missingAlt.items);
  if (im.missingDimensions.count) add('3.7', 'I', `${im.missingDimensions.count} images without width/height`, im.missingDimensions.items);
  if (im.fillWithoutSizes.count) add('3.7', 'M', `${im.fillWithoutSizes.count} <Image fill> without sizes`, im.fillWithoutSizes.items);
  if (im.notOptimized.count) add('3.6', 'I', `${im.notOptimized.count} images not served via next/image / modern format`, im.notOptimized.items);
  if (im.oversized.count) add('3.6', 'M', `${im.oversized.count} oversized images`, im.oversized.items);
  if (im.lazyAboveFold.count) add('3.3', 'I', `${im.lazyAboveFold.count} lazy images above the fold`, im.lazyAboveFold.items);
  if (p.lcpImageLazy) add('3.3', 'C', `LCP image is loading="lazy" (${p.lcpElement})`);
  if (p.htmlKB > 60) add('3.1', 'I', `HTML is ${p.htmlKB} KB compressed / ${p.htmlDecodedKB} KB raw — check inlined CSS/RSC payload`);
  if (p.rscPrefetches > 20) add('3.5', 'M', `${p.rscPrefetches} RSC prefetch requests on load — consider prefetch={false} on low-value links`);
  if (r.scripts.blockingInHead.length) add('1.4', 'I', 'render-blocking scripts in <head>', r.scripts.blockingInHead);
  if (f.googleFontsLinks.length) add('1.10', 'I', 'Google Fonts loaded via <link> (use next/font)', f.googleFontsLinks);
  if (css.rootFontSizePx) add('5.7', 'C', `html/:root font-size set in px (${css.rootFontSizePx}) — overrides user setting`);
  if (css.pxFontSizeRules.count) add('1.2', 'M', `${css.pxFontSizeRules.count} CSS rules with px font-size (heuristic)`, css.pxFontSizeRules.items);
  if (a.focusCheck?.noVisibleFocus.count) add('5.1', 'C', `${a.focusCheck.noVisibleFocus.count} focusable elements show no visible change on keyboard focus`, a.focusCheck.noVisibleFocus.items);
  if (ln.blankWithoutNoopener.count) add('2.11', 'M', 'target=_blank without rel=noopener', ln.blankWithoutNoopener.items);
  if (ln.emptyHref.count) add('5.8', 'M', 'links with empty/# href', ln.emptyHref.items);
  if (a.unnamedInteractive.count) add('5.8', 'I', `${a.unnamedInteractive.count} buttons/links without accessible name`, a.unnamedInteractive.items);
  if (a.unlabelledFields.count) add('5.9', 'I', `${a.unlabelledFields.count} form fields without label`, a.unlabelledFields.items);
  if (!a.skipLink.looksLikeSkipLink || !a.skipLink.targetExists) add('5.3', 'I', `no working skip link (first focusable: ${a.skipLink.firstFocusable})`);
  if (a.widgets.ariaHiddenFocusable.count) add('5.10', 'C', 'focusable elements inside aria-hidden', a.widgets.ariaHiddenFocusable.items);
  if (a.widgets.positiveTabindex.count) add('5.10', 'M', 'positive tabindex', a.widgets.positiveTabindex.items);
  for (const c of a.contrast.fails) add('5.6', 'C', `contrast ${c.ratio}:1 — ${c.pair}${c.suggestFg ? ` → try ${c.suggestFg}` : ''} (${c.count}×)`, c.examples);
  if (rs.horizontalScroll) add(mobile ? '4.4' : '4.1', 'C', `horizontal scroll at ${rs.viewportWidth}px`, rs.overflowingElements.items);
  if (mobile && rs.smallTapTargets.count) add('4.4', 'I', `${rs.smallTapTargets.count} tap targets < 24px`, rs.smallTapTargets.items);
  if (pv.trackingCookiesPresent.length) add('6.1', 'I', `tracking cookies set before any consent: ${pv.trackingCookiesPresent.join(', ')}`);
  if (pv.trackersLoaded.length && !pv.consentToolDetected) add('6.1', 'I', 'trackers loaded, no consent tool detected', pv.trackersLoaded);
  if (r.consoleErrors?.length) add('1.16', 'M', `${r.consoleErrors.length} console errors`, r.consoleErrors);
  return I;
}

async function auditPage(chrome, url, width) {
  const tab = await chrome.newTab();
  const consoleErrors = [];
  tab.on((m) => {
    if (m.method === 'Runtime.exceptionThrown') consoleErrors.push(m.params.exceptionDetails?.exception?.description?.split('\n')[0] || m.params.exceptionDetails?.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') consoleErrors.push(m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 160));
  });
  try {
    await tab.send('Page.enable'); await tab.send('Runtime.enable');
    await tab.send('Network.enable'); await tab.send('Network.setCacheDisabled', { cacheDisabled: true }); // cold weights per page
    const mobile = width < 768;
    await tab.send('Emulation.setDeviceMetricsOverride', { width, height: mobile ? 812 : 900, deviceScaleFactor: mobile ? 2 : 1, mobile });
    if (mobile) await tab.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    const loaded = tab.waitFor('Page.loadEventFired', 30000);
    const nav = await tab.send('Page.navigate', { url });
    if (nav.errorText) throw new Error(nav.errorText);
    if (!(await loaded)) consoleErrors.push('load event did not fire within 30s');
    await sleep(800);
    // scroll through the page so lazy content renders, then back to top (screenshots-before-paint lesson)
    await tab.send('Runtime.evaluate', { awaitPromise: true, expression: `(async()=>{for(let y=0;y<document.body.scrollHeight;y+=innerHeight*0.8){scrollTo(0,y);await new Promise(r=>setTimeout(r,120));}scrollTo(0,0);await new Promise(r=>setTimeout(r,300));})()` });
    // one real Tab keypress: Chrome only lets programmatic focus match :focus-visible after keyboard input
    for (const type of ['keyDown', 'keyUp']) await tab.send('Input.dispatchKeyEvent', { type, key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    const res = await tab.send('Runtime.evaluate', { expression: AUDIT, awaitPromise: true, returnByValue: true, timeout: 30000 });
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
    return { ...res.result.value, consoleErrors: [...new Set(consoleErrors)].slice(0, 10) };
  } finally { await tab.close(); }
}

const chrome = await launchChrome();
const results = [];
try {
  // small pool: 3 tabs at once
  const jobs = pages.flatMap((p) => viewports.map((vw) => ({ ...p, vw })));
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(3, jobs.length) }, async () => {
    while (next < jobs.length) {
      const j = jobs[next++];
      try { const r = await auditPage(chrome, j.url, j.vw); results.push({ ...j, report: r, issues: issuesOf(r, j.vw) }); }
      catch (e) { results.push({ ...j, error: e.message, issues: [] }); }
      process.stderr.write(`  audited ${j.url} @${j.vw}\n`);
    }
  }));
} finally { chrome.close(); }

// ---- aggregate: same id+msg across pages/viewports → one row
const agg = new Map();
for (const r of results) for (const i of r.issues) {
  const key = i.id + '|' + (i.id === '5.6' ? i.msg.replace(/\(\d+×\)/, '') : i.msg.replace(/\d+(\.\d+)?/g, '#'));
  const a = agg.get(key) || { ...i, key, pages: new Set(), viewports: new Set(), variants: new Set() };
  a.pages.add(r.route || r.url); a.viewports.add(r.vw); a.variants.add(i.msg); agg.set(key, a);
  const acc = acceptedFor({ ...i, url: r.url }, cfg); if (acc) a.accepted = acc.reason || 'accepted';
}
const order = { C: 0, I: 1, M: 2 };
const rows = [...agg.values()].map((a) => ({ ...a, msg: a.variants.size > 1 ? [...a.variants].slice(0, 3).join(' · ') + (a.variants.size > 3 ? ' …' : '') : a.msg,
    variants: undefined, pages: [...a.pages], viewports: [...a.viewports].sort((x, y) => x - y) }))
  .sort((a, b) => !!a.accepted - !!b.accepted || order[a.sev] - order[b.sev] || b.pages.length - a.pages.length);

const pageSummary = results.map((r) => ({ url: r.url, route: r.route, vw: r.vw, error: r.error,
  counts: r.issues.reduce((c, i) => (c[i.sev] = (c[i.sev] || 0) + 1, c), {}),
  perf: r.report?.perf && (({ lcpMs, htmlKB, transferKB, requests, rscPrefetches, jsKB }) => ({ lcpMs, htmlKB, transferKB, requests, rscPrefetches, jsKB }))(r.report.perf) }));

const md = [
  `## Page-type audit: ${pages.length} pages × ${viewports.join('/')}px`,
  '', '| Page | vw | C | I | M | HTML KB | JS KB | req | note |', '|---|---|---|---|---|---|---|---|---|',
  ...pageSummary.map((p) => `| ${p.route || p.url} | ${p.vw} | ${p.counts.C || 0} | ${p.counts.I || 0} | ${p.counts.M || 0} | ${p.perf?.htmlKB ?? '-'} | ${p.perf?.jsKB ?? '-'} | ${p.perf?.requests ?? '-'} | ${p.error ? '⚠ ' + p.error : ''} |`),
  '', '| # | Sev | Issue | Pages | vw | Examples |', '|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.id} | ${r.accepted ? '✓ accepted' : r.sev} | ${r.msg}${r.accepted ? ` — _${r.accepted}_` : ''} | ${r.pages.length === pages.length ? `all ${pages.length}` : r.pages.join(', ')} | ${r.viewports.join('/')} | ${(r.items || []).slice(0, 2).map((x) => '`' + String(x).slice(0, 70).replace(/\|/g, '\\|') + '`').join(' ')} |`),
].join('\n');

if (out) {
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'pages-raw.json'), JSON.stringify(results, null, 1));
  writeFileSync(join(out, 'pages-issues.json'), JSON.stringify({ pages: pageSummary, issues: rows }, null, 1));
  writeFileSync(join(out, 'pages.md'), md);
}
console.log(md);
