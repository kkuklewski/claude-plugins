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
link or a talk summary into the brain by voice, without giving that app any way to read, change or
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
- Kinds: `thought` (the owner's own words), `link` (a URL plus a note), `talk_summary`
  (a summary the AI wrote of a conversation, marked `written_by: ai`).
- The endpoint lives at its own secret path and needs an API key in the `x-api-key` header. It is
  separate from the read-only endpoint.

Curation treats every capture as a **perspective** (decision 0002) until evidence promotes it.
Discovery (ops/playbooks/inspire.md) processes captured links first.

## Rollback

`status: paused`. Once the change reaches the server's clone (the sync job runs every few
minutes), the next capture request is refused; no restart or redeploy needed. To revoke access
entirely, rotate the key (see the setup guide) and remove the connector.
