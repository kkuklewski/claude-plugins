---
title: "AI curation by default, owner keeps a veto"
type: decision
status: proposed          # proposed | active | paused — the on/off switch. Only the owner changes it.
decided_by: "<owner role>"
decided_on:
playbook: ops/playbooks/curate.md
---

# 0001 — AI curation by default, owner keeps a veto

## Context

A manual approval gate stops the pipeline: when every raw item waits for a person to approve it,
the queue grows and little gets curated. A veto keeps the owner in control without making them the
bottleneck.

## Decision

While `status: active`, a nightly run curates eligible raw items, transcripts and captures into
`topics/` without asking first. The owner reviews afterwards and can veto.

**The AI may:**
- create and edit pages in `topics/` and add links to `topics/index.md`;
- set `status: curated` and `curated_in:` in the frontmatter of the raw items it processed;
- apply the owner's reviews (decision 0004): `owner_read`, the veto fields (`veto`, `veto_at`,
  `veto_by`) on rejected raw items, `rag_dismissed` + `dismiss_reason` on rejected captures, and
  `processed_at`/`processed_to` on the review capture; withdraw a topic page whose sources are all
  vetoed (`status: withdrawn`, link removed from the index, file kept);
- mark a capture that is not knowledge with `rag_dismissed: true` and a `dismiss_reason`;
- write one run log in `ops/runs/` and append up to the configured number of items to
  `ops/owner-queue.md`;
- translate material into the vault language, keeping verbatim quotes in their original language.

**The AI may not:**
- delete or rewrite raw items, transcripts or captures;
- touch any page or item that has `veto:` in its frontmatter;
- change anything in `decisions/`, or any path outside the list above;
- exceed the curation cap in AGENTS.md (default 10 raw items per night);
- make more than one commit per run, force-push, or stage files it did not write.

**Eligible:** a raw item, transcript or capture without `status: curated`, without `veto:`, without
`rag_dismissed: true`, not a `review`, `task` or `link` capture, and older than one hour (so a file
being written is never picked up half-done).

## The veto

- Put `veto: "<reason>"` in a page's or raw item's frontmatter: the run never touches it again.
- Or say it by voice: a `review` capture with verdict `reject` (decision 0004). The read connector
  hides the note at once; the next run sets the veto fields.
- Or revert the run's commit: one run is one commit, so `git revert <sha>` undoes exactly one night.
- To stop everything: set `status: paused` here. The next run logs `skipped` and does nothing.

## Review

The owner reads the run log (two minutes) at least weekly and the owner queue when it has items.
Measure: raw items waiting, oldest eligible item, orphan pages, vetoes per week.

## Rollback

`status: paused`, then `git revert` the run commits that are not wanted.
