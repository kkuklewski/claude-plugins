# Playbook: morning summary (counts only)

Decision: none of its own; it reports on the others. It writes nothing to the vault and makes no
commit. On a host, `brain-jobs/morning_summary.py` does the same in code and sends it through the
notification adapter the owner picked; use this playbook when the summary runs as a routine.

## Steps

1. Read the run logs in `ops/runs/` from the last 24 hours and count open items in
   `ops/owner-queue.md`. In `inbox/captures/` count: captures in the last 24 hours; `kind: task`
   captures whose `processed_at` is today (new tasks) and those without `tracker_task` (waiting,
   dismissed ones excluded); `kind: review` captures without `processed_at`.
2. Send one short message (email, chat or notification: whatever the owner chose at setup) with
   **counts only**:

   ```text
   Brain, <date>
   curate: ok — 8 processed, 2 new pages, 3 perspectives
   verify: ok — 5 pages, 1 refuted
   inspire: skipped — decision paused
   captures (24 h): 4 · owner queue: 2 open
   tasks from captures: 2 new, 1 waiting
     <link to the tracker project>
   ```

3. Add one line only when something needs the owner: a `failed` or `stalled` run, a missing run,
   or the owner queue over 10.

## Rules

- **No titles, no names, no page content, no client names** in the message, and that includes
  task titles: a to-do can name a client or a person. The tracker link is where titles live. Notifications leave
  the building and land on phones and lock screens. The owner opens the vault for details.
- One message per morning. No message at all is better than a digest nobody reads; if the owner
  stops reading it, cut it.
- A run that did not happen is reported as `missing`, not silently omitted. Tasks still `waiting`
  the morning after mean the task job did not run or failed.
- **Per-item cards** (an optional chat bot that asks "keep or veto?" about new curated pages) are
  separate from this summary and still never carry content beyond a title the owner allowed. They
  skip every note with `owner_read`, `veto`, `rag_dismissed: true` or a perspective label: the
  owner already decided, or there is nothing to decide.
