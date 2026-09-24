#!/usr/bin/env node
// Discover which URLs to audit: one sample per page TYPE (route template), not just the home page.
// Sources: repo routes (Next app/ or pages/), sitemap.xml (+ sitemap index), robots.txt Disallow,
// .site-audit.json (pages / privateRoutes / maxPages).
// Usage: pages.mjs <url> [--repo <path>] [--mode types|all|single|<N>]   → JSON on stdout
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { loadConfig, isPrivate } from './lib.mjs';

const args = process.argv.slice(2);
const url = args.find((a) => /^https?:\/\//.test(a));
if (!url) { console.error('usage: pages.mjs <url> [--repo <path>] [--mode types|all|single|<N>]'); process.exit(1); }
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const repo = opt('--repo', null);
const mode = opt('--mode', 'types');
const cfg = loadConfig(repo);
const origin = new URL(url).origin;
const notes = [];

const get = async (u) => { try { const r = await fetch(u, { redirect: 'follow', signal: AbortSignal.timeout(15000) }); return r.ok ? await r.text() : null; } catch { return null; } };

// robots.txt
const robots = (await get(origin + '/robots.txt')) || '';
const disallow = [...robots.matchAll(/^\s*disallow:\s*(\S+)/gim)].map((m) => m[1]);
const sitemapRefs = [...robots.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => m[1]);

// sitemap(s) — rewrite host to the audited origin (lets you audit localhost against a prod sitemap)
const locs = [];
const toAudited = (u) => { try { const p = new URL(u); return origin + p.pathname + p.search; } catch { return null; } };
async function readSitemap(u, depth = 0) {
  const xml = await get(u.startsWith('http') ? toAudited(u) || u : origin + u);
  if (!xml) return;
  const found = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, '&'));
  if (/<sitemapindex/i.test(xml) && depth < 2) { for (const s of found.slice(0, 10)) await readSitemap(s, depth + 1); }
  else locs.push(...found.map(toAudited).filter(Boolean));
}
for (const s of sitemapRefs.length ? sitemapRefs : ['/sitemap.xml']) await readSitemap(s);
if (!locs.length) notes.push('no sitemap URLs found');

// internal links from the start page + home: fallback samples for dynamic routes missing from the sitemap
const linked = [];
for (const u of new Set([url, origin + '/'])) {
  const html = (await get(u)) || '';
  for (const m of html.matchAll(/href="([^"#?]+)"/g)) {
    try { const l = new URL(m[1], origin); if (l.origin === origin && !/\.\w{2,5}$/.test(l.pathname)) linked.push(origin + l.pathname); } catch {}
  }
}

// repo routes → regex patterns
function routesFrom(dir, kind) {
  const out = [];
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) { if (!/^(node_modules|_)/.test(f) || kind === 'pages') walk(p); continue; }
      if (kind === 'app' && !/^page\.(tsx|ts|jsx|js|mdx|md)$/.test(f)) continue;
      if (kind === 'pages' && !/\.(tsx|ts|jsx|js|mdx|md)$/.test(f)) continue;
      let rel = relative(dir, kind === 'app' ? d : p).split(sep).filter(Boolean);
      if (kind === 'pages') {
        rel[rel.length - 1] = rel[rel.length - 1].replace(/\.\w+$/, '');
        if (rel[0] === 'api' || /^_/.test(rel[rel.length - 1])) continue;
        if (rel[rel.length - 1] === 'index') rel.pop();
      }
      if (rel.some((s) => s.startsWith('_') || s.startsWith('@'))) continue; // private folders, parallel slots
      rel = rel.filter((s) => !/^\(.*\)$/.test(s)); // route groups
      const route = '/' + rel.join('/');
      const dynamic = rel.some((s) => s.startsWith('['));
      const re = new RegExp('^' + rel.map((s) =>
        /^\[\[\.\.\..+\]\]$/.test(s) ? '(?:/.*)?' : /^\[\.\.\..+\]$/.test(s) ? '/.+' : /^\[.+\]$/.test(s) ? '/[^/]+' : '/' + s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      ).join('').replace(/^\(\?:\/\.\*\)\?/, '(?:/.*)?') + '/?$');
      out.push({ route, dynamic, re, file: relative(repo, p) });
    }
  };
  walk(dir);
  return out;
}
let routes = [];
if (repo) {
  for (const d of ['src/app', 'app']) if (existsSync(join(repo, d))) { routes = routesFrom(join(repo, d), 'app'); break; }
  if (!routes.length) for (const d of ['src/pages', 'pages']) if (existsSync(join(repo, d))) { routes = routesFrom(join(repo, d), 'pages'); break; }
  // static first so "/blog" wins over "/[slug]"
  routes.sort((a, b) => a.dynamic - b.dynamic || b.route.split('/').length - a.route.split('/').length);
}

