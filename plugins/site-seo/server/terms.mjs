// NeuronWriter-style term plan: what the pages ranking for a keyword have in common.
// Pure functions — no I/O — so tests/run.sh can exercise them with fixtures.
// Input pages are { url, headings: [{ level, text }], text } (from DataForSEO content parsing).

// Light suffix-stripping stemmers: good enough to merge inflected forms
// ("cateringu dietetycznego" → "catering dietetyczn"), not a real lemmatiser.
const PL_SUFFIXES = ['owania', 'owanie', 'ościami', 'ościach', 'iejszy', 'iejsza', 'iejsze', 'ejszego', 'ejszy', 'ejsza', 'ejsze',
  'ościom', 'owych', 'owymi', 'owego', 'owemu', 'ością', 'ości', 'ość', 'ami', 'ach', 'owi', 'owy', 'owa', 'owe', 'ową', 'ego', 'emu',
  'ymi', 'imi', 'ych', 'ich', 'iej', 'ej', 'om', 'ów', 'ie', 'ia', 'ii', 'iu', 'ią', 'ię', 'ym', 'im', 'em', 'ą', 'ę', 'a', 'e', 'i', 'o', 'u', 'y'];
const EN_SUFFIXES = ['ing', 'ies', 'es', 'ed', 's'];
const DE_SUFFIXES = ['ungen', 'ung', 'en', 'er', 'es', 'e', 'n', 's'];
const SUFFIXES = { pl: PL_SUFFIXES, en: EN_SUFFIXES, de: DE_SUFFIXES };

// Stop words plus words that appear on every page of any site (UI, generic verbs).
const STOP = {
  pl: `a aby ach acz ale albo ani aż bardziej bardzo bez bo by być był była było były będzie będą bądź ci cię ciebie co coś czy czyli
    dla do dlatego dziś gdy gdyż gdzie go i ich im inne inny innych ja jak jaki jakie jako je jego jej jest jestem jesteś jeszcze jeśli
    już ją każdy kiedy kto która które którego której który których ku lub ma mają mam mamy masz może możesz można mnie mi mu my na nad
    nam nas nasz nasza nasze naszej naszych nawet nie nich nic nim niż no o od oraz on ona oni ono po pod ponieważ przed przez przy
    również się sobie sposób są ta tak taki takie także tam te tego tej ten to tobą tobie tu tutaj twoja twoje twój ty tych tylko tym
    u w we więc wszystko wszystkie z za ze że żeby oraz np itp itd też mogą ich tego jako pod bez nad lub więcej mniej bardzo wiele
    sprawdź sprawdzić zobacz czytaj więcej kliknij tutaj zamów zamówienie zaloguj koszyk menu cookies cookie polityka prywatności regulamin
    copyright prawa zastrzeżone newsletter udostępnij facebook instagram
    twój twoja twoje twojego twojej twoim twoich twoją twym swój swoja swoje swojego swojej swoim swoich swoją
    nasz nasza nasze naszego naszej naszym naszych naszą naszymi wasz wasza wasze waszego waszym
    mój moja moje mojego ten ta te tego tej tym tę ci tamten ów
    zawsze nigdy często czasem teraz dziś jutro wczoraj zaraz właśnie po prostu prostu naprawdę wtedy potem później
    każdy każda każde każdego każdej każdym wszyscy wszystkich wszystkim cały cała całe całego całej
    łatwo łatwy szybko szybki proste prosty dobrze dobry dobra dobre lepiej lepszy najlepszy najlepsza najlepsze
    warto chcesz chcemy chce chcą możemy mogę musisz musimy trzeba potrzebujesz jesteśmy są będziesz będziemy
    wybierz poznaj skontaktuj dowiedz zapraszamy zapisz dołącz odkryj wypróbuj kup dodaj pobierz przejdź napisz zadzwoń
    oferujemy dostarczamy przygotowujemy dbamy zapewniamy obsługujemy gwarantujemy realizujemy współpracujemy działamy możemy
    nami wami nimi którym którymi której których którego któremu jaką jakiej jakich jakim temu tamtym stronie strona strony strone tutaj kontakt ok tak nie
    zł pln rok roku lat dni dzień dnia godzin godziny min`,
  en: `a about above after again all also am an and any are as at be because been before being below between both but by can could
    did do does doing down during each few for from further had has have having he her here hers him his how i if in into is it its
    just me more most my no nor not now of off on once only or other our out over own same she should so some such than that the their
    them then there these they this those through to too under until up very was we were what when where which while who whom why will
    with you your read more click here login cart cookie cookies privacy policy terms share`,
  de: `aber alle als also am an auch auf aus bei bin bis bist da damit dann der den des dem die das dass du durch ein eine einem einen
    einer eines er es für hat hatte ich ihr ihre im in ist ja kann kein keine mit nach nicht noch nur oder schon sehr sich sie sind so
    über um und uns unser von vor war was weil wenn wie wir wird zu zum zur mehr lesen`,
};
const stopSet = (lang) => new Set((STOP[lang] || STOP.en).split(/\s+/).filter(Boolean));

