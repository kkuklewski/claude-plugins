# Setup: scheduling, morning summary, health checks, gotchas

## Scheduling the nightly runs

Each run is one Claude session with one short prompt: "Read `ops/playbooks/<name>.md` in this
repository and follow it." The playbook and `_run-rules.md` carry the rules, so the schedule stays
dumb. Suggested order, an hour apart so commits never race:

| Time (owner's zone) | Run | Playbook | Decision |
|---|---|---|---|
| 01:00 | discovery | `inspire.md` | 0005 |
| 02:00 | curation | `curate.md` | 0001 (+ 0002) |
| 03:00 | verification | `verify-and-resolve.md` | 0003 |
| 06:30 | morning summary | `morning-summary.md` | — |

Discovery runs first so its finds are curated the same night.

### Option A: Claude Code cloud routines

- One routine per run, pointed at the vault repository, with the prompt above.
- The routine needs push access to the repository and only the connectors its playbook uses
  (web fetch/search for discovery and verification, a mail or chat connector for the summary).
- **A cloud run sees only the repository.** Skills, agents and MCP servers that live on a laptop
  are missing there. Everything a run needs must be in the repo or attached to the routine.
- Private services (a server on a home or office network) are unreachable from the cloud: the
  playbook logs them as `skipped`, not `failed`.

### Option B: cron on a machine the owner controls

```cron
# m h dom mon dow  command
0 2 * * *  cd /srv/brain/work && claude -p "Read ops/playbooks/curate.md and follow it." --allowedTools "Read Edit Write Glob Grep Bash(git *)" >> /var/log/brain/curate.log 2>&1
```

- Use a separate clone for the runs, not the clone that brain-mcp serves (that one is for
  `sync.sh`).
- Allow only the tools the playbook needs (`--allowedTools`), and git push with a deploy key that
  can push to this one repository only.
- Keep the log; the morning summary and the 7-night check read the run logs, but a run that
  crashed before writing one is only visible in the cron log.

## Morning summary: counts only

`ops/playbooks/morning-summary.md` sends one message per morning with counts per job, captures
yesterday and open owner-queue items, plus a line only for `failed`, `stalled` or `missing` runs.
No titles, no names, no content: a notification ends up on lock screens and in other people's
inboxes. If nobody reads it for two weeks, turn it off instead of adding more.

## Health checks (from simple-brain-assess)

After the first 7 nights, run `/simple-brain-assess <vault> --plan`, or check by hand:

| Area | Check | Target |
|---|---|---|
| Flow | Eligible raw items not yet curated | ≤ one night's batch |
| Flow | Oldest eligible raw item | ≤ 7 days |
| Flow | Runs that completed last week | ≥ 6 of 7 |
| Flow | Nights with real output, not only preparation | ≥ 5 of 7 |
| Structure | Topic pages with no inbound link (index excluded) | 0 |
| Structure | Broken internal links, malformed frontmatter | 0 |
| Trust | AI-written pages without a source | 0 |
| Trust | Open `[!question]`/`[!warning]` older than 14 days | 0 |
| Ownership | Run logs or owner queue read | weekly |
| Ownership | Owner queue open items | ≤ 10 |

**Prove the work, not the status.** For each job, build a 7-row table: night → ran / finished /
output count / note. A routine marked green only means the session ended. One clean night with a
commit and zero curated items is a stalled night.

## Gotchas

The background for most of these is in simple-brain-assess's `references/lessons-learned.md`
(lessons 4–8, 14–22); the lesson numbers are given in brackets.

- **Re-running secret setup rotates the secrets**, and that breaks a connector that is already
  added: its URL (capture path) and key no longer match, and a connector's headers cannot be
  edited, so it has to be removed and re-added. `setup_secrets.sh` keeps existing secrets unless
  you pass `--rotate`. [21]
- **Reading and writing are separate connectors.** Never add a write tool to the read endpoint;
  a leaked read URL must not be able to change anything. [17]
- **The decision file is the live switch.** The capture endpoint reads `status:` on every call, so
  pausing is one committed line and `sync.sh` run, no redeploy. [18]
- **The container user must be able to write only the captures folder.** Mount the vault
  read-only and only `inbox/captures/` read-write, run the container as the clone owner's uid/gid,
  and verify with the `touch` probes in the brain-mcp README. A captures folder the container
  cannot write gives "storage error" on every capture; a writable vault is a security hole. [19]
- **One long session costs more than the clone.** The fixed cost of a run is the context, not the
  `git clone`. Do a run in a single context: in an A/B test, single context was about 2.2x cheaper
  than one sub-agent per page, at equal quality. Do not split a night into many sessions or
  sub-agents to "save" the clone. [7]
- **Preparation can eat the whole run.** If scoring or fetching uses the cap, curation stalls at
  zero while the run looks green. The playbooks write what they have at half-budget. [4, 16]
- **A guard that warns but still commits is not a guard.** The scope and whitespace checks in
  `_run-rules.md` abort the commit. [5]
- **Fetch summaries are not quotes.** Verification needs a fetch that returns the page text. [8]
- **Query hygiene.** No client names or private context in web, Apify or search queries, and
  none in notifications. [14]
- **claude.ai connector headers.** Only approved header names work for a static key;
  `x-api-key` and `authorization` are presets, and `authorization` is greyed out when OAuth is
  selected. Use the header option with `x-api-key`. [20]
- **Keep the Markdown.** A vector index sits on top of the vault; never replace the files with a
  vector store. [13]
- **Measure search changes on your own questions.** Before switching on hybrid search, write
  10–20 real questions with the page that should answer each, and compare top-5 hits for keyword
  and hybrid. Apply any folder or label weighting once, and check that labelled perspectives are
  still found. [22]