const pathOf = (u) => new URL(u).pathname.replace(/\/$/, '') || '/';
const privateHere = (p) => isPrivate(p, cfg, disallow) && !cfg.pages.includes(p);
const picked = new Map(); // key → {url, route, source}
const add = (key, u, route, source) => { if (!picked.has(key)) picked.set(key, { url: u, route, source }); };

add('start', url, repo ? (routes.find((r) => r.re.test(pathOf(url)))?.route ?? '?') : pathOf(url), 'given');
for (const p of cfg.pages) add('cfg:' + p, origin + p, p, 'config');

if (mode !== 'single') {
  if (routes.length) {
    for (const r of routes) {
      if (privateHere(r.route.replace(/\/\[.*$/, '') || '/')) continue;
      const already = [...picked.values()].some((v) => v.route === r.route);
      if (already) continue;
      if (!r.dynamic) { add(r.route, origin + (r.route === '/' ? '/' : r.route), r.route, 'route'); continue; }
      const sample = [...locs, ...linked].find((u) => r.re.test(pathOf(u)) && !routes.some((o) => !o.dynamic && o.re.test(pathOf(u))));
      if (sample) add(r.route, sample, r.route, 'sitemap');
      else notes.push(`no sample URL for dynamic route ${r.route} (${r.file}) — add one to .site-audit.json "pages"`);
    }
  } else {
    // no repo: group sitemap URLs by shape (first segment + depth), take the first of each group
    // biggest groups first: they are the templates that repeat across most URLs
    const groups = new Map();
    for (const u of locs) {
      if (privateHere(pathOf(u))) continue;
      const segs = pathOf(u).split('/').filter(Boolean);
      const shape = segs.length ? `/${segs[0]}${segs.length > 1 ? '/*'.repeat(segs.length - 1) : ''}` : '/';
      if (!groups.has(shape)) groups.set(shape, []);
      groups.get(shape).push(u);
    }
    if (groups.has('/')) add('/', groups.get('/')[0], '/', 'sitemap');
    for (const [shape, us] of [...groups].sort((a, b) => b[1].length - a[1].length)) add(shape, us[0], `${shape} (${us.length} URLs)`, 'sitemap');
  }
}

let list = [...picked.values()];
const limit = mode === 'all' ? Infinity : /^\d+$/.test(mode) ? +mode : mode === 'single' ? 1 : cfg.maxPages;
if (mode === 'all') list = [...new Map([...list, ...locs.filter((u) => !privateHere(pathOf(u))).map((u) => ({ url: u, route: pathOf(u), source: 'sitemap' }))].map((x) => [x.url, x])).values()];
if (list.length > limit) { notes.push(`capped at ${limit} of ${list.length} page types (raise maxPages or use --mode all)`); list = list.slice(0, limit); }

console.log(JSON.stringify({ origin, pages: list, sitemapUrls: locs.length, robotsDisallow: disallow, routesFound: routes.length, notes }, null, 2));
