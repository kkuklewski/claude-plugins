#!/usr/bin/env node
// seo-content MCP server — minimal stdio JSON-RPC, zero dependencies (Node >= 22).
// Credentials arrive as env vars that Claude Code fills from the plugin's userConfig
// (the key file path and DataForSEO login/password live on each user's own machine,
// sensitive values in their OS keychain). Nothing here is shared between users.
import { homedir } from 'node:os';
import { readFile } from 'node:fs/promises';
import { SetupError, loadServiceAccount, gscSites, gscQuery, ga4Report, dfsConfigured, dfsRankedKeywords, dfsSearchVolume, dfsSerp, dfsContentParsing } from './lib.mjs';
import { termPlan, parseMarkdown, fromContentParsing, scoreSavedPlan } from './terms.mjs';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { analyze, competitorGap } from './analyze.mjs';

// An unset userConfig option may arrive as an empty string or an unexpanded placeholder.
const env = (k) => { const v = process.env[k]?.trim(); return v && !v.startsWith('${') ? v : ''; };
// Per-client key (googleKeyFile from the repo's .seo-content.json, passed as a tool argument)
// wins over the user's default key from the plugin settings.
const keyFile = (a = {}) => (a.keyFile?.trim() || env('SEO_GOOGLE_KEY_FILE')).replace(/^~(?=\/)/, homedir());
const keyArg = { keyFile: { type: 'string', description: 'googleKeyFile from .seo-content.json (path to this client\'s service-account JSON). Omit to use the default key from the plugin settings.' } };
const dfsLogin = () => env('DATAFORSEO_LOGIN');
const dfsPassword = () => env('DATAFORSEO_PASSWORD');

const day = (offset) => new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);
// Search Console data settles ~2-3 days after the fact.
const LAG = 3;
const period = (days) => ({ startDate: day(LAG + days - 1), endDate: day(LAG) });
const prevWindow = (days) => ({ startDate: day(LAG + 2 * days - 1), endDate: day(LAG + days) });
const locale = (a) => ({ location_code: a.location_code ?? 2840, language_code: a.language_code ?? 'en' });

