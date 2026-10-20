# simple-brain-assess

Read-only assessment of an AI second brain, personal or company-wide, against a working "simple
brain" model. Raw captures flow in, AI curates them every night within written bounds, claims carry
evidence, unverified material is kept as labelled perspectives, and the owner keeps a veto instead
of approving every item.

It proves whether the automations did their work over the last 7 nights: did each job run, did it finish, what it produced, and did anyone see it. It finds where people are the bottleneck: approval gates with growing queues, digests nobody reads,
review piles. It measures health in four areas: flow, structure, trust and ownership. With
`--enterprise` it also checks governance for a company of roughly 50 to 500 people: named owners,
risk-tiered review, permission-aware retrieval, personal data and client data, and transparency.
It ends with one smallest next step, or with `--plan`, a staged rollout.

```text
/simple-brain-assess [<path-to-knowledge-base>] [--enterprise] [--plan]
```

The skill never changes the knowledge base, its automations or settings. The report is saved as
`simple-brain-assessment-<date>.md` in the current directory.

## What's inside

- `references/maturity-model.md`: levels 0 to 5, from the gate to the veto, verification and
  proactive alerts, plus a rollout recipe.
- `references/health-model.md`: metrics and targets for flow, structure, trust and ownership, plus
  the conflict taxonomy.
- `references/enterprise-checklist.md`: ownership, review tiers, where to keep a human gate,
  permission-aware retrieval, GDPR and AI Act orientation, audit. This is not legal advice.
- `references/lessons-learned.md`: 15 failure modes observed while switching a real vault to AI
  curation.
- `scripts/measure.py`: read-only health numbers for a Markdown knowledge base. It guesses the raw
  and wiki folders, and you can override them with `--raw` and `--wiki`.

## Requirements

Python 3.9+ and git, for last-change dates. Nothing to install.

## Tests

`tests/run.sh` runs `measure.py` against a small fixture vault and checks the numbers.
