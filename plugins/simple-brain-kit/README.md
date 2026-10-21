# simple-brain-kit

Set up a working AI second brain, a "simple brain", for a person or a company, with their
consent and on their own infrastructure. Raw material flows in, AI curates it every night within
written bounds, claims carry evidence, unverified material is kept as labelled perspectives, and
the owner keeps a veto instead of approving every item.

It is the build step that [simple-brain-assess](../simple-brain-assess) recommends. Assess an
existing knowledge base first; build with this kit.

```text
/simple-brain-kit [<target-vault-path>] [--stage <0-6>] [--server <dir>]
```

## How the pieces fit

The core is the same for everyone: a **Markdown vault in git** and **one MCP gateway** (brain-mcp)
with two connectors, a **read connector** and an **append-only capture connector**. Everything else
is an **adapter** the owner picks at setup, and the skill asks which ones they already use:

| Adapter | Options |
|---|---|
| Task tracker | Vikunja (worked example), Jira, Linear, GitHub Issues (stubs), none |
| Vector store | none (keyword), local embeddings, Supabase/pgvector or any database over HTTP or MCP |
| Notifications | Telegram, Slack, email, none |
| Web discovery | plain fetch, Apify, a search connector |

Replacing an adapter never changes the vault format or the decisions. Contracts and a pgvector
example: [`references/architecture.md`](skills/simple-brain-kit/references/architecture.md).

```text
        Claude apps (chat, voice, Code)
          |                          |
          | read connector           | capture connector
          | x-api-key, read-only     | x-api-key, secret path, new files only
          v                          v
   +------------------- brain-mcp gateway --------------------+
   | search  read  recent  topics  overview  last_run | capture |
   +--------+-----------------------------------------+---+-----+
            | reads                                       | writes inbox/captures/ only
            v                                             v
   +============= CORE: Markdown vault in git ================+
   | raw/  transcripts/  inbox/captures/  topics/             |
   | decisions/ (status = on/off switch)  ops/ (runs, queue,  |
   | playbooks)                                               |
   +====^=============================================^=======+
        | one commit per run                           | sync.sh, host jobs
   nightly runs: curate, verify, inspire,       capture_tasks, morning_summary
   (cloud routines or cron)                     (systemd timers or cron)
        |                                              |
  - - - | - - - - - adapters, picked at setup - - - - -| - - - - - - - -
   web discovery: plain fetch | Apify | search    task tracker: Vikunja | Jira |
   vector store: none | local embeddings |           Linear | GitHub Issues
     Supabase/pgvector | any DB over HTTP/MCP    notifications: Telegram | Slack | email
```

## Install

```text
/plugin marketplace add kkuklewski/claude-plugins
/plugin install simple-brain-kit@kkuklewski
```

Restart Claude Code afterwards.

## What it ships

**Vault skeleton** (`templates/vault/`)

| Lane | Path |
|---|---|
| Raw inbox | `raw/` |
| Transcripts | `transcripts/` |
| Voice/app captures | `inbox/captures/` |
| Curated topics | `topics/` (with `index.md`) |
| Decision records | `decisions/` |
| Run logs, owner queue, playbooks | `ops/runs/`, `ops/owner-queue.md`, `ops/playbooks/` |

`AGENTS.md` describes the lanes, who may write where, page conventions and the owner's settings;
`CLAUDE.md` imports it for Claude Code.

**Decision records**, each starting as `status: proposed`. The status is the on/off switch.