const str = { type: 'string' };
const TOOLS = [
  {
    name: 'setup_check',
    description: 'Check which data sources work for this user and site. Returns ok/missing/error per source with the exact fix. Call this first in every run.',
    inputSchema: { type: 'object', properties: { siteUrl: { ...str, description: 'Search Console property, e.g. "sc-domain:example.com" or "https://www.example.com/"' }, ga4PropertyId: str, ...keyArg } },
    run: async ({ siteUrl, ga4PropertyId, keyFile: kf }) => {
      const out = { google: null, searchConsole: null, ga4: null, dataforseo: null };
      let sa;
      try { sa = await loadServiceAccount(keyFile({ keyFile: kf })); out.google = { status: 'ok', serviceAccount: sa.client_email, keySource: kf ? 'project (.seo-content.json)' : 'plugin default' }; }
      catch (e) { out.google = fail(e); }
      if (sa) {
        try {
          const sites = await gscSites(sa);
          const match = siteUrl ? sites.find((s) => s.siteUrl === siteUrl) : null;
          out.searchConsole = siteUrl && !match
            ? { status: 'missing', sites, fix: `${sa.client_email} has no access to ${siteUrl}. Add it in Search Console → Settings → Users and permissions (Restricted is enough), or pick one of the listed properties.` }
            : { status: 'ok', sites };
        } catch (e) { out.searchConsole = fail(e); }
        if (ga4PropertyId) {
          try { await ga4Report(sa, ga4PropertyId, { ...period(7), limit: 1 }); out.ga4 = { status: 'ok' }; }
          catch (e) { out.ga4 = fail(e); }
        } else out.ga4 = { status: 'off', note: 'No ga4PropertyId in .seo-content.json — conversion data skipped (optional).' };
      }
      out.dataforseo = dfsConfigured(dfsLogin(), dfsPassword())
        ? { status: 'configured', note: 'Credentials present; validated on first paid call.' }
        : { status: 'off', note: 'Optional. Competitor gaps, search volume and SERP snapshots are disabled.', fix: 'Set DataForSEO login + password via /plugin configure seo-content@kkuklewski.' };
      return out;
    },
  },
  {
    name: 'gsc_list_sites',
    description: 'List Search Console properties the configured service account can read.',
    inputSchema: { type: 'object', properties: { ...keyArg } },
    run: async (a) => gscSites(await loadServiceAccount(keyFile(a))),
  },
  {
    name: 'gsc_opportunities',
    description: 'Pull query×page data for the last N days plus page data for the previous N days and return ranked opportunities: strikingDistance (pos 4.5–20), lowCtr (good position, weak snippet), cannibalisation, contentGaps (impressions but no page in top 20 — new-post candidates; question-shaped ones flagged), decay (pages losing ≥30% clicks).',
    inputSchema: {
      type: 'object', required: ['siteUrl'],
      properties: {
        ...keyArg, siteUrl: str, days: { type: 'integer', default: 90 }, minImpressions: { type: 'integer', default: 50 },
        brandTerms: { type: 'array', items: str, description: 'Queries containing these are excluded' },
        questionWords: { type: 'array', items: str }, top: { type: 'integer', default: 25 },
        country: { ...str, description: 'Optional ISO-3166 alpha-3 filter, e.g. "pol"' },
      },
    },
    run: async (a) => {
      const sa = await loadServiceAccount(keyFile(a));
      const days = a.days ?? 90;
      const filters = a.country ? [{ dimension: 'country', operator: 'equals', expression: a.country.toLowerCase() }] : [];
      const [rows, pagesNow, pagesPrev] = await Promise.all([
        gscQuery(sa, a.siteUrl, { ...period(days), dimensions: ['query', 'page'], filters, maxRows: 25000 }),
        gscQuery(sa, a.siteUrl, { ...period(days), dimensions: ['page'], filters, maxRows: 5000 }),
        gscQuery(sa, a.siteUrl, { ...prevWindow(days), dimensions: ['page'], filters, maxRows: 5000 }),
      ]);
      return { period: period(days), previousPeriod: prevWindow(days), ...analyze({ rows, pagesNow, pagesPrev }, a) };
    },
  },
  {
    name: 'gsc_query',
    description: 'Raw Search Console rows for a custom question (e.g. all queries for one page). Max 1000 rows inline.',
    inputSchema: {
      type: 'object', required: ['siteUrl'],
      properties: {
        ...keyArg, siteUrl: str, days: { type: 'integer', default: 90 },
        dimensions: { type: 'array', items: { enum: ['query', 'page', 'country', 'device', 'date', 'searchAppearance'] }, default: ['query'] },
        pageContains: str, queryContains: str, maxRows: { type: 'integer', default: 200 },
      },
    },
    run: async (a) => {
      const filters = [];
      if (a.pageContains) filters.push({ dimension: 'page', operator: 'contains', expression: a.pageContains });
      if (a.queryContains) filters.push({ dimension: 'query', operator: 'contains', expression: a.queryContains });
      const rows = await gscQuery(await loadServiceAccount(keyFile(a)), a.siteUrl, {
        ...period(a.days ?? 90), dimensions: a.dimensions ?? ['query'], filters, maxRows: Math.min(a.maxRows ?? 200, 1000),
      });
      return rows.sort((x, y) => y.impressions - x.impressions);
    },
  },
  {
    name: 'ga4_landing_pages',
    description: 'GA4 landing pages with sessions, engagementRate and keyEvents (conversions) for the last N days. Optional source.',
    inputSchema: { type: 'object', required: ['propertyId'], properties: { ...keyArg, propertyId: str, days: { type: 'integer', default: 90 }, limit: { type: 'integer', default: 200 } } },
    run: async (a) => ga4Report(await loadServiceAccount(keyFile(a)), a.propertyId, { ...period(a.days ?? 90), limit: a.limit ?? 200 }),
  },
  {
    name: 'competitor_gap',
    description: 'PAID (DataForSEO, ~$0.01–0.05 per competitor). Keywords competitors rank top-20 for where this site has no top-20 position in Search Console. Sorted by how many competitors share the keyword, then volume.',
    inputSchema: {
      type: 'object', required: ['siteUrl', 'competitors'],
      properties: { ...keyArg, siteUrl: str, competitors: { type: 'array', items: str, maxItems: 5 }, location_code: { type: 'integer' }, language_code: str, limit: { type: 'integer', default: 200 } },
    },
    run: async (a) => {
      const [ownRows, ...competitorItems] = await Promise.all([
        gscQuery(await loadServiceAccount(keyFile(a)), a.siteUrl, { ...period(90), dimensions: ['query'], maxRows: 25000 }),
        ...a.competitors.slice(0, 5).map(async (c) => ({ competitor: c, ...(await dfsRankedKeywords(dfsLogin(), dfsPassword(), c, { ...locale(a), limit: a.limit ?? 200 })) })),
      ]);
      const cost = competitorItems.reduce((s, c) => s + (c.cost || 0), 0);
      return { costUsd: +cost.toFixed(4), gaps: competitorGap(competitorItems, ownRows) };
    },
  },
  {
    name: 'keyword_volume',
    description: 'PAID (DataForSEO). Monthly search volume, CPC, difficulty and intent for up to 700 keywords.',
    inputSchema: { type: 'object', required: ['keywords'], properties: { keywords: { type: 'array', items: str }, location_code: { type: 'integer' }, language_code: str } },
    run: async (a) => dfsSearchVolume(dfsLogin(), dfsPassword(), a.keywords, locale(a)),
  },
  {
    name: 'serp_snapshot',
    description: 'PAID (DataForSEO, ~$0.002). Current Google top-10 for a keyword: titles, URLs, descriptions, featured snippet and People-also-ask questions — input for a content brief.',
    inputSchema: { type: 'object', required: ['keyword'], properties: { keyword: str, location_code: { type: 'integer' }, language_code: str } },
    run: async (a) => dfsSerp(dfsLogin(), dfsPassword(), a.keyword, locale(a)),
  },
  {
    name: 'term_plan',
    description: 'PAID (DataForSEO, ~$0.004–0.02 per keyword). NeuronWriter-style content plan from the current Google top-10: target length and H2/H3 count, the terms the ranking pages share with a "use N–M times" range each, terms used in their headings, People-also-ask and heading questions, and every competitor\'s heading outline. Pass draftFile (absolute path to a markdown draft) to also score that draft 0–100 and list missing and overused terms.',
    inputSchema: {
      type: 'object', required: ['keyword'],
      properties: {
        keyword: str, location_code: { type: 'integer' }, language_code: str,
        exclude: { type: 'array', items: str, description: 'Domains to leave out, e.g. your own site (siteOrigin host) — social networks and directory sites (oferteo, panoramafirm…) are always skipped' },
        draftFile: { ...str, description: 'Absolute path to a markdown draft to score against the plan' },
        savePlan: { ...str, description: 'Absolute path (.json) to save the plan to, e.g. next to the brief. Score later drafts against it with planFile.' },
        planFile: { ...str, description: 'Absolute path to a plan saved earlier with savePlan. With draftFile: score the draft against it — no DataForSEO call, no cost, same competitors every time.' },
        minShare: { type: 'number', default: 0.4, description: 'Share of competitor pages that must use a term for it to count' },
      },
    },
    run: async (a) => {
      const path = (p) => p.replace(/^~(?=\/)/, homedir());
      const draft = a.draftFile ? parseMarkdown(await readFile(path(a.draftFile), 'utf8')) : null;
      if (a.planFile) {
        if (!draft) throw new Error('planFile needs draftFile (the draft to score).');
        const saved = JSON.parse(await readFile(path(a.planFile), 'utf8'));
        return { keyword: saved.keyword?.phrase, plannedAt: saved.plannedAt, costUsd: 0, draftScore: scoreSavedPlan(saved, draft) };
      }
      const serp = await dfsSerp(dfsLogin(), dfsPassword(), a.keyword, { ...locale(a), depth: 20 });
      const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
      const skip = new Set([...(a.exclude || []).map((d) => host(d.includes('://') ? d : `https://${d}`)), ...SOCIAL, ...DIRECTORIES]);
      const urls = serp.items.filter((i) => i.type === 'organic' && i.url && ![...skip].some((d) => host(i.url) === d || host(i.url).endsWith(`.${d}`)))
        .slice(0, 12) // directories and social dropped above; positions 11–20 backfill them
        .map((i) => { const u = new URL(i.url); u.searchParams.delete('srsltid'); return u.toString(); });
      let cost = serp.cost || 0;
      const pages = await Promise.all(urls.map(async (url) => {
        try {
          let r = await dfsContentParsing(dfsLogin(), dfsPassword(), url);
          cost += r.cost || 0;
          let page = fromContentParsing(r.pageContent);
          if ((page.text.match(/\p{L}+/gu) || []).length < 150) {
            r = await dfsContentParsing(dfsLogin(), dfsPassword(), url, { javascript: true });
            cost += r.cost || 0;
            page = fromContentParsing(r.pageContent);
          }
          return { url, ...page };
        } catch (e) {
          if (e instanceof SetupError) throw e;
          return { url, headings: [], text: '', error: e.message };
        }
      }));
      const paa = serp.items.filter((i) => i.type === 'people_also_ask').flatMap((i) => i.questions);
      const lang = (a.language_code || 'en').slice(0, 2);
      const { scoring, ...plan } = termPlan(pages, { keyword: a.keyword, lang, paa, draft, minShare: a.minShare });
      let saved;
      if (a.savePlan && !plan.error) {
        await mkdir(dirname(path(a.savePlan)), { recursive: true });
        await writeFile(path(a.savePlan), JSON.stringify({ plannedAt: new Date().toISOString().slice(0, 10), locale: locale(a), ...plan, scoring }, null, 1) + '\n');
        saved = path(a.savePlan);
      }
      return { keyword: a.keyword, costUsd: +cost.toFixed(4), ...(saved && { savedTo: saved }), ...plan };
    },
  },
];