export function stem(word, lang = 'pl') {
  const sfx = SUFFIXES[lang] || EN_SUFFIXES;
  for (const s of sfx) if (word.endsWith(s) && word.length - s.length >= 4) return word.slice(0, -s.length);
  return word;
}

export const tokenize = (text) => (text.toLowerCase().match(/\p{L}[\p{L}\p{N}-]*/gu) || []).filter((w) => w.length > 1);
const wordCount = (text) => (text.match(/\p{L}+/gu) || []).length;

// 1–3-word phrases keyed by stem sequence; stop words may sit inside a phrase ("dieta dla firm") but never at its edges.
function phrases(text, lang, stops) {
  const toks = tokenize(text);
  const out = new Map(); // key → { count, forms: Map(surface → count) }
  for (let i = 0; i < toks.length; i++) {
    if (stops.has(toks[i]) || /^\d/.test(toks[i])) continue;
    for (let n = 1; n <= 3 && i + n <= toks.length; n++) {
      const win = toks.slice(i, i + n);
      if (stops.has(win[n - 1]) || win.some((w) => /^\d/.test(w))) continue;
      const key = win.map((w) => (stops.has(w) ? w : stem(w, lang))).join(' ');
      const surface = win.join(' ');
      const e = out.get(key) || { count: 0, forms: new Map() };
      e.count++; e.forms.set(surface, (e.forms.get(surface) || 0) + 1);
      out.set(key, e);
    }
  }
  return out;
}

const quantile = (vals, q) => {
  const s = [...vals].sort((a, b) => a - b); const k = (s.length - 1) * q; const lo = Math.floor(k); const hi = Math.min(lo + 1, s.length - 1);
  return s[lo] + (s[hi] - s[lo]) * (k - lo);
};
const QUESTION_RE = /\?\s*$|^(jak|co|czy|dlaczego|kiedy|ile|który|która|które|gdzie|how|what|why|when|which|who|where|can|is|are|does|should|wie|was|warum|wann|welche)\b/i;

/**
 * pages: [{ url, headings: [{ level, text }], text }] — competitor pages (own site excluded by the caller).
 * opts: { keyword, lang, minShare (0.4), paa: [questions], draft: { text, headings } , maxTerms (60) }
 */
