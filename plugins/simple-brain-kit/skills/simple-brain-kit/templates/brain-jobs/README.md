# brain-jobs

Small host jobs that run next to the vault clone brain-mcp serves. Python 3.10+, standard library
only. Each one is an adapter user: swap the tracker or the notification channel with an environment
variable; the vault format and the decisions never change.

| File | What | When |
|---|---|---|
| `brain_health.py` | read-only health measurement, no model: trend line per day, priorities reminder, lint, index drift; item lists to a report on this host | nightly, after the index job, before the summary |
| `capture_tasks.py` | `kind: task` captures → tracker tasks; writes `tracker_task` + `processed_at` back and commits only those files | nightly, after `sync.sh` pulled, before the summary |
| `morning_summary.py` | counts-only message: runs, captures, tasks new/waiting, reviews waiting, owner queue, the health line | every morning |
| `trackers.py` | tracker adapters: Vikunja (worked example), Jira, Linear and GitHub Issues stubs | — |
| `index_adapters.py` | index adapters for the drift check: none, PostgREST/Supabase-pgvector, or your own `module:factory` | — |
| `notify.py` | notification adapters: stdout, Telegram, Slack webhook, email (SMTP) | — |
| `vaultlib.py` | frontmatter helpers, the vault lock shared with `sync.sh`, explicit-path commits | — |
| `jobs.env.example` | all settings: lanes, thresholds, priorities path, adapters | — |
| `systemd/` | `brain-health.service` and `.timer` as a worked example | — |

Tests: `python3 -m unittest discover -s tests`.

## Install (systemd user timers)

```ini
# ~/.config/systemd/user/brain-tasks.service
[Service]
Type=oneshot
EnvironmentFile=%h/.config/brain-jobs/env
ExecStart=/usr/bin/python3 %h/brain-jobs/capture_tasks.py

# ~/.config/systemd/user/brain-tasks.timer
[Timer]
OnCalendar=*-*-* 04:50
Persistent=true
[Install]
WantedBy=timers.target
```

Same pattern for `morning_summary.py` (e.g. 06:30) and `brain_health.py` (05:05, files in `systemd/`). Keep `~/.config/brain-jobs/env` at mode 600.
`loginctl enable-linger <user>` keeps user timers running without a login. Cron works too:

```cron
50 4 * * *  set -a; . ~/.config/brain-jobs/env; python3 ~/brain-jobs/capture_tasks.py
30 6 * * *  set -a; . ~/.config/brain-jobs/env; python3 ~/brain-jobs/morning_summary.py
```

## brain_health.py: the nightly trend

Read-only on the vault and the index, standard library only, no model: these are counts a script
gets right every time, for free.

- **Trend.** One JSON line per day in `BRAIN_HEALTH_HISTORY`; a rerun on the same day replaces it.
  - Flow: eligible backlog (decision 0001's rule), age of the oldest eligible item, transcripts no
    topic page refers to, captures not yet curated, curation nights (`ok` run logs) in the last 7.
  - Structure: orphan topic pages (index/MOC pages excluded), broken wikilinks (attachments,
    `.base` and `.canvas` excluded; transcripts, ops and templates skipped as sources),
    near-duplicate page names, malformed frontmatter.
  - Trust: AI-written pages, of those unreviewed and verified, open `[!question]`/`[!warning]`.
- **Priorities reminder.** Days since the last commit to `BRAIN_PRIORITIES_PATH`, flagged past
  `BRAIN_PRIORITIES_MAX_DAYS` (30). It never writes that page.
- **Index drift.** Per-file chunk hashes on disk vs the vector store, through an index adapter
  (`BRAIN_INDEX_ADAPTER`). The adapter's `corpus()` must come from the indexer's own scope, gate
  and chunking code (the kit's `brain_core.corpus`, or your indexer's function), so the check can't
  disagree with the indexer. Files changed after the last index run started count as **pending**,
  not drift. No adapter, no credentials or an unreachable store: the result is `null` and the
  summary says "not checked".
  Why it exists: on its first night in a live deployment, the check found three notes the indexer
  had reported as indexed that had no rows in the store, so search could never return them.
- **Where the details go.** Item lists (paths, link targets) go to `BRAIN_HEALTH_REPORT` on this
  host only; they can name clients or people. The morning summary gets one counts-only line with
  the change against the newest entry at least 7 days older, e.g.
  `health (vs 01-03): backlog 3 (-2), orphans 2, broken links 2, AI unreviewed 1, callouts 4 (+2), index drift 0 (-3)`.
  A day without a measurement shows as "health: no measurement today".

Schedule it after the index job and before the morning summary:

```bash
cp systemd/brain-health.* ~/.config/systemd/user/
python3 ~/brain-jobs/brain_health.py --dry-run     # prints the report, writes nothing
systemctl --user daemon-reload && systemctl --user enable --now brain-health.timer
```

```cron
5 5 * * *  set -a; . ~/.config/brain-jobs/env; python3 ~/brain-jobs/brain_health.py
```

Rollback: disable the timer; the summary then says "no measurement today", which is the point.
Before you retire the machine or app that runs it, move this job first.

## Rules the jobs keep

- **Never twice.** A capture with `tracker_task` is skipped; a crash between create and write-back
  is recovered by finding the capture path (the marker) in the task description.
- **Never edit or delete** a tracker task. Veto model: the owner deletes unwanted tasks.
- **Dismissed captures** (`rag_dismissed: true`) never become tasks.
- **One commit, explicit paths**, under the same lock as `sync.sh`; any other staged file aborts.
- **Counts only** in output and notifications. Task titles can name clients or people, and some
  channels (Telegram bot chats, e-mail) are not end-to-end encrypted.
- **Read-only health.** `brain_health.py` never writes the vault or the index, and never repairs
  anything: it reports.
- **No tracker configured** → status `skipped`, exit 0. A `waiting` count the morning after means
  the job did not run or failed.

## Adding a tracker

Implement `find(marker, hint)` and `create(title, details, marker)` in `trackers.py` (the stubs
list the endpoints), register it in `ADAPTERS`, set `BRAIN_TRACKER`. Return the tracker's own id
as a string (`"42"`, `"OPS-12"`, `"ENG-7"`). Use a token that can only create and read tasks in
one project.
