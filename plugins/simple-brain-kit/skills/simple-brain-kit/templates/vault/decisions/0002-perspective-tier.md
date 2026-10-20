---
title: "Perspective tier for unverified material"
type: decision
status: proposed          # proposed | active | paused — the on/off switch. Only the owner changes it.
decided_by: "<owner role>"
decided_on:
depends_on: decisions/0001-ai-curation-with-veto.md
---

# 0002 — Perspective tier for unverified material

## Context

Much of what lands in a brain cannot be verified: a thought said in a meeting, an opinion in a
podcast, a hunch captured by voice. Dropping it loses useful context; curating it as fact poisons
the brain. Refuted claims are a different case: they are wrong, not unknown.

## Decision

While `status: active`, curation sorts every claim into one of three tiers:

| Tier | When | How it appears in `topics/` |
|---|---|---|
| Fact | Backed by a cited source, or verified with a verbatim quote | Plain text with a source link |
| Perspective | Cannot be checked (a capture, an opinion, a single unsourced statement) | Kept and findable, marked inline **[Perspective, unverified]**, attributed ("the owner noted…", "a speaker in <transcript> said…"), never stated as fact |
| Refuted | Contradicted by evidence with a verbatim quote | Stays out of topic text. The evidence is appended to the source item's verification note; the raw item itself is kept unchanged |

Rules:
- A perspective never becomes a fact by repetition. Only evidence promotes it.
- A perspective is never a source for another claim.
- Verification (decision 0003) may promote a perspective to fact, or mark it refuted and move it
  out of the topic text, appending the evidence. It never silently deletes it.

## Rollback

`status: paused`: curation goes back to curating only sourced material and leaves unsourced items
uncurated.
