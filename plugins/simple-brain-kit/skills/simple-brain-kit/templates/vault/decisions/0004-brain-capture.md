---
title: "Brain Capture: append-only voice capture"
type: decision
status: proposed          # proposed | active | paused — the capture endpoint reads this on every request.
decided_by: "<owner role>"
decided_on:
depends_on: decisions/0002-perspective-tier.md
---

# 0004 — Brain Capture: append-only voice capture

## Context

The best thoughts come away from the desk. A capture connector lets an AI app save a thought, a
link, a talk summary, a verdict on a note or a to-do into the brain by voice, without giving that app any way to read, change or
delete what is already there.

## Decision

While `status: active`, the capture endpoint of brain-mcp accepts new captures into
`inbox/captures/`. It reads this file **on every request**: any other status refuses the write.

Bounds, enforced in code, not by the prompt:
- New files only. A file is created with exclusive create (O_EXCL); nothing is ever overwritten,
  edited or deleted through the endpoint.
- At most 4 KB per capture and 20 captures per day.
- Control characters and bidirectional-text characters are stripped; frontmatter values are
  JSON-quoted, so a capture cannot inject frontmatter fields or break the file.
- The endpoint lives at its own secret path and needs an API key in the `x-api-key` header. It is
  separate from the read-only endpoint.

### Kinds and provenance

| Kind | What | `written_by` | Nightly handling |
|---|---|---|---|
| `thought` | The owner's own words, verbatim, lightly cleaned. **Only** the owner's words. | `human` | curate (as a perspective) |
| `link` | An http(s) URL plus one line on why | `human` | inspire, captured links first |
| `talk_summary` | Anything the AI wrote, found, checked, researched or worked out, including a summary of a conversation. Starts with an "AI-written" banner. | `ai` | curate (as a perspective, never as the owner's view) |
| `review` | The owner marks an existing note read or rejects it: `target` (a vault path, checked to exist) and `verdict` (`read` or `reject`), optional reason | `human` | curate step 1b, before the veto check |
| `task` | A to-do the owner asked for: first line = title (max 150 characters), optional details, 1000 characters in all | `human` | `capture_tasks.py` creates one tracker task and writes `tracker_task` back |

**Provenance rule:** if the agent found, checked or worked it out, it is a `talk_summary`, even when
the owner says "save that". A `thought` carries the highest trust label in search; the agent's own
research must never borrow it. Verdicts ("mark it read", "skip that one") are `review`, never a
`thought`, and to-dos are `task`, never a `thought`.

### Reviews

- Reviewable: `topics/`, `raw/`, `transcripts/`, `inbox/`, `ops/runs/`. Rejectable only where a veto
  means something: `topics/`, `raw/`, `inbox/`.
- The read connector flags the target at once (`read`, plus `vetoed` for a reject) and hides it from
  "what's new" unless asked with `include_read`. The latest review of a note wins.
- The nightly curation applies reviews (ops/playbooks/curate.md, step 1b): `owner_read` on the
  target; for a reject, the veto fields on raw items, or `rag_dismissed` on captures. The review
  capture stays as the record.
- Any per-item cards or reminders (a chat bot asking "keep or veto?") skip notes with `owner_read`.

### Tasks

- A host job (`brain-jobs/capture_tasks.py`) turns each task capture into a task in the owner's
  tracker (Vikunja, Jira, Linear, GitHub Issues: an adapter picked at setup) and writes
  `tracker_task` and `processed_at` back, so a rerun never duplicates.
- Veto model: tasks are created without asking; the owner deletes unwanted ones. The job never
  edits or deletes a tracker task.
- The morning summary reports how many tasks were created and how many wait, never their titles.

### Not knowledge: the dismiss flag

Some captures are valid but are not knowledge: a shopping list, a private errand. They get
`rag_dismissed: true` and a `dismiss_reason` (set by the agent at capture time when the owner says
so, or by curation later). They are kept, never deleted, but never curated, indexed as knowledge or
turned into tasks.

Curation treats every `thought` and `talk_summary` as a **perspective** (decision 0002) until
evidence promotes it.

## Rollback

`status: paused`. Once the change reaches the server's clone (the sync job runs every few
minutes), the next capture request is refused; no restart or redeploy needed. To revoke access
entirely, rotate the key (see the setup guide) and remove the connector.
