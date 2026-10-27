// Responsive sweep: Chromium + WebKit, phone → desktop, any set of routes.
// Reports per route/viewport: horizontal overflow, elements poking past the viewport,
// text clipped inside its box, content still hidden after a full scroll (Reveal/GSAP
// leftovers), tap targets < 24px and broken images. Full-page JPEGs (Chromium) + results.json.
//
// Usage (cwd = the project, so its own playwright is used):
//   node "$SKILL_DIR/scripts/sweep.mjs" <baseUrl> <outDir> [/route ...]
//   e.g. node "$SKILL_DIR/scripts/sweep.mjs" http://localhost:3000 /tmp/sweep / /pricing /blog/some-post
// Extra viewport widths: SWEEP_WIDTHS=264,320 (added to the defaults).
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'

let pw
try {
  pw = createRequire(path.join(process.cwd(), 'noop.js'))('playwright')
} catch {
  console.error('playwright not found in this project: npm i -D playwright && npx playwright install chromium webkit')
  process.exit(1)
}
const { chromium, webkit } = pw

const [BASE, out, ...rest] = process.argv.slice(2)
if (!BASE || !out) {
  console.error('usage: node sweep.mjs <baseUrl> <outDir> [/route ...]')
  process.exit(1)
}
const routes = rest.length ? rest : ['/']
fs.mkdirSync(out, { recursive: true })
const vps = [
  ['galaxy-fold', 280, 653],
  ['iphone-se', 375, 667],
  ['iphone-17-pro', 393, 852],
  ['ipad-mini', 768, 1024],
  ['ipad-pro', 1024, 1366],
  ['macbook', 1440, 900],
  ...(process.env.SWEEP_WIDTHS || '').split(',').filter(Boolean).map((w) => [`w${w}`, Number(w), 800]),
]

const results = []
for (const [engName, eng] of [['chromium', chromium], ['webkit', webkit]]) {
  const browser = await eng.launch()
  for (const [vname, w, h] of vps) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: engName === 'chromium' && w < 768, hasTouch: w < 1024 })
    const page = await ctx.newPage()
    for (const route of routes) {
      // DOM first, then best-effort load/idle waits: a stalled asset or a dev-server socket must not hang the sweep.
      await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 90000 })
      await page.waitForLoadState('load', { timeout: 15000 }).catch(() => console.warn(`  ${route}: load event not fired after 15 s (stalled asset?)`))
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
      // Hidden-on-load check before scrolling: above-the-fold content must not wait for a scroll.
      await page.waitForTimeout(600)
      const hiddenOnLoad = await page.evaluate(() => {
        let n = 0
        for (const el of document.querySelectorAll('main *')) {
          const r = el.getBoundingClientRect()
          if (r.top >= innerHeight || r.bottom <= 0 || r.height === 0) continue
          if (parseFloat(getComputedStyle(el).opacity) < 0.05 && el.textContent.trim().length > 3 && !el.closest('[aria-hidden="true"]')) n++
        }
        return n
      })
      // Scroll the whole page in viewport steps so ScrollTrigger/Reveal fire.
      let y = 0
      for (;;) {
        const H = await page.evaluate(() => document.documentElement.scrollHeight)
        if (y > H) break
        await page.evaluate((yy) => window.scrollTo(0, yy), y)
        await page.waitForTimeout(120)
        y += Math.round(h * 0.6)
      }
      await page.waitForTimeout(900)
      const m = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth
        const doc = document.documentElement
        const overflow = doc.scrollWidth - doc.clientWidth
        // Elements whose box pokes past the viewport and aren't inside a clipping ancestor.
        const wide = []
        for (const el of document.querySelectorAll('body *')) {
          const r = el.getBoundingClientRect()
          if (r.width === 0 || r.right <= vw + 1) continue
          let a = el.parentElement, clipped = false
          while (a && a !== document.body) {
            if (/(hidden|clip|auto|scroll)/.test(getComputedStyle(a).overflowX)) { clipped = true; break }
            a = a.parentElement
          }
          if (!clipped && el.closest('[aria-hidden="true"], svg') === null) wide.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} → ${Math.round(r.right - vw)}px`)
        }
        // Text clipped horizontally inside its own box.
        const clippedText = []
        for (const el of document.querySelectorAll('h1,h2,h3,h4,p,a,button,span,li,dt,dd')) {
          if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0 && /(hidden|clip)/.test(getComputedStyle(el).overflowX)) {
            clippedText.push(`${el.tagName.toLowerCase()} "${el.textContent.trim().slice(0, 40)}"`)
          }
        }
        // Content still hidden after a full scroll.
        const hidden = []
        for (const el of document.querySelectorAll('main *')) {
          if (parseFloat(getComputedStyle(el).opacity) < 0.05 && el.textContent.trim().length > 3 && el.getBoundingClientRect().height > 0 && !el.closest('[aria-hidden="true"]')) {
            hidden.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 50)} "${el.textContent.trim().slice(0, 40)}"`)
          }
        }
        // Small tap targets.
        const small = []
        for (const el of document.querySelectorAll('a[href], button')) {
          const r = el.getBoundingClientRect()
          if (r.width === 0 || getComputedStyle(el).visibility === 'hidden') continue
          if (r.height < 24 || r.width < 24) small.push(`${el.tagName.toLowerCase()} "${(el.textContent.trim() || el.getAttribute('aria-label') || '').slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`)
        }
        const brokenImg = [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.loading !== 'lazy').map((i) => i.src.slice(-50))
        return { overflow, wide: wide.slice(0, 8), clippedText: clippedText.slice(0, 8), hidden: hidden.slice(0, 8), hiddenCount: hidden.length, small: [...new Set(small)].slice(0, 10), smallCount: small.length, brokenImg, height: doc.scrollHeight }
      })
      const slug = route === '/' ? 'home' : route.slice(1).replaceAll('/', '_')
      if (engName === 'chromium') await page.screenshot({ path: path.join(out, `${slug}-${vname}.jpg`), fullPage: true, type: 'jpeg', quality: 60 })
      results.push({ engine: engName, vp: `${vname} ${w}x${h}`, route, hiddenOnLoad, ...m })
      console.log(engName, vname, route, 'overflow', m.overflow, 'hiddenOnLoad', hiddenOnLoad, 'hidden', m.hiddenCount, 'wide', m.wide.length, 'clipped', m.clippedText.length, 'small', m.smallCount, 'brokenImg', m.brokenImg.length)
    }
    await ctx.close()
  }
  await browser.close()
}
fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2))
