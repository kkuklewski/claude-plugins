# Playbook: morning summary (counts only)

Decision: none of its own; it reports on the others. It writes nothing to the vault and makes no
commit.

## Steps

1. Read the run logs in `ops/runs/` from the last 24 hours and count open items in
   `ops/owner-queue.md`.
2. Send one short message (email, chat or notification: whatever the owner chose at setup) with
   **counts only**:

   ```text
   Brain, <date>
   curate: ok — 8 processed, 2 new pages, 3 perspectives
   verify: ok — 5 pages, 1 refuted
   inspire: skipped — decision paused
   captures yesterday: 4 · owner queue: 2 open
   ```

3. Add one line only when something needs the owner: a `failed` or `stalled` run, a missing run,
   or the owner queue over 10.

## Rules

- **No titles, no names, no page content, no client names** in the message. Notifications leave
  the building and land on phones and lock screens. The owner opens the vault for details.
- One message per morning. No message at all is better than a digest nobody reads; if the owner
  stops reading it, cut it.
- A run that did not happen is reported as `missing`, not silently omitted.