// Directory and listing sites: company profiles, not content that ranks on its own merit.
const DIRECTORIES = ['oferteo.pl', 'panoramafirm.pl', 'pkt.pl', 'orlygastronomii.pl', 'starofservice.pl', 'aleo.com', 'gowork.pl',
  'firmy.net', 'cylex-polska.pl', 'zumi.pl', 'yelp.com', 'tripadvisor.com', 'tripadvisor.pl', 'google.com', 'maps.google.com', 'webflow.io'];
const SOCIAL = ['facebook.com', 'instagram.com', 'youtube.com', 'tiktok.com', 'linkedin.com', 'x.com', 'twitter.com', 'pinterest.com'];

function fail(e) {
  return e instanceof SetupError ? { status: 'missing', error: e.message, fix: e.fix } : { status: 'error', error: e.message };
}

// ---------- JSON-RPC over stdio (newline-delimited) ----------
const send = (msg) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...msg }) + '\n');

async function handle(req) {
  const { id, method, params = {} } = req;
  if (method === 'initialize') {
    return send({ id, result: {
      protocolVersion: params.protocolVersion || '2025-06-18',
      capabilities: { tools: {} },
      serverInfo: { name: 'seo-content', version: '0.3.0' },
    } });
  }
  if (method === 'tools/list') return send({ id, result: { tools: TOOLS.map(({ run, ...t }) => t) } });
  if (method === 'tools/call') {
    const tool = TOOLS.find((t) => t.name === params.name);
    if (!tool) return send({ id, error: { code: -32602, message: `Unknown tool ${params.name}` } });
    try {
      const data = await tool.run(params.arguments || {});
      return send({ id, result: { content: [{ type: 'text', text: JSON.stringify(data, null, 1) }] } });
    } catch (e) {
      const text = e instanceof SetupError ? `SETUP NEEDED: ${e.message}\nFix: ${e.fix}` : `Error: ${e.message}`;
      return send({ id, result: { isError: true, content: [{ type: 'text', text }] } });
    }
  }
  if (method === 'ping') return send({ id, result: {} });
  if (id !== undefined) send({ id, error: { code: -32601, message: `Method not found: ${method}` } });
}

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  for (let i; (i = buf.indexOf('\n')) >= 0; ) {
    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    if (!line) continue;
    let req;
    try { req = JSON.parse(line); } catch { send({ id: null, error: { code: -32700, message: 'Parse error' } }); continue; }
    handle(req).catch((e) => req.id !== undefined && send({ id: req.id, error: { code: -32603, message: e.message } }));
  }
});
