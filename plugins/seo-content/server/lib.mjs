// Data clients for seo-content: Google Search Console, GA4 Data API, DataForSEO.
// Zero dependencies (Node >= 22). Credentials come from the caller (env of the MCP process),
// never from files in the project repo.
import { createSign } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const GSC = 'https://www.googleapis.com/webmasters/v3';
const GA4 = 'https://analyticsdata.googleapis.com/v1beta';
const DFS = 'https://api.dataforseo.com/v3';
const SCOPES = {
  gsc: 'https://www.googleapis.com/auth/webmasters.readonly',
  ga4: 'https://www.googleapis.com/auth/analytics.readonly',
};

export class SetupError extends Error {
  constructor(message, fix) { super(message); this.fix = fix; }
}

// ---------- Google service-account auth (JWT bearer grant) ----------
const tokenCache = new Map();

export async function loadServiceAccount(path) {
  if (!path) throw new SetupError('No Google service-account key configured.',
    'Set "googleKeyFile" in this repo\'s .seo-content.json to the path of the client\'s JSON key (e.g. ~/.config/<client>/sa.json), or set a default key via /plugin configure seo-content@kkuklewski.');
  if (!path.endsWith('.json')) throw new SetupError(`Key file must be a .json file: ${path}`, 'Use the JSON key downloaded from Google Cloud → IAM → Service accounts → Keys.');
  let text, sa;
  try { text = await readFile(path, 'utf8'); }
  catch (e) { throw new SetupError(`Cannot read service-account key at ${path}: ${e.code || e.message}`, 'Point googleKeyFile in .seo-content.json (or the plugin setting) at an existing JSON key (Google Cloud → IAM → Service accounts → Keys → Add key → JSON).'); }
  // Generic message on purpose: JSON.parse errors quote file content.
  try { sa = JSON.parse(text); } catch { sa = null; }
  if (sa?.type !== 'service_account' || !sa.client_email || !sa.private_key)
    throw new SetupError(`${path} is not a service-account JSON key.`, 'Download a key of type "service account" (not an OAuth client secret).');
  return sa;
}

