# Maturity model: who moves knowledge forward?

Score each lane (capture, curation, verification, retrieval, notification) from 0 to 5. The overall
level is the lowest lane that blocks the flow.

| Level | Name | What it looks like | Typical evidence |
|---|---|---|---|
| 0 | Pile | Files are dumped; nothing is curated. | No index, no wiki folder, raw only. |
| 1 | Manual gate | A human must approve or rewrite every item before it counts. | Approval fields, review queue growing, few approvals per month. |
| 2 | AI-assisted gate | AI drafts, summarises or scores, but a human still approves each item. | AI fields present, queue still waits on people. |
| 3 | AI curates, human vetoes | AI promotes eligible items on a schedule within written bounds; the human reviews after the fact and can veto. | A decision record with write bounds, run logs, veto fields, one commit per run. |
| 4 | Evidence-verified | AI checks claims against fetched sources with verbatim quotes, resolves its own open questions, and routes only real conflicts to the human. Unverified material is kept as a labelled *perspective*, not a fact. | Verification tables, quote matching, a short owner queue, perspective labels. |
| 5 | Proactive | The brain watches the world around the owner's work (drafts, projects), pushes only rare high-signal alerts, and is pulled into the conversation automatically (scoped retrieval hook). | Radar pages, alert caps, a morning summary that is read, retrieval injected only in the right contexts. |

## The core shift: gate → veto

A gate means nothing moves until a person clicks. A veto means things move by default inside
written bounds, and a person can stop or undo them. Measured on a personal vault: 0 promotions in
four months under the gate; the whole 37-note backlog cleared in one evening after switching to a
veto. Expect the bottleneck to move to review; that is why level 4 exists.

In a company, keep a gate only where a mistake is expensive (see the enterprise checklist,
"Risk-tiered autonomy"). Everything else should be veto.

## Rollout (for `--plan`)

Advance one level at a time. Each stage needs an entry criterion, a metric, an owner and a rollback.

1. **Write the rules down.** A decision record: what the AI may write, where, how often, how it is
   logged, how to pause it (one status field). Nothing runs before this is approved.
2. **Dry-run.** Run the curation read-only on a sample; review the plan, not the result.
3. **Catch up once, supervised.** Process the backlog in small batches (one commit each), measure
   health between batches, stop if orphans or duplicates rise.
4. **Schedule it.** Nightly, capped, one commit per run, a run log a human can read in two minutes.
5. **Add verification** with verbatim evidence and a narrow owner queue; keep low-evidence material
   as perspectives.
6. **Replace digests with signals.** One short morning summary and rare alerts with hard caps.
