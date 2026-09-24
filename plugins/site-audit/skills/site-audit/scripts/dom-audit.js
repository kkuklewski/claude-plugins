// Live DOM audit. Paste the whole file into a browser javascript tool; it evaluates to a
// Promise resolving to a JSON-serialisable report. No dependencies.
(async () => {
  const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
  const short = (el) => {
    if (!el) return null;
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    if (cls) s += '.' + cls;
    return s;
  };
  const text = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  const cap = (arr, n = 15) => ({ count: arr.length, items: arr.slice(0, n) });
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
  };
  const meta = (sel) => document.querySelector(sel)?.getAttribute('content') ?? null;

  // LCP element (buffered observer)
  const lcp = await new Promise((resolve) => {
    let last = null;
    try {
      const po = new PerformanceObserver((l) => { const e = l.getEntries(); last = e[e.length - 1]; });
      po.observe({ type: 'largest-contentful-paint', buffered: true });
      setTimeout(() => { po.disconnect(); resolve(last); }, 300);
    } catch { resolve(null); }
  });
  const lcpEl = lcp?.element;
  // let finite animations (scroll reveals, fades) finish so nothing is sampled mid-transition
  try {
    const finite = document.getAnimations().filter((a) => a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming?.().endTime));
    await Promise.race([Promise.all(finite.map((a) => a.finished.catch(() => {}))), new Promise((r) => setTimeout(r, 2500))]);
  } catch {}
  const nav = performance.getEntriesByType('navigation')[0];

  // --- SEO / head
  const title = document.title || '';
  const desc = meta('meta[name="description"]') || '';
  const seo = {
    lang: document.documentElement.getAttribute('lang'),
    title, titleLength: title.length,
    description: desc, descriptionLength: desc.length,
    canonical: document.querySelector('link[rel="canonical"]')?.href ?? null,
    robotsMeta: meta('meta[name="robots"]'),
    ogTitle: meta('meta[property="og:title"]'),
    ogImage: meta('meta[property="og:image"]'),
    twitterCard: meta('meta[name="twitter:card"]'),
    viewport: meta('meta[name="viewport"]'),
    favicon: $$('link[rel~="icon"]').map((l) => l.getAttribute('href')),
    appleTouchIcon: document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href') ?? null,
    manifest: document.querySelector('link[rel="manifest"]')?.getAttribute('href') ?? null,
    // dev = dev overlay element, HMR/refresh script URLs, unhashed dev chunks, or buildId "development".
    // Never match page text: production HTML/RSC payloads can contain these words.
    isDevBuild: (() => {
      const srcs = $$('script[src]').map((s) => s.getAttribute('src') || '');
      return !!document.querySelector('nextjs-portal, [data-nextjs-dev-overlay], [data-nextjs-toast]')
        || srcs.some((u) => /react-refresh|hmr-client|webpack-hmr|next-devtools|_dev_|\/__nextjs_/.test(u))
        || srcs.some((u) => /\/_next\/static\/chunks\/(main-app|webpack|app-pages-internals|app\/layout)\.js(\?|$)/.test(u))
        || window.__NEXT_DATA__?.buildId === 'development';
    })(),
  };

  // --- headings
  const hs = $$('h1,h2,h3,h4,h5,h6').filter(visible);
  const skips = [];
  let prev = 0;
  for (const h of hs) {
    const lvl = +h.tagName[1];
    if (prev && lvl > prev + 1) skips.push(`h${prev} → h${lvl}: "${text(h)}"`);
    prev = lvl;
  }
  const headings = {
    h1: $$('h1').map(text),
    outline: hs.slice(0, 40).map((h) => `${h.tagName.toLowerCase()} ${text(h)}`),
    skippedLevels: skips,
    firstHeadingIsH1: hs[0]?.tagName === 'H1',
  };

  // --- landmarks
  const landmarks = {
    main: $$('main,[role="main"]').length,
    header: $$('header,[role="banner"]').length,
    nav: $$('nav,[role="navigation"]').length,
    navWithoutLabelWhenMultiple: $$('nav').length > 1 ? $$('nav:not([aria-label]):not([aria-labelledby])').length : 0,
    footer: $$('footer,[role="contentinfo"]').length,
    sections: $$('section').length,
    clickableDivs: cap($$('div[onclick],span[onclick],div[role="button"]:not([tabindex])').map(short)),
  };

  // --- images
  const imgs = $$('img');
  const images = {
    total: imgs.length,
    missingAlt: cap(imgs.filter((i) => !i.hasAttribute('alt')).map((i) => i.currentSrc || i.src)),
    missingDimensions: cap(imgs.filter((i) => i.getAttribute('data-nimg') !== 'fill' && !(i.getAttribute('width') && i.getAttribute('height'))).map((i) => i.currentSrc || i.src)),
    fillWithoutSizes: cap(imgs.filter((i) => i.getAttribute('data-nimg') === 'fill' && !i.getAttribute('sizes')).map((i) => i.currentSrc || i.src)),
    notOptimized: cap(imgs.filter((i) => {
      const src = i.currentSrc || i.src || '';
      return src && !src.startsWith('data:') && !/\/_next\/image|\.svg(\?|$)|\.webp(\?|$)|\.avif(\?|$)/i.test(src);
    }).map((i) => i.currentSrc || i.src)),
    oversized: cap(imgs.map((i) => {
      const src = i.currentSrc || i.src || '';
      if (/\.svg(\?|$)/i.test(src) || !i.clientWidth) return null;
      const w = +(src.match(/[?&]w=(\d+)/)?.[1] || 0) || (i.srcset ? 0 : i.naturalWidth); // next/image ?w=, else intrinsic
      return w && w > i.clientWidth * devicePixelRatio * 2 ? `${src} served ${w}px, shown ${i.clientWidth}px @${devicePixelRatio}x` : null;
    }).filter(Boolean)),
    lazyAboveFold: cap(imgs.filter((i) => { if (i.loading !== 'lazy' || !visible(i)) return false; const r = i.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0 && r.left < innerWidth && r.right > 0; }).map((i) => i.currentSrc || i.src)),
  };
  const perf = {
    lcpMs: lcp ? Math.round(lcp.startTime) : null,
    lcpNote: lcp ? null : 'No LCP entry (tab loaded in background or no paint yet) — take LCP from Lighthouse.',
    lcpElement: short(lcpEl),
    lcpIsImage: lcpEl?.tagName === 'IMG',
    lcpImageLazy: lcpEl?.tagName === 'IMG' ? lcpEl.loading === 'lazy' : null,
    lcpImageFetchPriority: lcpEl?.tagName === 'IMG' ? lcpEl.getAttribute('fetchpriority') : null,
    lcpImagePreloaded: lcpEl?.tagName === 'IMG' ? !!document.querySelector(`link[rel="preload"][as="image"]`) : null,
    ttfbMs: nav ? Math.round(nav.responseStart - nav.requestStart) : null,
    domContentLoadedMs: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
    loadMs: nav ? Math.round(nav.loadEventEnd) : null,
    transferKB: Math.round(performance.getEntriesByType('resource').reduce((a, r) => a + (r.transferSize || 0), (nav?.transferSize || 0)) / 1024),
    requests: performance.getEntriesByType('resource').length + 1,
    rscPrefetches: performance.getEntriesByType('resource').filter((r) => /[?&]_rsc=/.test(r.name)).length,
    thirdPartyKB: Math.round(performance.getEntriesByType('resource').filter((r) => !r.name.startsWith(location.origin)).reduce((a, r) => a + (r.transferSize || 0), 0) / 1024),
    jsKB: Math.round(performance.getEntriesByType('resource').filter((r) => /\.m?js(\?|$)/.test(r.name)).reduce((a, r) => a + (r.transferSize || 0), 0) / 1024),
    htmlKB: nav ? Math.round((nav.transferSize || 0) / 1024) : null,
    htmlDecodedKB: nav ? Math.round((nav.decodedBodySize || 0) / 1024) : null,
  };

  // --- scripts & fonts
  const origin = location.origin;
  const scripts = $$('script[src]');
  const thirdParty = scripts.filter((s) => !s.src.startsWith(origin)).map((s) => s.src);
  const blockingInHead = $$('head script[src]:not([async]):not([defer]):not([type="module"])').map((s) => s.src);
  const fonts = {
    googleFontsLinks: $$('link[href*="fonts.googleapis.com"],link[href*="fonts.gstatic.com"]').map((l) => l.href),
    preloadedFonts: $$('link[rel="preload"][as="font"]').map((l) => l.href),
    bodyFontFamily: getComputedStyle(document.body).fontFamily,
    loadedFaces: Array.from(document.fonts || []).filter((f) => f.status === 'loaded').map((f) => `${f.family} ${f.weight} ${f.style}`).slice(0, 20),
  };

  // --- stylesheet heuristics (same-origin sheets only)
  const pxFont = [], outlineNone = [];
  let rootPxFont = null, unreadableSheets = 0;
  const walk = (rules) => {
    for (const r of rules) {
      if (r.cssRules && !r.selectorText) { walk(r.cssRules); continue; }
      if (!r.style) continue;
      const fs = r.style.getPropertyValue('font-size');
      if (/^\d+(\.\d+)?px$/.test(fs.trim())) {
        if (/^(html|:root)$/.test(r.selectorText?.trim())) rootPxFont = fs;
        else pxFont.push(`${r.selectorText} { font-size: ${fs} }`);
      }
      const ol = r.style.getPropertyValue('outline') + ' ' + r.style.getPropertyValue('outline-style');
      if (/focus/.test(r.selectorText || '') && !/focus-visible/.test(r.selectorText || '') && /none|(^|\s)0(px)?(\s|$)/.test(ol)) outlineNone.push(r.selectorText);
    }
  };
  for (const sh of document.styleSheets) {
    try { walk(sh.cssRules); } catch { unreadableSheets++; }
  }
  const css = { pxFontSizeRules: cap(pxFont), rootFontSizePx: rootPxFont, focusOutlineRemoved: cap(outlineNone), unreadableSheets };

  // --- links & accessible names
  const links = $$('a[href]');
  const accName = (el) => (
    el.getAttribute('aria-label') ||
    (el.getAttribute('aria-labelledby') && el.getAttribute('aria-labelledby').split(/\s+/).map((id) => document.getElementById(id)?.textContent || '').join(' ')) ||
    el.textContent ||
    $$('img[alt]', el).map((i) => i.alt).join(' ') ||
    $$('svg title', el).map((t) => t.textContent).join(' ') ||
    el.getAttribute('title') || ''
  ).trim();
  const external = links.filter((a) => { try { return new URL(a.href).origin !== origin && /^https?:/.test(a.href); } catch { return false; } });
  const linkReport = {
    total: links.length,
    externalSameTab: cap(external.filter((a) => a.target !== '_blank').map((a) => a.href)),
    blankWithoutNoopener: cap(links.filter((a) => a.target === '_blank' && !/noopener|noreferrer/.test(a.rel)).map((a) => a.href)),
    internalNewTab: cap(links.filter((a) => a.target === '_blank' && !external.includes(a)).map((a) => a.href)),
    emptyHref: cap(links.filter((a) => ['#', '', 'javascript:void(0)'].includes(a.getAttribute('href'))).map(short)),
  };
  const interactive = $$('a[href],button,[role="button"],[role="link"],input[type="submit"],input[type="button"]').filter(visible);
  const unnamed = interactive.filter((el) => !(el.value && el.tagName === 'INPUT') && !accName(el)).map((el) => el.outerHTML.slice(0, 120));
  const fields = $$('input:not([type="hidden"]):not([type="submit"]):not([type="button"]),select,textarea').filter(visible);
  const unlabelled = fields.filter((f) => !(f.id && document.querySelector(`label[for="${CSS.escape(f.id)}"]`)) && !f.closest('label') && !f.getAttribute('aria-label') && !f.getAttribute('aria-labelledby')).map((f) => f.outerHTML.slice(0, 120));

  // --- skip link
  const focusables = $$('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])').filter((el) => !el.disabled);
  const first = focusables[0];
  const skipHref = first?.getAttribute('href');
  const skipLink = {
    firstFocusable: first ? `${short(first)} "${text(first)}"` : null,
    looksLikeSkipLink: !!(skipHref && skipHref.startsWith('#') && /skip|main|content|przejd/i.test(text(first) + ' ' + skipHref)),
    targetExists: !!(skipHref && skipHref.length > 1 && document.getElementById(skipHref.slice(1))),
  };

  // --- ARIA widgets
  const ariaHiddenFocusable = $$('[aria-hidden="true"]').flatMap((c) => $$('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])', c).filter((el) => !el.disabled && !el.closest('[inert]'))).map(short);
  const widgets = {
    expandables: $$('[aria-expanded]').map((el) => `${short(el)} "${text(el)}" expanded=${el.getAttribute('aria-expanded')} controls=${el.getAttribute('aria-controls')}`).slice(0, 10),
    dialogs: $$('dialog,[role="dialog"],[role="alertdialog"]').map((d) => `${short(d)} modal=${d.getAttribute('aria-modal') ?? (d.tagName === 'DIALOG')} label=${!!(d.getAttribute('aria-label') || d.getAttribute('aria-labelledby'))}`),
    ariaHiddenFocusable: cap(ariaHiddenFocusable),
    positiveTabindex: cap($$('[tabindex]').filter((el) => +el.getAttribute('tabindex') > 0).map(short)),
  };

  // --- contrast
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 }; };
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const bgOf = (el) => {
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.backgroundImage !== 'none') return null; // can't judge over images/gradients
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0.9) return c;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  };
  const hex = ({ r, g, b }) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  const ratioOf = (a, b) => { const [L1, L2] = [lum(a), lum(b)].sort((x, y) => y - x); return (L1 + 0.05) / (L2 + 0.05); };
  // nearest passing colour: move fg toward black (light bg) or white (dark bg) until the ratio is met
  const suggest = (fg, bg, target) => {
    const to = lum(bg) > 0.18 ? 0 : 255;
    for (let t = 0.02; t <= 1; t += 0.02) {
      const c = { r: fg.r + (to - fg.r) * t, g: fg.g + (to - fg.g) * t, b: fg.b + (to - fg.b) * t };
      if (ratioOf(c, bg) >= target) return hex(c);
    }
    return null;
  };
  // media layers (photos, video, canvas, background images/gradients) that text may sit on
  const docRect = (e) => { const r = e.getBoundingClientRect(); return { l: r.left + scrollX, t: r.top + scrollY, r: r.right + scrollX, b: r.bottom + scrollY }; };
  const layers = $$('img,video,canvas,picture,svg image,iframe,*').filter((e) => {
    if (/^(IMG|VIDEO|CANVAS|PICTURE|IMAGE|IFRAME)$/i.test(e.tagName)) return visible(e);
    return getComputedStyle(e).backgroundImage !== 'none' && visible(e);
  }).map((e) => ({ e, ...docRect(e) })).filter((x) => x.r - x.l > 40 && x.b - x.t > 40).slice(0, 400);
  const opaqueHost = (el) => { for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a > 0.9) return e; } return document.documentElement; };
  const overMedia = (el) => {
    const r = docRect(el); const x = (r.l + r.r) / 2, y = (r.t + r.b) / 2; const host = opaqueHost(el);
    return layers.some((L) => L.e !== el && !L.e.contains(el) && !el.contains(L.e) && (host === L.e || host.contains(L.e))
      && x >= L.l && x <= L.r && y >= L.t && y <= L.b);
  };
  const animating = new Set(document.getAnimations().filter((a) => a.playState === 'running').map((a) => a.effect?.target).filter(Boolean));
  const transient = (el) => { let o = 1; for (let e = el; e; e = e.parentElement) { if (animating.has(e)) return true; o *= +getComputedStyle(e).opacity; } return o < 0.99; };
  const pairs = new Map();
  let checked = 0, skippedOverImage = 0, skippedTransient = 0;
  for (const el of $$('body *')) {
    if (checked > 2000) break;
    if (!Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    if (!visible(el)) continue;
    checked++;
    const cs = getComputedStyle(el);
    const fg = parse(cs.color); const bg = bgOf(el);
    if (!fg) continue;
    if (!bg || overMedia(el)) { skippedOverImage++; continue; }
    if (transient(el)) { skippedTransient++; continue; }
    const blended = { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a) };
    const [L1, L2] = [lum(blended), lum(bg)].sort((a, b) => b - a);
    const ratio = (L1 + 0.05) / (L2 + 0.05);
    const size = parseFloat(cs.fontSize); const bold = +cs.fontWeight >= 700;
    const large = size >= 24 || (bold && size >= 18.66);
    const target = large ? 3 : 4.5;
    if (ratio < target) {
      const key = `${hex(blended)} on ${hex(bg)} (${target}:1)`;
      const p = pairs.get(key) || { pair: key, ratio: +ratio.toFixed(2), count: 0, examples: [], suggestFg: suggest(blended, bg, target) };
      p.count++; if (p.examples.length < 3) p.examples.push(`${short(el)} "${text(el)}"`);
      pairs.set(key, p);
    }
  }
  const fails = [...pairs.values()].sort((a, b) => b.count - a.count);
  const contrast = { checked, skippedOverImage, skippedTransient, failingElements: fails.reduce((a, p) => a + p.count, 0), fails: fails.slice(0, 12) };

  // --- visible focus: focus each control and compare its styles (CSS-selector heuristics misfire on
  // `focus:outline-none` + `focus-visible:ring` pairs). Transitions are frozen so we read end state.
  const focusCheck = (() => {
    const kill = document.createElement('style');
    kill.textContent = '*,*::before,*::after{transition:none!important;animation-duration:0s!important}';
    document.head.appendChild(kill);
    const props = ['outlineStyle', 'outlineWidth', 'outlineColor', 'boxShadow', 'borderTopColor', 'borderBottomColor', 'backgroundColor', 'color', 'textDecorationLine', 'transform'];
    const snap = (e) => { if (!e) return ''; const out = []; for (const pe of [null, '::before', '::after']) { const s = getComputedStyle(e, pe); out.push(props.map((k) => s[k]).join('|')); } return out.join('#'); };
    const targets = $$('a[href],button,input:not([type="hidden"]),select,textarea,summary,[tabindex]:not([tabindex="-1"])').filter((e) => visible(e) && !e.disabled).slice(0, 60);
    const prev = document.activeElement; prev?.blur?.(); // an already-focused element would snapshot its focus style as 'before'
    const none = []; let tested = 0, notVisibleMode = 0;
    for (const el of targets) {
      const b = snap(el), bp = snap(el.parentElement);
      try { el.focus({ preventScroll: true, focusVisible: true }); } catch { el.focus({ preventScroll: true }); }
      if (document.activeElement !== el) continue;
      if (!el.matches(':focus-visible')) { notVisibleMode++; el.blur(); continue; }
      tested++;
      if (snap(el) === b && snap(el.parentElement) === bp) none.push(`${short(el)} "${text(el)}"`);
      el.blur();
    }
    kill.remove(); try { prev?.focus?.({ preventScroll: true }); } catch {}
    return { tested, noVisibleFocus: cap(none), note: notVisibleMode ? `${notVisibleMode} elements could not be put in :focus-visible state (pointer used?) — verify with Tab` : null };
  })();

  // --- responsiveness at current width
  const vw = document.documentElement.clientWidth;
  const overflowing = $$('body *').filter((el) => { const r = el.getBoundingClientRect(); return r.width && r.right > vw + 1 && getComputedStyle(el).position !== 'fixed'; });
  const smallTargets = interactive.filter((el) => { const r = el.getBoundingClientRect(); return (r.width < 24 || r.height < 24) && getComputedStyle(el).display !== 'inline'; }).map((el) => `${short(el)} ${Math.round(el.getBoundingClientRect().width)}×${Math.round(el.getBoundingClientRect().height)}`);
  const responsive = {
    viewportWidth: vw,
    horizontalScroll: document.documentElement.scrollWidth > vw,
    overflowingElements: cap(overflowing.filter((el) => !overflowing.includes(el.parentElement)).map(short)),
    smallTapTargets: cap(smallTargets),
  };

  // --- privacy
  const trackingCookieNames = /^(_ga|_gid|_gat|_gcl_|_fbp|_fbc|_hj|_clck|_clsk|ajs_|mp_|_uet|li_|_tt)/;
  const cookies = document.cookie.split(';').map((c) => c.split('=')[0].trim()).filter(Boolean);
  const privacy = {
    trackersLoaded: thirdParty.filter((s) => /googletagmanager|google-analytics|connect\.facebook|hotjar|clarity\.ms|segment|mixpanel|linkedin|tiktok|doubleclick/i.test(s)),
    trackingCookiesPresent: cookies.filter((c) => trackingCookieNames.test(c)),
    consentToolDetected: !!(window.Cookiebot || window.OneTrust || window.__tcfapi || window.klaro || window.CookieConsent || document.querySelector('[id*="cookie" i],[class*="cookie" i],[id*="consent" i],[class*="consent" i]')),
    consentModeDefault: Array.isArray(window.dataLayer) ? window.dataLayer.some((e) => e && e[0] === 'consent' && e[1] === 'default') : null,
    privacyLinkInFooter: $$('footer a').some((a) => /privacy|prywatno|cookie|rodo|gdpr/i.test(a.textContent + a.href)),
    note: 'Run on a fresh profile / before clicking the banner for trackingCookiesPresent to mean "set before consent".',
  };

  return {
    url: location.href,
    seo, headings, landmarks, images, perf,
    scripts: { total: scripts.length, thirdParty, blockingInHead },
    fonts, css, links: linkReport,
    a11y: { unnamedInteractive: cap(unnamed), unlabelledFields: cap(unlabelled), skipLink, widgets, contrast, focusCheck },
    responsive, privacy,
  };
})()
