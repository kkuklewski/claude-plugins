// Turns raw Search Console rows into ranked content opportunities.
// Pure functions — no I/O — so tests/run.sh can exercise them with fixtures.

// Rough organic CTR by average position (blended desktop/mobile). Only used to rank
// opportunities against each other, never shown as a promise of traffic.
const CTR_CURVE = [0, 0.28, 0.15, 0.10, 0.07, 0.05, 0.04, 0.03, 0.025, 0.02, 0.018];
export const expectedCtr = (pos) => (pos < 1 ? CTR_CURVE[1] : pos <= 10 ? CTR_CURVE[Math.round(pos)] : pos <= 20 ? 0.01 : 0.002);

// Question starters in the languages the plugin is used with most; extend via opts.questionWords.
const QUESTION_WORDS = ['how', 'what', 'why', 'when', 'which', 'who', 'where', 'can', 'is', 'are', 'does', 'do', 'should', 'vs', 'best',
  'jak', 'co', 'czy', 'dlaczego', 'kiedy', 'ile', 'który', 'która', 'które', 'gdzie', 'najlepszy', 'najlepsze',
  'wie', 'was', 'warum', 'wann', 'welche'];

const round = (n) => Math.round(n);

export function analyze({ rows, pagesNow = [], pagesPrev = [] }, opts = {}) {
  const minImpr = opts.minImpressions ?? 50;
  const brand = (opts.brandTerms || []).map((b) => b.toLowerCase()).filter(Boolean);
  const qWords = new Set([...QUESTION_WORDS, ...(opts.questionWords || [])]);
  const top = opts.top ?? 25;
  const isBrand = (q) => brand.some((b) => q.toLowerCase().includes(b));
  const nonBrand = rows.filter((r) => r.query && !isBrand(r.query));

  // Aggregate by query (all pages) — needed for gaps and cannibalisation.
  const byQuery = new Map();
  for (const r of nonBrand) {
    const q = byQuery.get(r.query) || { query: r.query, impressions: 0, clicks: 0, pages: [], bestPosition: Infinity };
    q.impressions += r.impressions; q.clicks += r.clicks;
    q.pages.push({ page: r.page, impressions: r.impressions, clicks: r.clicks, position: r.position });
    q.bestPosition = Math.min(q.bestPosition, r.position);
    byQuery.set(r.query, q);
  }

  // 1. Striking distance: ranking 4.5–20 — a refresh or new section can reach the top 3.
  const strikingDistance = nonBrand
    .filter((r) => r.position >= 4.5 && r.position <= 20 && r.impressions >= minImpr)
    .map((r) => ({ ...r, potentialClicks: round(Math.max(0, r.impressions * expectedCtr(3) - r.clicks)) }))
    .sort((a, b) => b.potentialClicks - a.potentialClicks).slice(0, top);

  // 2. Low CTR at a good position: the snippet (title/description) loses the click.
  const lowCtr = nonBrand
    .filter((r) => r.position < 4.5 && r.impressions >= minImpr && r.ctr < expectedCtr(r.position) * 0.5)
    .map((r) => ({ ...r, expectedCtr: expectedCtr(r.position), missedClicks: round(r.impressions * expectedCtr(r.position) - r.clicks) }))
    .sort((a, b) => b.missedClicks - a.missedClicks).slice(0, top);

  // 3. Cannibalisation: two or more pages each take >= 10% of a query's impressions.
  const cannibalisation = [...byQuery.values()]
    .filter((q) => q.impressions >= minImpr)
    .map((q) => ({ ...q, pages: q.pages.filter((p) => p.impressions / q.impressions >= 0.1).sort((a, b) => b.impressions - a.impressions) }))
    .filter((q) => q.pages.length >= 2)
    .sort((a, b) => b.impressions - a.impressions).slice(0, top)
    .map(({ bestPosition, ...q }) => q);

  // 4. Content gaps: Google shows the site for the query but no page ranks in the top 20
  //    — the strongest signal for a NEW post. Question-shaped queries are flagged as blog-ready.
  const contentGaps = [...byQuery.values()]
    .filter((q) => q.bestPosition > 20 && q.impressions >= Math.max(10, minImpr / 2))
    .map((q) => ({
      query: q.query, impressions: q.impressions, bestPosition: +q.bestPosition.toFixed(1),
      closestPage: q.pages.sort((a, b) => a.position - b.position)[0]?.page,
      question: q.query.toLowerCase().split(/\s+/).some((w) => qWords.has(w)),
    }))
    .sort((a, b) => (b.question - a.question) || (b.impressions - a.impressions)).slice(0, top);

  // 5. Decay: pages that lost >= 30% of clicks versus the previous period of the same length.
  const prev = new Map(pagesPrev.map((p) => [p.page, p]));
  const decay = pagesNow
    .map((p) => ({ page: p.page, clicksNow: p.clicks, clicksPrev: prev.get(p.page)?.clicks ?? 0, positionNow: p.position, positionPrev: prev.get(p.page)?.position }))
    .concat(pagesPrev.filter((p) => !pagesNow.some((n) => n.page === p.page)).map((p) => ({ page: p.page, clicksNow: 0, clicksPrev: p.clicks, positionNow: null, positionPrev: p.position })))
    .filter((p) => p.clicksPrev >= (opts.minDecayClicks ?? 20) && p.clicksNow <= p.clicksPrev * 0.7)
    .map((p) => ({ ...p, change: `${round(((p.clicksNow - p.clicksPrev) / p.clicksPrev) * 100)}%` }))
    .sort((a, b) => (b.clicksPrev - b.clicksNow) - (a.clicksPrev - a.clicksNow)).slice(0, top);

  const totals = nonBrand.reduce((t, r) => ({ clicks: t.clicks + r.clicks, impressions: t.impressions + r.impressions }), { clicks: 0, impressions: 0 });
  return {
    summary: {
      rows: rows.length, nonBrandRows: nonBrand.length, queries: byQuery.size, ...totals,
      counts: { strikingDistance: strikingDistance.length, lowCtr: lowCtr.length, cannibalisation: cannibalisation.length, contentGaps: contentGaps.length, decay: decay.length },
    },
    strikingDistance, lowCtr, cannibalisation, contentGaps, decay,
  };
}

// Competitor keywords the site doesn't get impressions for at all (or only beyond position 20).
export function competitorGap(competitorItems, ownRows, opts = {}) {
  const own = new Map();
  for (const r of ownRows) own.set(r.query.toLowerCase(), Math.min(own.get(r.query.toLowerCase()) ?? Infinity, r.position));
  const seen = new Map();
  for (const { competitor, items } of competitorItems) {
    for (const i of items) {
      if (!i.keyword) continue;
      const k = i.keyword.toLowerCase();
      const ownPos = own.get(k);
      if (ownPos !== undefined && ownPos <= 20) continue;
      const g = seen.get(k) || { keyword: i.keyword, volume: i.volume, difficulty: i.difficulty, intent: i.intent, yourPosition: ownPos ?? null, competitors: [] };
      g.competitors.push({ competitor, position: i.position, url: i.url });
      seen.set(k, g);
    }
  }
  return [...seen.values()]
    .sort((a, b) => (b.competitors.length - a.competitors.length) || ((b.volume ?? 0) - (a.volume ?? 0)))
    .slice(0, opts.top ?? 50);
}
