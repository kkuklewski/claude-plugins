---
name: blog-draft
description: Turn a content brief from /seo-gaps into a review-ready blog post draft in the site's language and voice — outline-true, internally linked, with title/meta variants, an FAQ where it fits and a reviewer checklist that marks every claim the content team must verify. Produces a DRAFT for humans to correct, never a published post. Use when the user says "draft the blog post", "write the article from this brief", "turn the brief into a post", or invokes /blog-draft. Usage: /blog-draft <brief.md | topic> [--format md|mdx] [--out <path>]
---

# Blog draft from a brief

Input is normally a brief written by `/seo-gaps` (`<outputDir>/briefs/<slug>.md`). A bare topic works too:
then write a short brief first (same template: [../../templates/brief.md](../../templates/brief.md)), show it,
and only draft after the user agrees.

## Arguments
| Arg | Meaning |
|---|---|
| `brief.md \| topic` | The brief to draft from, or a topic (brief is written first). |
| `--format md\|mdx` | Output format. Default: match existing posts in the repo (look for `content/`, `posts/`, `blog/`, `*.mdx`), else `md`. |
| `--out <path>` | Where to write. Default `<outputDir>/drafts/<slug>.md` from `.seo-content.json`, else `docs/seo/drafts/`. |

## Workflow
1. **Load context.** The brief; `.seo-content.json` → `blog.language`, `audience`, `voice`, `wordCount`, `cta`,
   `avoidTopics`, `reviewers`. No config → ask for language and audience only, assume a plain, practical voice.
2. **Match the house style.** Read 2–3 existing posts (from the repo's content folder, or fetched from
   `siteOrigin` + `blog.path`): frontmatter fields, heading depth, intro length, how they link and cite.
   Copy the frontmatter shape exactly so the draft drops into the CMS/repo without edits.
3. **Check the link targets.** Every internal link in the brief must exist (sitemap or repo route). Drop or flag
   links that 404; never invent URLs.
4. **Write the draft** in `blog.language`:
   - Follow the brief's outline; the H1 carries the primary keyword naturally, one H1 only.
   - First 2–3 sentences answer the searcher's question directly — no throat-clearing intro.
   - Cover every H2 in the outline; add an FAQ section only if the brief has questions.
   - Secondary keywords only where they read naturally. No keyword stuffing, no filler, no "In today's
     fast-paced world".
   - **Term plan** (brief section, or run `term_plan` for the primary keyword when the brief has none and
     DataForSEO is on): treat it as a coverage checklist — cover the subtopics behind the terms, use heading terms
     in H2/H3 where they fit, answer the listed questions. Aim for the lower end of each range; a term that doesn't
     fit our product or angle is skipped, not forced in. Length follows the plan's median when it's inside
     `wordCount`, otherwise `wordCount` wins.
   - Anything factual that isn't common knowledge or in the brief → leave it in, marked
     `[VERIFY: what to check]`. Never invent statistics, quotes, studies, prices or customer names.
   - Stay inside `wordCount`; end with the `cta`.
5. **Frontmatter** (in the site's shape) plus: `status: draft`, `primary_keyword`, 2 `title` variants
   (≤ 60 chars), 2 `description` variants (≤ 155 chars), `slug`, `brief:` path.
6. **Reviewer checklist** appended below the article (the content team removes it before publishing):
   ```markdown
   ---
   ## Review checklist (delete before publishing)
   - [ ] Every [VERIFY] resolved or removed (count: N)
   - [ ] Angle and claims fit our product/positioning
   - [ ] Tone matches the brand voice
   - [ ] Title + description chosen
   - [ ] Internal links checked; add 1–2 links TO this post from related pages: <list from brief>
   - [ ] Images/alt text added
   - [ ] Term-plan score: N/100 — terms skipped on purpose: <list>
   - [ ] Legal/medical/financial statements approved (if any)
   Reviewers: <blog.reviewers>
   ```
7. **Score it** (DataForSEO on): `term_plan` with the primary keyword, `exclude: [<siteOrigin host>]` and
   `draftFile: <absolute path of the draft>`. Score < 70 → one revision pass on the `missing` terms that read
   naturally (and trim anything in `overused`), then score again. Never chase 100: a lower score with honest,
   readable copy beats a stuffed one. Put the final score and the terms left out on purpose in the checklist.
8. Set the brief's `status: draft`. Report: file path, word count, term-plan score, number of `[VERIFY]`
   markers, open questions.

## Rules
- This is a draft for human editors. Never publish, push to a CMS, or commit without the user asking.
- Facts beat fluency: an honest `[VERIFY]` is better than a confident invented number.
- Don't reuse text from competitor pages seen in the brief's "What ranks now" — use them for gaps, not wording.
- Respect `avoidTopics`; if the brief conflicts with them, stop and ask.