export function termPlan(pages, opts = {}) {
  const lang = opts.lang || 'pl';
  const stops = stopSet(lang);
  const minShare = opts.minShare ?? 0.4;
  const maxTerms = opts.maxTerms ?? 60;
  const usable = pages.filter((p) => wordCount(p.text) >= 150);
  const n = usable.length;
  if (n < 3) return { error: `Only ${n} competitor pages had enough text (need 3+).`, pages: pages.map((p) => ({ url: p.url, words: wordCount(p.text) })) };

  const stats = usable.map((p) => {
    const words = wordCount(p.text);
    const body = phrases(p.text, lang, stops);
    const heads = phrases(p.headings.filter((h) => h.level > 1).map((h) => h.text).join(' . '), lang, stops);
    return { url: p.url, words, body, heads, headings: p.headings };
  });
  const words = stats.map((s) => s.words);
  const target = Math.round(quantile(words, 0.5));
  const minPages = Math.max(2, Math.ceil(n * minShare));

  // Body terms: used by ≥ minShare of pages. Range = 25th–75th percentile of per-1000-word use, scaled to target length.
  const keys = new Map();
  for (const s of stats) for (const [k, e] of s.body) {
    const agg = keys.get(k) || { pages: 0, forms: new Map() };
    agg.pages++; for (const [f, c] of e.forms) agg.forms.set(f, (agg.forms.get(f) || 0) + c);
    keys.set(k, agg);
  }
  let terms = [];
  for (const [k, agg] of keys) {
    if (agg.pages < minPages) continue;
    const perK = stats.map((s) => ((s.body.get(k)?.count || 0) / s.words) * 1000);
    const min = Math.max(1, Math.round((quantile(perK, 0.25) * target) / 1000));
    const max = Math.max(min, Math.round((quantile(perK, 0.75) * target) / 1000));
    const headingPages = stats.filter((s) => s.heads.has(k)).length;
    const term = [...agg.forms].sort((a, b) => b[1] - a[1])[0][0];
    terms.push({ key: k, term, words: k.split(' ').length, pages: agg.pages, min, max, headingPages });
  }
  // Drop a phrase when a longer phrase containing it is used by the same pages (keeps "catering dietetyczny", drops "dietetyczny").
  terms = terms.filter((t) => !terms.some((o) => o.words > t.words && o.pages >= t.pages && ` ${o.key} `.includes(` ${t.key} `) && o.min >= t.min));
  // Rank: share of pages, boosted for phrases (more specific) and for heading use (more central to the topic).
  const rank = (t) => (t.pages / n) * (t.words > 1 ? 1.5 : 1) * (1 + t.headingPages / n);
  terms.sort((a, b) => rank(b) - rank(a) || b.max - a.max);
  terms = terms.slice(0, maxTerms);

  const headingTerms = terms.filter((t) => t.headingPages >= Math.min(2, n)).map(({ term, headingPages }) => ({ term, pages: headingPages }))
    .sort((a, b) => b.pages - a.pages);
  const kwKey = opts.keyword ? tokenize(opts.keyword).map((w) => (stops.has(w) ? w : stem(w, lang))).join(' ') : null;
  const seen = new Set();
  const questions = [
    ...(opts.paa || []).map((q) => ({ q, source: 'people-also-ask' })),
    ...stats.flatMap((s) => s.headings.filter((h) => h.level > 1 && QUESTION_RE.test(h.text.trim())).map((h) => ({ q: h.text.trim(), source: s.url }))),
  ].filter(({ q }) => !seen.has(q.toLowerCase()) && seen.add(q.toLowerCase()));

  const plan = {
    competitors: stats.map((s) => ({ url: s.url, words: s.words, h2: s.headings.filter((h) => h.level === 2).length, h3: s.headings.filter((h) => h.level === 3).length })),
    skipped: pages.filter((p) => !usable.includes(p)).map((p) => ({ url: p.url, words: wordCount(p.text), reason: 'too little text' })),
    target: {
      words: { median: target, min: Math.min(...words), max: Math.max(...words) },
      h2: Math.round(quantile(stats.map((s) => s.headings.filter((h) => h.level === 2).length), 0.5)),
      h3: Math.round(quantile(stats.map((s) => s.headings.filter((h) => h.level === 3).length), 0.5)),
    },
    keyword: kwKey ? { phrase: opts.keyword, pagesUsingExact: stats.filter((s) => s.body.has(kwKey)).length } : undefined,
    terms: terms.map(({ term, pages: p, min, max, headingPages }) => ({ term, pages: `${p}/${n}`, use: min === max ? `${min}` : `${min}-${max}`, inHeadings: headingPages })),
    headingTerms,
    questions,
    competitorHeadings: stats.map((s) => ({ url: s.url, headings: s.headings.filter((h) => h.level <= 3).slice(0, 30).map((h) => `H${h.level} ${h.text}`) })),
  };
  // What a saved plan needs to score later drafts without a new SERP (see scoreSavedPlan).
  plan.scoring = { lang, kwKey, terms: terms.map(({ key, term, min, max, headingPages }) => ({ key, term, min, max, headingPages })) };
  if (opts.draft) plan.draftScore = scoreDraft(opts.draft, terms, plan.target, { lang, stops, kwKey });
  return plan;
}

