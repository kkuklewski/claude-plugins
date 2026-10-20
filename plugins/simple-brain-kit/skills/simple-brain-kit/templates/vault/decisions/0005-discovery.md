---
title: "Nightly discovery and inspiration"
type: decision
status: proposed          # proposed | active | paused — the on/off switch. Only the owner changes it.
decided_by: "<owner role>"
decided_on:
playbook: ops/playbooks/inspire.md
depends_on: decisions/0001-ai-curation-with-veto.md
---

# 0005 — Nightly discovery and inspiration

## Context

Discovery is the only nightly job that sends queries out of the building (web search, fetch and
scraping tools). It needs its own switch and its own query rules.

## Decision

While `status: active`, a nightly run:
1. processes captured links first (fetches each `kind: link` capture and saves a source note);
2. then searches for a small number of new items related to active topics;
3. may write one short "connections" note linking topics that belong together.

**The AI may write:** new files in `raw/` (never edits existing ones), `status: curated` on the
link captures it processed, the run log. At most the discovery cap in AGENTS.md per night.

**Query hygiene:** no client names, people's names, internal project names or any private context
in web, scraping or search queries. Generalise the subject ("pricing models for B2B SaaS", not
"<client> pricing"). Never paste vault text into a query.

## Rollback

`status: paused`. Discovered notes are ordinary raw items and can be vetoed or reverted.
