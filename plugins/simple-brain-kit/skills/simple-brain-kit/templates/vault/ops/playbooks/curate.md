# Playbook: curate and translate

Decision: `decisions/0001-ai-curation-with-veto.md` (and `0002-perspective-tier.md` if active).
Write list: `topics/**`, frontmatter of processed items in `raw/`, `transcripts/`,
`inbox/captures/`, `ops/runs/<date>-curate.md`, `ops/owner-queue.md`.

First read `ops/playbooks/_run-rules.md` and follow it (decision check, pull, dirty files, single
context, query hygiene, guard, one commit, never force-push, never stage dirty files).

## Steps

1. **Pick the batch.** Eligible items in `raw/`, `transcripts/` and `inbox/captures/`: no
   `status: curated`, no `veto:`, file older than one hour. Oldest first, up to the curation cap.
   If 0002 is not active, skip items whose claims have no source (log them as `skipped: no source`).
2. **Read each item in full.** For a long transcript, read all of it before writing; do not curate
   from the first screen.
3. **Find the home.** Search `topics/index.md` and existing pages for the subject. Prefer updating
   an existing page over creating a new one. Create a page only for a subject with no home.
4. **Write in the vault language.** Translate material from other languages. Keep short verbatim
   quotes in their original language, followed by a translation in brackets.
5. **Tier every claim** (0002): sourced → fact with a link to the item; unsourced capture, opinion
   or hunch → **[Perspective, unverified]**, attributed; known refuted → leave out and note it in
   the run log.
6. **Link.** New page: add it to `topics/index.md` and link it from at least one related page.
   Add `[[links]]` between related pages you touched.
7. **Mark the item**: set `status: curated` and `curated_in: "topics/<page>.md"` in its frontmatter.
   Change nothing else in it.
8. **Owner queue** only for: two sources that contradict on a key point, a scope question
   (does this belong in the brain at all?), or material that may contain personal data. Max per
   night from AGENTS.md.
9. **Finish** as in `_run-rules.md`: run log, guard, one commit, push.

## Query hygiene

Curation needs no web queries. If you look something up, no client names, people's names or
private context go into the query.
