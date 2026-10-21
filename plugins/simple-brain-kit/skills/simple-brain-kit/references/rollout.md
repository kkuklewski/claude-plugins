# Staged rollout

One stage at a time. Each stage has an entry criterion, a metric that shows it worked, who approves
it, and a rollback. The owner flips each decision's `status:` personally; the skill never does it
unless the owner says so in the conversation.

| # | Stage | Entry criterion | Proves it worked | Approves | Rollback |
|---|---|---|---|---|---|
| 0 | Skeleton | Owner named; infrastructure is the owner's | Vault repo exists with lanes, AGENTS.md, decisions all `proposed` | Owner | Delete the repo |
| 1 | Dry run | Stage 0 done; AGENTS.md configuration filled | One manual curate run in read-only mode: the plan for 5 items reads right | Owner | Nothing written |
| 2 | Curation with veto | Dry run approved | 0001 `active`; nightly curate; backlog shrinks; vetoes per week < 10% of items | Owner (company: content owner) | 0001 `paused`, `git revert` |
| 3 | Perspectives and verification | 7 nights of stage 2 with ≥ 5 productive | 0002 and 0003 `active`; verified share rising; owner queue ≤ 10 | Owner | 0003 `paused` |
| 4 | Read access from Claude | Stage 2 stable | brain-mcp read endpoint live; connector added; owner answers a real question from the brain | Owner (company: IT/security) | Remove connector, stop container |
| 5 | Capture | Stage 4 live; 0002 active | 0004 `active`; captures arrive and are curated as perspectives within a night; reviews hide notes at once and are applied overnight; with a tracker adapter, task captures become tasks once (no duplicates on rerun) | Owner | 0004 `paused` (within one sync); stop the task timer |
| 6 | Discovery and morning summary | Stages 2–3 stable | 0005 `active`; captured links processed first; summary read most mornings | Owner | 0005 `paused`; stop the summary |

## In a company

- Name an owner per area of the brain. The owner holds the veto and the switch.
- Keep a human gate only where a mistake is expensive (legal, HR, pricing, customer commitments);
  everything else runs with a veto.
- Exclude folders with personal or client data from tools (`BRAIN_EXCLUDE`) and from discovery,
  unless a decision allows them, and tell people the brain is curated by AI (transparency).
- Run `/simple-brain-assess --enterprise` before stage 2 and after stage 6.