async function googleToken(sa, scope) {
  const key = `${sa.client_email}|${scope}`;
  const hit = tokenCache.get(key);
  if (hit && hit.exp > Date.now() + 60_000) return hit.token;
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: sa.client_email, scope, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
  const sig = createSign('RSA-SHA256').update(unsigned).sign(sa.private_key, 'base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${sig}` }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new SetupError(`Google rejected the service-account key: ${body.error_description || body.error || res.status}`, 'The key may be deleted or disabled — create a new key for the service account.');
  tokenCache.set(key, { token: body.access_token, exp: Date.now() + body.expires_in * 1000 });
  return body.access_token;
}

async function google(sa, scope, url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { authorization: `Bearer ${await googleToken(sa, scope)}`, 'content-type': 'application/json', ...init.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (res.ok) return body;
  const msg = body.error?.message || res.statusText;
  if (res.status === 403 && /has not been used|is disabled/i.test(msg)) {
    const api = scope === SCOPES.gsc ? 'Google Search Console API' : 'Google Analytics Data API';
    throw new SetupError(`${api} is not enabled in your Google Cloud project.`, `Enable "${api}" in Google Cloud → APIs & Services → Library (the project that owns ${sa.client_email}), wait a minute, retry.`);
  }
  if (res.status === 403 || res.status === 404) {
    const where = scope === SCOPES.gsc
      ? 'Search Console → Settings → Users and permissions → Add user (Restricted is enough)'
      : 'GA4 → Admin → Property access management → Add user (Viewer is enough)';
    throw new SetupError(`No access (${res.status}): ${msg}`, `Add ${sa.client_email} in ${where}.`);
  }
  throw new Error(`Google API ${res.status}: ${msg}`);
}

// ---------- Search Console ----------
export async function gscSites(sa) {
  const { siteEntry = [] } = await google(sa, SCOPES.gsc, `${GSC}/sites`);
  return siteEntry.map((s) => ({ siteUrl: s.siteUrl, permission: s.permissionLevel }));
}

// Paginates past the 25k-rows-per-request cap up to maxRows.
export async function gscQuery(sa, siteUrl, { startDate, endDate, dimensions = ['query', 'page'], type = 'web', filters = [], maxRows = 5000, dataState } = {}) {
  const url = `${GSC}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  const rows = [];
  for (let startRow = 0; rows.length < maxRows; ) {
    const rowLimit = Math.min(25000, maxRows - rows.length);
    const body = { startDate, endDate, dimensions, type, rowLimit, startRow };
    if (filters.length) body.dimensionFilterGroups = [{ groupType: 'and', filters }];
    if (dataState) body.dataState = dataState;
    const res = await google(sa, SCOPES.gsc, url, { method: 'POST', body: JSON.stringify(body) });
    const page = res.rows || [];
    for (const r of page) {
      const row = Object.fromEntries(dimensions.map((d, i) => [d, r.keys[i]]));
      rows.push({ ...row, clicks: r.clicks, impressions: r.impressions, ctr: +r.ctr.toFixed(4), position: +r.position.toFixed(1) });
    }
    if (page.length < rowLimit) break;
    startRow += page.length;
  }
  return rows;
}

// ---------- GA4 ----------
export async function ga4Report(sa, propertyId, { startDate, endDate, dimensions = ['landingPagePlusQueryString'], metrics = ['sessions', 'engagementRate', 'keyEvents'], limit = 1000 } = {}) {
  const id = String(propertyId).replace(/^properties\//, '');
  const res = await google(sa, SCOPES.ga4, `${GA4}/properties/${id}:runReport`, {
    method: 'POST',
    body: JSON.stringify({
      dateRanges: [{ startDate, endDate }],
      dimensions: dimensions.map((name) => ({ name })),
      metrics: metrics.map((name) => ({ name })),
      limit,
    }),
  });
  return (res.rows || []).map((r) => ({
    ...Object.fromEntries(dimensions.map((d, i) => [d, r.dimensionValues[i].value])),
    ...Object.fromEntries(metrics.map((m, i) => [m, Number(r.metricValues[i].value)])),
  }));
}

// ---------- DataForSEO (optional, pay-as-you-go) ----------
export function dfsConfigured(login, password) { return Boolean(login && password); }

export function assertDfs(login, password) {
  if (!dfsConfigured(login, password)) throw new SetupError('DataForSEO is not configured (optional).',
    'Competitor/volume data is off. To enable it, create your own DataForSEO account and set login + password under /plugin → seo-content → Configure.');
}

async function dfs(login, password, path, task) {
  assertDfs(login, password);
  const res = await fetch(`${DFS}${path}`, {
    method: 'POST',
    headers: { authorization: `Basic ${Buffer.from(`${login}:${password}`).toString('base64')}`, 'content-type': 'application/json' },
    body: JSON.stringify([task]),
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401 || body.status_code === 40100) throw new SetupError('DataForSEO rejected the login/password.', 'Use the API credentials from app.dataforseo.com → API Access (not your website password).');
  if (body.status_code === 40200 || body.status_code === 40210) throw new SetupError('DataForSEO balance is empty.', 'Top up your DataForSEO account.');
  if (/verify your account/i.test(body.status_message || '')) throw new SetupError('DataForSEO account is not verified.', 'Complete verification at app.dataforseo.com, then retry.');
  const t = body.tasks?.[0];
  if (body.status_code === 40204 || t?.status_code === 40204) throw new SetupError(`DataForSEO: the ${path.split('/')[1]} API is not active on this account.`, 'All DataForSEO APIs are pay-as-you-go from the account balance — check API access at app.dataforseo.com or ask DataForSEO support to enable it.');
  if (!t || t.status_code >= 40000) {
    if (/verify your account/i.test(t?.status_message || '')) throw new SetupError('DataForSEO account is not verified.', 'Complete verification at app.dataforseo.com, then retry.');
    throw new Error(`DataForSEO ${path}: ${t?.status_message || body.status_message || res.status}`);
  }
  // Some Labs endpoints (keyword_suggestions) put the items in a different result element than the seed data.
  return { cost: t.cost, result: t.result?.find((r) => r?.items) ?? t.result?.[0] };
}

// No silent fallback to US/English: a German or Polish site queried with US data looks plausible and is wrong.
// The skill passes `locale` from .seo-content.json (Poland 2616/pl, Germany 2276/de, UK 2826/en, US 2840/en).
export function requireLocale({ location_code, language_code } = {}) {
  if (!Number.isInteger(location_code) || !language_code) {
    throw new Error('location_code and language_code are required — pass `locale` from .seo-content.json (e.g. Poland 2616/"pl", Germany 2276/"de", UK 2826/"en", US 2840/"en").');
  }
  return { location_code, language_code };
}

const ym = (m) => `${m.year}-${String(m.month).padStart(2, '0')}`;
// Oldest → newest, so the list reads as a trend line.
const monthly = (info) => (info?.monthly_searches || []).map((m) => ({ month: ym(m), volume: m.search_volume })).sort((a, b) => a.month.localeCompare(b.month));

// mode: 'live' (ranks now), 'lost' (ranked before, gone at the last check), 'all'. detail adds the 12-month volume
// history, the volume trend and the rank change against the previous check — the decay signals.
export async function dfsRankedKeywords(login, password, target, opts = {}) {
  const mode = opts.mode ?? 'live';
  const task = { target, ...requireLocale(opts), limit: opts.limit ?? 200, historical_serp_mode: mode, order_by: ['keyword_data.keyword_info.search_volume,desc'] };
  if (opts.maxPosition !== null && mode === 'live') task.filters = [['ranked_serp_element.serp_item.rank_group', '<=', opts.maxPosition ?? 20]];
  if (opts.filters) task.filters = opts.filters;
  const { cost, result } = await dfs(login, password, '/dataforseo_labs/google/ranked_keywords/live', task);
  const items = (result?.items || []).map((i) => {
    const kd = i.keyword_data || {};
    const s = i.ranked_serp_element?.serp_item || {};
    const item = {
      keyword: kd.keyword,
      volume: kd.keyword_info?.search_volume,
      difficulty: kd.keyword_properties?.keyword_difficulty,
      intent: kd.search_intent_info?.main_intent,
      position: s.rank_group,
      url: s.url,
    };
    if (!opts.detail) return item;
    const rc = s.rank_changes || {};
    return {
      ...item,
      previousPosition: rc.previous_rank_absolute ?? null,
      change: mode === 'lost' ? 'lost' : rc.is_new ? 'new' : rc.is_up ? 'up' : rc.is_down ? 'down' : 'same',
      volumeTrend: kd.keyword_info?.search_volume_trend || null,
      monthlyVolume: monthly(kd.keyword_info),
    };
  });
  return { cost, totalCount: result?.total_count ?? null, metrics: result?.metrics?.organic || null, items };
}

// One normalised row for the Labs keyword endpoints (ideas and suggestions return it flat, related nests it).
const kwRow = (k) => k && ({
  keyword: k.keyword,
  volume: k.keyword_info?.search_volume ?? null,
  cpc: k.keyword_info?.cpc ?? null,
  difficulty: k.keyword_properties?.keyword_difficulty ?? null,
  intent: k.search_intent_info?.main_intent ?? null,
  volumeTrend: k.keyword_info?.search_volume_trend?.yearly ?? null,
});

// Three ways to grow a seed into a cluster: Keyword Ideas (same categories), Related Keywords (Google's
// "searches related to", depth 1 = up to 8, 2 = up to 72) and Keyword Suggestions (seed phrase + words around it).
export async function dfsKeywordCluster(login, password, seeds, opts = {}) {
  const loc = requireLocale(opts);
  const limit = opts.limit ?? 50;
  const minVolume = opts.minVolume ?? 10;
  const order = (p) => [`${p}keyword_info.search_volume,desc`];
  const filter = (p) => [[`${p}keyword_info.search_volume`, '>=', minVolume]];
  const first = seeds[0];
  const calls = [
    ['ideas', dfs(login, password, '/dataforseo_labs/google/keyword_ideas/live', { keywords: seeds.slice(0, 200), ...loc, limit, filters: filter(''), order_by: order('') })
      .then(({ cost, result }) => ({ cost, rows: (result?.items || []).map(kwRow) }))],
    ['related', Promise.all(seeds.slice(0, 5).map((keyword) => dfs(login, password, '/dataforseo_labs/google/related_keywords/live', { keyword, ...loc, depth: opts.depth ?? 2, limit, filters: filter('keyword_data.'), order_by: order('keyword_data.') })))
      .then((rs) => ({ cost: rs.reduce((s, r) => s + (r.cost || 0), 0), rows: rs.flatMap((r) => (r.result?.items || []).map((i) => kwRow(i.keyword_data))) }))],
    ['suggestions', Promise.all(seeds.slice(0, 5).map((keyword) => dfs(login, password, '/dataforseo_labs/google/keyword_suggestions/live', { keyword, ...loc, limit, filters: filter(''), order_by: order('') })))
      .then((rs) => ({ cost: rs.reduce((s, r) => s + (r.cost || 0), 0), rows: rs.flatMap((r) => (r.result?.items || []).map(kwRow)) }))],
  ];
  const settled = await Promise.allSettled(calls.map(([, p]) => p));
  const setupError = settled.find((s) => s.status === 'rejected' && s.reason instanceof SetupError);
  if (setupError) throw setupError.reason;
  let cost = 0;
  const errors = {};
  const sources = calls.map(([name], i) => {
    const s = settled[i];
    if (s.status === 'rejected') { errors[name] = s.reason.message; return [name, []]; }
    cost += s.value.cost || 0;
    return [name, s.value.rows.filter((r) => r?.keyword)];
  });
  return { cost, seed: first, errors, keywords: mergeCluster(sources, { top: opts.top ?? 150 }) };
}

// Pure merge: one row per keyword (case-insensitive), with the endpoints that found it; keywords found by more
// endpoints and with more volume come first.
export function mergeCluster(sources, { top = 150 } = {}) {
  const byKey = new Map();
  for (const [source, rows] of sources) {
    for (const r of rows) {
      const k = r.keyword.toLowerCase().trim();
      const cur = byKey.get(k);
      if (cur) { if (!cur.sources.includes(source)) cur.sources.push(source); for (const f of ['volume', 'cpc', 'difficulty', 'intent', 'volumeTrend']) cur[f] ??= r[f]; }
      else byKey.set(k, { ...r, keyword: k, sources: [source] });
    }
  }
  return [...byKey.values()]
    .sort((a, b) => (b.sources.length - a.sources.length) || ((b.volume ?? 0) - (a.volume ?? 0)))
    .slice(0, top);
}

export async function dfsSearchVolume(login, password, keywords, opts = {}) {
  const { cost, result } = await dfs(login, password, '/dataforseo_labs/google/keyword_overview/live', {
    keywords: keywords.slice(0, 700), ...requireLocale(opts),
  });
  const items = (result?.items || []).map((i) => ({
    keyword: i.keyword,
    volume: i.keyword_info?.search_volume,
    cpc: i.keyword_info?.cpc,
    difficulty: i.keyword_properties?.keyword_difficulty,
    intent: i.search_intent_info?.main_intent,
  }));
  return { cost, items };
}

export async function dfsSerp(login, password, keyword, opts = {}) {
  const { cost, result } = await dfs(login, password, '/serp/google/organic/live/advanced', {
    keyword, ...requireLocale(opts), depth: opts.depth ?? 10,
  });
  const items = (result?.items || [])
    .filter((i) => ['organic', 'featured_snippet', 'people_also_ask'].includes(i.type))
    .map((i) => i.type === 'people_also_ask'
      ? { type: i.type, questions: (i.items || []).map((q) => q.title) }
      : { type: i.type, position: i.rank_group, title: i.title, url: i.url, description: i.description });
  return { cost, items };
}

// Structured main content of one page (headings + text blocks). ~$0.000125; JS rendering costs more, so
// the caller only asks for it when the plain fetch came back nearly empty.
export async function dfsContentParsing(login, password, url, opts = {}) {
  const task = { url, disable_cookie_popup: true };
  if (opts.javascript) Object.assign(task, { enable_javascript: true, enable_browser_rendering: true });
  const { cost, result } = await dfs(login, password, '/on_page/content_parsing/live', task);
  return { cost, pageContent: result?.items?.[0]?.page_content || null };
}

// Backlink profile totals for a domain (or one URL). ~$0.024 per request, pay-as-you-go like every DataForSEO API.
export async function dfsBacklinksSummary(login, password, target, opts = {}) {
  const { cost, result: r } = await dfs(login, password, '/backlinks/summary/live', {
    target, include_subdomains: opts.includeSubdomains ?? true, backlinks_status_type: 'live', internal_list_limit: 10,
  });
  const top = (o) => Object.fromEntries(Object.entries(o || {}).sort((a, b) => b[1] - a[1]).slice(0, 10));
  return {
    cost,
    summary: r && {
      target: r.target,
      backlinks: r.backlinks,
      referringDomains: r.referring_domains,
      referringMainDomains: r.referring_main_domains,
      referringDomainsNofollow: r.referring_domains_nofollow,
      referringIps: r.referring_ips,
      brokenBacklinks: r.broken_backlinks,
      rank: r.rank,
      spamScore: r.backlinks_spam_score,
      firstSeen: r.first_seen,
      linkTypes: r.referring_links_types,
      linkAttributes: r.referring_links_attributes,
      topTlds: top(r.referring_links_tld),
      topCountries: top(r.referring_links_countries),
    },
  };
}
