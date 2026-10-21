# Playbook: curate and translate

Decision: `decisions/0001-ai-curation-with-veto.md` (and `0002-perspective-tier.md` if active;
owner reviews from `0004-brain-capture.md`).
Write list: `topics/**`, frontmatter of processed items in `raw/`, `transcripts/`,
`inbox/captures/`, `ops/runs/<date>-curate.md`, `ops/owner-queue.md`.

First read `ops/playbooks/_run-rules.md` and follow it (decision check, pull, dirty files, single
context, query hygiene, guard, one commit, never force-push, never stage dirty files).

## Steps

1. **Pick the batch.** Eligible items in `raw/`, `transcripts/` and `inbox/captures/`: no
   `status: curated`, no `veto:`, no `rag_dismissed: true`, file older than one hour. Oldest first,
   up to the curation cap. Captures of kind `review` are step 1b, `task` belongs to the task job and
   `link` to the inspire playbook: never curate those as content. If 0002 is not active, skip items
   whose claims have no source (log them as `skipped: no source`).

   **1b. Owner reviews, before the veto check.** Apply every `kind: review` capture without
   `processed_at`, oldest `captured_at` first, so a later review of the same target wins. Use the
   review's date for the values. Apply only these fields, never touch a body:

   | Target | `read` | `reject` |
   |---|---|---|
   | `raw/…` | `owner_read` | `owner_read`, `veto: "owner rejected (review)"`, `veto_at`, `veto_by: review` |
   | `topics/…` | `owner_read` | `owner_read` on the page, and the reject fields on **every** raw item whose `curated_in` is this page; the page is then withdrawn (step 3). If the page has `written_by: human`, set only `owner_read` and put "veto conflicts with a human-written page" on the owner queue |
   | `inbox/…` (captures) | `owner_read` | `owner_read`, `rag_dismissed: true`, `dismiss_reason: "owner rejected (review)"` |
   | `transcripts/…`, `ops/runs/…` | `owner_read` | not allowed: log and skip |

   Then set `processed_at` and `processed_to: "<target>"` on the review capture. A missing target:
   log it under errors and leave the review for the next night. Rejected raw items are now vetoed,
   so the steps below already treat them that way in this same run.

   **1c. Not knowledge.** A capture that is clearly not knowledge (a shopping list, a private
   errand, a test) gets `rag_dismissed: true` and `dismiss_reason`, and nothing else. Never delete it.

2. **Read each item in full.** For a long transcript, read all of it before writing; do not curate
   from the first screen.
3. **Find the home, or withdraw.** Search `topics/index.md` and existing pages for the subject.
   Prefer updating an existing page over creating a new one. Create a page only for a subject with
   no home. A page whose sources are now all vetoed is withdrawn: set `status: withdrawn` in its
   frontmatter, remove its link from `topics/index.md`, keep the file.
4. **Write in the vault language.** Translate material from other languages. Keep short verbatim
   quotes in their original language, followed by a translation in brackets.
5. **Tier every claim** (0002): sourced → fact with a link to the item; a `thought` or opinion →
   **[Perspective, unverified]**, attributed to the owner; a `talk_summary` (`written_by: ai`) →
   **[Perspective, unverified]**, attributed to the AI, never to the owner; known refuted → leave out
   and note it in the run log.
6. **Link.** New page: add it to `topics/index.md` and link it from at least one related page.
   Add `[[links]]` between related pages you touched.
7. **Mark the item**: set `status: curated` and `curated_in: "topics/<page>.md"` in its frontmatter.
   Change nothing else in it.
8. **Owner queue** only for: two sources that contradict on a key point, a scope question
   (does this belong in the brain at all?), a veto conflict, or material that may contain personal
   data. Max per night from AGENTS.md.
9. **Finish** as in `_run-rules.md`: run log (add `reviews: <n>` and `dismissed: <n>` to the
   counts and an **Owner reviews** list `<verdict>: <target>`), guard, one commit, push.

Nothing eligible, nothing to withdraw and no review to apply: print `skipped: nothing to do`, write
no log, make no commit.

## Query hygiene

Curation needs no web queries. If you look something up, no client names, people's names or
private context go into the query.