| # | Decision |
|---|---|
| 0001 | AI curation by default; the owner keeps a veto (`veto:` field, `git revert`, `status: paused`) |
| 0002 | Perspective tier: unverifiable material is kept as **[Perspective, unverified]** and never curated as fact; refuted claims stay out |
| 0003 | AI verification with verbatim, string-matched quotes; refutations append evidence and never delete |
| 0004 | Brain Capture: append-only voice capture with kinds `thought` (owner's words only), `link`, `talk_summary` (AI-written), `review` (read/reject a note) and `task` (to a tracker), plus a dismiss flag for captures that aren't knowledge; the endpoint reads this switch on every request |
| 0005 | Discovery: the only job that sends queries out, with its own switch |

**Nightly playbooks** (`ops/playbooks/`): shared run rules (decision check, single context,
reading rules, one commit per run, never force-push, never stage dirty files, a guard that aborts),
`curate.md` (curate and translate; applies owner reviews before the veto check), `verify-and-resolve.md`, `inspire.md` (captured links first,
then discovery) and `morning-summary.md` (counts only). Each carries the query-hygiene rule: no
client names or private context in web, Apify or search queries.

**brain-mcp server** (`templates/brain-mcp/`, Python, official MCP SDK)

- Read connector: `search`, `read`, `recent`, `topics`, `overview`, `last_run`. Results carry
  flags (`ai_written`, `read`, `vetoed`, `dismissed`, …); a read/reject review hides a note from
  `recent` at once unless `include_read` is set.
- Optional capture connector at its own secret path, key in the `x-api-key` header. New files only
  (`O_EXCL`), at most 4 KB each and 20 per day, control and bidi characters stripped, frontmatter
  JSON-quoted, refuses unless `decisions/0004-brain-capture.md` says `status: active`. The tool
  description carries the provenance rule; `talk_summary` captures are `written_by: "ai"`.
- Optional hybrid search: BM25 plus vectors from local embeddings or an external store adapter,
  fused with Reciprocal Rank Fusion (k = 60).
- Docker Compose with a read-only vault mount and a read-write captures mount, a secrets script
  that does not rotate unless asked, a host sync script, and tests.
- Notes on claude.ai custom connectors: only approved header names work; `x-api-key` and
  `authorization` are presets, and `authorization` is greyed out when OAuth is selected.

**Host jobs** (`templates/brain-jobs/`, Python, standard library)

- `capture_tasks.py`: each `task` capture becomes one tracker task; the id is written back as
  `tracker_task`, so a rerun never duplicates, and a crash between create and write-back is
  recovered from a marker in the task description. Commits only the captures it touched.
- `brain_health.py`: nightly, read-only, no model. One JSON line per day (flow, structure, trust),
  a priorities-page reminder past 30 days (it never writes the page), and index drift: per-file
  chunk hashes on disk vs the vector store through an index adapter that uses the indexer's own
  corpus code; files changed after the last index run are pending, not drift. Item lists stay in a
  report on the host. On its first live night it found three notes reported as indexed that had no
  rows in the store.
- `morning_summary.py`: one counts-only message (runs, captures, tasks new/waiting, reviews
  waiting, owner queue, the health line with the weekly change) through the notification adapter.
  Never titles.
- `trackers.py` (Vikunja + Jira/Linear/GitHub Issues stubs), `index_adapters.py` (none, PostgREST/
  Supabase-pgvector, your own), `notify.py` (stdout, Telegram, Slack, email), systemd and cron
  examples, tests.

**References**: `references/architecture.md` (core, adapters, contracts), `references/setup.md`
(cloud routines or cron, host jobs, the morning summary, model-call privacy, health checks from
simple-brain-assess, gotchas) and `references/rollout.md`.

## Staged rollout

Everything starts switched off. Advance one stage at a time; the owner flips each switch.

0. **Skeleton**: vault, `AGENTS.md` filled in, all decisions `proposed`.
1. **Dry run**: curation plans 5 items and writes nothing; the owner checks the plan.
2. **Curation with a veto**: 0001 `active`, nightly. Watch the backlog shrink and the vetoes stay rare.
3. **Perspectives and verification**: 0002 and 0003 `active` after 7 nights, at least 5 of them productive.
4. **Read access**: brain-mcp read endpoint and a Claude connector.
5. **Capture**: 0004 `active`, capture connector added; with a tracker adapter, the task job on a timer.
6. **Discovery and the morning summary**: 0005 `active`, counts-only message each morning.

Each stage has an entry criterion, a metric, an approver and a rollback in
[`references/rollout.md`](skills/simple-brain-kit/references/rollout.md). After 7 nights, run
`/simple-brain-assess` to see whether the jobs did real work and did not just finish.

## Gotchas

- Re-running secret setup rotates the secrets and breaks connectors that are already added; they
  must be removed and re-added. The bundled script keeps existing secrets unless you pass `--rotate`.
- The container user must be able to write only the captures folder: mount the vault read-only and
  only `inbox/captures/` read-write.
- One long session costs more than the clone. Run each night in a single context: in an A/B test,
  single context was about 2.2x cheaper than one sub-agent per page, at equal quality.

- Provenance is part of the kind: `thought` is the owner's words only; anything an agent found or
  worked out is a `talk_summary`.
- Give every app its own model API key and title, and enforce region and zero data retention per
  request when a router is used; re-run a live test after any model switch.

The full list, with references to lessons 4–28 of
[simple-brain-assess](../simple-brain-assess/skills/simple-brain-assess/references/lessons-learned.md),
is in [`references/setup.md`](skills/simple-brain-kit/references/setup.md#gotchas).

## Requirements

- git, and Claude Code (cloud routines or `claude -p` on cron) for the nightly runs.
- For brain-mcp: Docker, or Python 3.10+ with `pip install -r requirements.txt`, and an HTTPS
  reverse proxy or tunnel if Claude apps should reach it.

## Tests

`tests/run.sh` checks that every decision template starts as `proposed`, that the templates carry
no private data markers, and runs the brain-mcp and brain-jobs unit tests (standard library):
capture kinds, reviews and read flags, provenance, the dismiss flag, task limits, task dedupe and
crash recovery, explicit-path commits, a counts-only summary, and the health measurement against a
fixture vault with known counts plus a fake index adapter that separates drift from pending. The HTTP-level server tests also
run when `mcp` and `httpx` are installed.
