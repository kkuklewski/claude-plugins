# How the pieces fit

The core is small and stays the same everywhere: a **Markdown vault in git** and **one MCP gateway**
(brain-mcp) with two connectors, a read connector and an append-only capture connector. Everything
else is an **adapter** the owner picks at setup. Replacing an adapter never changes the vault format
or the decisions.

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

## Core (always the same)

| Piece | Contract |
|---|---|
| Vault | Plain Markdown with flat frontmatter, in git. Lanes and write boundaries in `AGENTS.md`. Every automation has a decision record whose `status:` is its switch. |
| Read connector | Read-only tools; flags each result (`ai_written`, `capture`, `read`, `vetoed`, `review`, `task`, `dismissed`). Owner reviews count at once. |
| Capture connector | New files only in `inbox/captures/`, kinds `thought`, `link`, `talk_summary`, `review`, `task`, limits enforced in code, switched by decision 0004 on every request. |
| Nightly runs | Playbooks in `ops/playbooks/`, one context, one commit per run, never force-push. |

## Adapters (the owner picks; ask during setup)

| Adapter | Options | Where it plugs in | Contract |
|---|---|---|---|
| Task tracker | Vikunja (worked example), Jira, Linear, GitHub Issues, none | `brain-jobs/trackers.py`, `BRAIN_TRACKER` | `find(marker, hint)`, `create(title, details, marker)`; the job writes `tracker_task` back |
| Vector store | none (keyword), local embeddings (any OpenAI-compatible `/v1/embeddings`), Supabase/pgvector or any database over HTTP or MCP | brain-mcp, `BRAIN_EMBED_URL` or `BRAIN_VECTOR_URL`; drift check: `brain-jobs/index_adapters.py`, `BRAIN_INDEX_ADAPTER` | search: `rank(query, limit) -> [path]`, fused with keyword by RRF k=60. Health: `corpus()` (from the indexer's own code), `indexed()`, `last_run_start()` |
| Notifications | Telegram, Slack, email, stdout | `brain-jobs/notify.py`, `BRAIN_NOTIFY` | `send(text)`; counts only |
| Web discovery | plain fetch, Apify, a search connector | inspire and verify playbooks; named in `AGENTS.md` | verbatim page text for quotes; query hygiene |

Rules for every adapter:
- The vault never stores adapter-specific fields beyond one id (`tracker_task`). Switching
  trackers means a new adapter and, at most, a one-off script that re-links open tasks.
- Secrets live in the host's env files (mode 600), never in the vault.
- Anything that leaves the building carries counts or generalised queries, never titles, names or
  client context.

## Vector store over HTTP (e.g. Supabase/pgvector)

brain-mcp calls one endpoint you control: `POST {"query": "...", "limit": 50}` →
`{"results": [{"path": "topics/x.md"}, ...]}`, best first. With Supabase this is an Edge Function
that embeds the query and calls a SQL function:

```sql
create extension if not exists vector;
create table brain_chunks (
  path text not null, chunk int not null, content text not null,
  embedding vector(768) not null,            -- match your embedding model
  content_hash text not null, primary key (path, chunk));
create or replace function match_brain_chunks(query_embedding vector(768), match_count int)
returns table (path text, similarity float) language sql stable as $$
  select path, max(1 - (embedding <=> query_embedding)) as similarity
  from brain_chunks group by path order by similarity desc limit match_count $$;
```

An indexer (a host job or a nightly step) chunks changed Markdown files and upserts rows keyed by
`content_hash`. Use `brain_core.doc_chunks`/`brain_core.corpus` for the chunking and scope, and
write the run's start time to a file (`BRAIN_INDEX_LAST_RUN_FILE`): then `brain_health.py` with
`BRAIN_INDEX_ADAPTER=postgrest` checks the table against the files every night. An indexer that
chunks differently gets its own `module:factory` adapter that imports its corpus code. The Markdown stays the source of truth: the table can be dropped and rebuilt.
Before switching, compare top-5 hits for keyword and hybrid on 10–20 of the owner's real questions.