// Score a draft against a plan saved earlier (term_plan savePlan), so scores stay comparable between revisions.
export function scoreSavedPlan(saved, draft) {
  const { lang, kwKey, terms } = saved.scoring || {};
  if (!terms) throw new Error('Saved plan has no "scoring" section — re-run term_plan with savePlan.');
  return scoreDraft(draft, terms, saved.target, { lang, stops: stopSet(lang), kwKey });
}

// Draft = { text, headings: [{ level, text }] } — markdown already split by the caller (see parseMarkdown).
function scoreDraft(draft, terms, target, { lang, stops, kwKey }) {
  const body = phrases(draft.text, lang, stops);
  const heads = phrases(draft.headings.filter((h) => h.level > 1).map((h) => h.text).join(' . '), lang, stops);
  const words = wordCount(draft.text);
  const missing = [], over = [];
  let hit = 0, headHit = 0, headWant = 0;
  for (const t of terms) {
    const c = body.get(t.key)?.count || 0;
    if (c >= t.min) hit++; else missing.push({ term: t.term, have: c, want: t.min === t.max ? `${t.min}` : `${t.min}-${t.max}` });
    if (c > Math.max(t.max * 1.5, t.max + 2)) over.push({ term: t.term, have: c, max: t.max });
    if (t.headingPages >= 2) { headWant++; if (heads.has(t.key)) headHit++; }
  }
  const termPct = terms.length ? hit / terms.length : 1;
  const headPct = headWant ? headHit / headWant : 1;
  const lenPct = Math.min(1, words / Math.max(1, target.words.median * 0.8));
  const h1 = draft.headings.find((h) => h.level === 1)?.text || '';
  return {
    score: Math.round(100 * (0.6 * termPct + 0.25 * headPct + 0.15 * lenPct)),
    words, targetWords: target.words.median,
    terms: `${hit}/${terms.length}`, headingTerms: `${headHit}/${headWant}`,
    keywordInH1: kwKey ? containsKeyword(h1, kwKey, lang, stops) : undefined,
    missing, overused: over,
  };
}

// Keyword stems appear in order, ignoring stop words between them ("obiady dla pracowników w Szczecinie").
function containsKeyword(text, kwKey, lang, stops) {
  const content = (ws) => ws.filter((w) => !stops.has(w)).map((w) => stem(w, lang)).join(' ');
  return ` ${content(tokenize(text))} `.includes(` ${content(kwKey.split(' '))} `);
}

// Minimal markdown → { text, headings }; drops front matter, code, link targets and the reviewer checklist.
export function parseMarkdown(md) {
  const src = md.replace(/^---\n[\s\S]*?\n---\n/, '').split(/\n---\n## Review checklist/)[0].replace(/```[\s\S]*?```/g, '')
    .replace(/\[VERIFY:[^\]]*\]/g, ''); // reviewer notes aren't article text
  const headings = [];
  const text = src.split('\n').map((line) => {
    const m = line.match(/^(#{1,6})\s+(.*)$/);
    if (m) { headings.push({ level: m[1].length, text: m[2].trim() }); return m[2]; }
    return line;
  }).join('\n').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`>|#]/g, ' ');
  return { text, headings };
}

// DataForSEO on_page/content_parsing page_content → { headings, text }. Uses main_topic only (skips header,
// footer and secondary_topic, where menus, sidebars and "related articles" live).
export function fromContentParsing(pc) {
  const headings = [], parts = [];
  for (const t of pc?.main_topic || []) {
    if (t.h_title) { headings.push({ level: t.level || 2, text: t.h_title.trim() }); parts.push(t.h_title); }
    for (const c of t.primary_content || []) if (c.text) parts.push(c.text);
  }
  return { headings, text: parts.join('\n') };
}
