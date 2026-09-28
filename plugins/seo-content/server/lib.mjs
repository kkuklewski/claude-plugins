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
    'Run /plugin, open seo-content → Configure, and set "Google service-account key file" to the JSON key you downloaded from your own Google Cloud project.');
  let sa;
  try { sa = JSON.parse(await readFile(path, 'utf8')); }
  catch (e) { throw new SetupError(`Cannot read service-account key at ${path}: ${e.code || e.message}`, 'Point the plugin setting at an existing JSON key file (Google Cloud → IAM → Service accounts → Keys → Add key → JSON).'); }
  if (sa.type !== 'service_account' || !sa.client_email || !sa.private_key)
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

async function dfs(login, password, path, task) {
  if (!dfsConfigured(login, password)) throw new SetupError('DataForSEO is not configured (optional).',
    'Competitor/volume data is off. To enable it, create your own DataForSEO account and set login + password under /plugin → seo-content → Configure.');
  const res = await fetch(`${DFS}${path}`, {
    method: 'POST',
    headers: { authorization: `Basic ${Buffer.from(`${login}:${password}`).toString('base64')}`, 'content-type': 'application/json' },
    body: JSON.stringify([task]),
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401 || body.status_code === 40100) throw new SetupError('DataForSEO rejected the login/password.', 'Use the API credentials from app.dataforseo.com → API Access (not your website password).');
  if (body.status_code === 40200 || body.status_code === 40210) throw new SetupError('DataForSEO balance is empty.', 'Top up your DataForSEO account.');
  const t = body.tasks?.[0];
  if (!t || t.status_code >= 40000) throw new Error(`DataForSEO ${path}: ${t?.status_message || body.status_message || res.status}`);
  return { cost: t.cost, result: t.result?.[0] };
}

const locale = ({ location_code = 2840, language_code = 'en' } = {}) => ({ location_code, language_code });

export async function dfsRankedKeywords(login, password, domain, opts = {}) {
  const { cost, result } = await dfs(login, password, '/dataforseo_labs/google/ranked_keywords/live', {
    target: domain, ...locale(opts), limit: opts.limit ?? 200,
    filters: [['ranked_serp_element.serp_item.rank_group', '<=', opts.maxPosition ?? 20]],
    order_by: ['keyword_data.keyword_info.search_volume,desc'],
  });
  const items = (result?.items || []).map((i) => ({
    keyword: i.keyword_data?.keyword,
    volume: i.keyword_data?.keyword_info?.search_volume,
    difficulty: i.keyword_data?.keyword_properties?.keyword_difficulty,
    intent: i.keyword_data?.search_intent_info?.main_intent,
    position: i.ranked_serp_element?.serp_item?.rank_group,
    url: i.ranked_serp_element?.serp_item?.url,
  }));
  return { cost, items };
}

export async function dfsSearchVolume(login, password, keywords, opts = {}) {
  const { cost, result } = await dfs(login, password, '/dataforseo_labs/google/keyword_overview/live', {
    keywords: keywords.slice(0, 700), ...locale(opts),
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
    keyword, ...locale(opts), depth: opts.depth ?? 10,
  });
  const items = (result?.items || [])
    .filter((i) => ['organic', 'featured_snippet', 'people_also_ask'].includes(i.type))
    .map((i) => i.type === 'people_also_ask'
      ? { type: i.type, questions: (i.items || []).map((q) => q.title) }
      : { type: i.type, position: i.rank_group, title: i.title, url: i.url, description: i.description });
  return { cost, items };
}
