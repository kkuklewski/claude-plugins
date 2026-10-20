# brain-mcp

A small MCP server over a Markdown brain vault, in two parts on one process:

| Endpoint | Path | Tools | Writes |
|---|---|---|---|
| Read | `<BRAIN_READ_PATH>/mcp` | `search`, `read`, `recent`, `topics`, `overview`, `last_run` | nothing |
| Capture (optional) | `<BRAIN_CAPTURE_PATH>/mcp`, a secret random path | `capture` | new files in `inbox/captures/` only |

Both check an API key in the `x-api-key` header, each with its own key. `/healthz` answers `ok`.

## Files

| File | What |
|---|---|
| `brain_core.py` | Vault access, keyword (BM25) and hybrid search, the capture writer. Standard library only. |
| `server.py` | MCP tools (FastMCP from the official `mcp` SDK, v1), key checks, mounting. |
| `tests/` | `python3 -m unittest discover -s tests`. Server tests run when `mcp` and `httpx` are installed. |
| `Dockerfile`, `docker-compose.yml` | Container: read-only root, vault mounted read-only, captures folder read-write. |
| `env.example` | All settings. `setup_secrets.sh` turns it into `.env`. |
| `setup_secrets.sh` | Generates the keys and the capture path. Keeps existing ones unless `--rotate`. |
| `sync.sh` | Host job: commits new captures only, pulls the nightly commits, pushes. Never force-pushes. |

## Search

- **Keyword**: BM25 over whole files, title weighted 3x, diacritics folded (`zrodlo` finds `źródło`).
- **Hybrid** (optional, `BRAIN_EMBED_URL`): chunk vectors from any OpenAI-compatible
  `/v1/embeddings` endpoint, fused with the keyword ranking by Reciprocal Rank Fusion
  (`score = Σ 1/(60 + rank)`, k = 60). Vectors are cached by content hash in `/data`, outside the
  vault. If the embedding service is down, search falls back to keyword and says so.
- Every chunk is sent to the embedding endpoint. If the vault holds client or personal data, use a
  self-hosted model (for example Ollama with `nomic-embed-text`), not a third-party API.
- Check it on your own questions before relying on it: 10–20 real questions with the page that
  should answer each, top-5 hits for keyword vs hybrid.
- The index refreshes when files change (checked at most every 30 s). Fine for a few thousand
  notes; beyond that, move the vectors into a real vector store, still on top of the Markdown.

## Capture rules (enforced in code)

- Refuses unless `decisions/0004-brain-capture.md` says `status: active`. The file is read on
  **every** request: switching it to `paused` stops captures at once, no restart.
- New files only: exclusive create (`O_EXCL`, plus `O_NOFOLLOW`), never overwrite, edit or delete.
- At most 4 KB per file and 20 per day (UTC), counted under a file lock.
- Control characters and bidi/invisible characters (U+202A–202E, U+2066–2069, zero-width, …)
  are stripped. Every frontmatter value is JSON-quoted, so a title like `x"\n---\nstatus: active`
  cannot inject fields.
- Kinds: `thought` (`written_by: "human"`), `link` (http/https URL required), `talk_summary`
  (`written_by: "ai"`). Every capture is `trust: "unverified"`, so curation treats it as a
  perspective until evidence promotes it.

## Deploy

1. Clone the vault on the server (`VAULT_DIR`), with a deploy key that can push.
2. `./setup_secrets.sh` (add `--capture` for the capture endpoint). Edit `.env`: `VAULT_DIR`,
   `BRAIN_UID`/`BRAIN_GID` (`id -u` / `id -g` of the clone's owner), `BRAIN_ALLOWED_HOSTS`,
   `BRAIN_EXCLUDE`.
3. `docker compose up -d --build`, then check what the container may write:

   ```bash
   docker compose exec brain-mcp sh -c 'touch /vault/probe' && echo "WRONG: vault is writable"
   docker compose exec brain-mcp sh -c 'touch /vault/inbox/captures/.probe && rm /vault/inbox/captures/.probe' && echo "ok: captures writable"
   ```

4. Publish it over HTTPS: a reverse proxy (Caddy, nginx) or a tunnel. Keep port 8765 bound to
   localhost.
5. Run `sync.sh <VAULT_DIR>` every 5 minutes (cron or a systemd timer) so captures reach the repo
   and nightly commits reach the server.

## Adding it to Claude (claude.ai custom connectors)

Add two connectors, one per endpoint: `https://<host><BRAIN_READ_PATH>/mcp` and
`https://<host><BRAIN_CAPTURE_PATH>/mcp`, each with its own key.

- Custom connectors accept only **approved header names** for a static key. `x-api-key` and
  `authorization` are presets; this server uses `x-api-key`.
- `authorization` is **greyed out when OAuth is selected** as the connector's auth type. Choose
  the header option, not OAuth, and use `x-api-key`.
- The capture path is part of the secret: anyone with the URL and key can add captures (not read
  them). Treat both like a password.

## Rotating secrets

`./setup_secrets.sh --rotate [--capture]`, then `docker compose up -d`, then **remove and re-add
both connectors** with the new path and keys (a connector's headers cannot be edited). Rotation
breaks every connector that is already added: that is the point when a key leaks, and a surprise
otherwise.
