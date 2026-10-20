---
title: "AI verification with verbatim quotes"
type: decision
status: proposed          # proposed | active | paused — the on/off switch. Only the owner changes it.
decided_by: "<owner role>"
decided_on:
playbook: ops/playbooks/verify-and-resolve.md
depends_on: decisions/0001-ai-curation-with-veto.md
---

# 0003 — AI verification with verbatim quotes

## Context

Curated pages are only as good as their claims. A person cannot check every claim, and an AI
"verdict" without evidence is just another claim. Some fetch tools return a model-written summary
of a page instead of its text, which looks like evidence and is not.

## Decision

While `status: active`, a nightly run checks key claims on topic pages against their sources.

- **Evidence is a verbatim quote**, string-matched against the raw text of the fetched source (not
  a summary). If the quote cannot be matched, the verdict is `unverifiable`, never `supported`.
- Verdicts per claim: `supported` (quote), `refuted` (quote), `unverifiable` (why).
- **Refutations append evidence and never delete.** The run adds a verification table and, for a
  refuted claim, a `> [!warning]` callout with the quote and its source under the claim. It does
  not strike, delete or rewrite what a source said. If the claim was presented as fact on the page,
  the run moves it out of the fact text into the warning, keeping the original wording quoted.
- The run may resolve its own open questions (`> [!question]`) when it finds evidence, by
  appending the answer with the quote. It never removes the question text.
- Only these go to `ops/owner-queue.md`: refuted key claims, ties between credible sources, scope
  questions, and one random sample per week. At most the configured number per night.

**The AI may write:** verification sections and callouts in `topics/`, frontmatter
`verification:` on topic pages, the run log, and the owner queue. Nothing else.

## Rollback

`status: paused`, then `git revert` unwanted verification commits.
