"""Index adapters for the drift check in brain_health.py.

An index adapter answers three questions, read-only:
    corpus()          -> iterable of {"path", "chunk_index", "content_hash"}: what the index SHOULD hold,
                         computed with the indexer's own scope, gate and chunking code (import it; never
                         re-implement it here, or the check will disagree with the indexer)
    indexed()         -> iterable of the same keys: what the store DOES hold
    last_run_start()  -> datetime (UTC) of the start of the last index run, or None

Pick one with BRAIN_INDEX_ADAPTER:
    none          no check (the summary says "index drift not checked")
    postgrest     a Supabase/pgvector (or any PostgREST) table filled by an indexer that uses the kit's
                  chunking (brain_core.doc_chunks); corpus comes from brain_core.corpus
    module:attr   your own: import `module` (from BRAIN_INDEX_ADAPTER_PATH) and call `attr()` to get an
                  adapter. Use this when your indexer chunks differently: wrap its own corpus code.
Swapping the store or the indexer never changes the vault; only this adapter changes.
"""
from __future__ import annotations

import importlib
import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path


class IndexNotConfigured(Exception):
    """No adapter or no credentials: the check is skipped and reported as not checked."""


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def last_run_from_env(now: datetime) -> datetime | None:
    """The indexer should write its start time (ISO 8601) to BRAIN_INDEX_LAST_RUN_FILE. Without it,
    BRAIN_INDEX_SCHEDULE ("HH:MM", UTC) gives the most recent scheduled start."""
    f = _env("BRAIN_INDEX_LAST_RUN_FILE")
    if f:
        try:
            t = datetime.fromisoformat(Path(f).expanduser().read_text().strip().replace("Z", "+00:00"))
            return t if t.tzinfo else t.replace(tzinfo=timezone.utc)
        except (OSError, ValueError):
            pass
    sched = _env("BRAIN_INDEX_SCHEDULE")
    if sched:
        h, m = map(int, sched.split(":"))
        t = now.replace(hour=h, minute=m, second=0, microsecond=0)
        return t if t <= now else t - timedelta(days=1)
    return None


class PostgrestIndex:
    """Rows in a PostgREST table (Supabase: <project>/rest/v1/<table>) with columns path, chunk,
    content_hash, as in the kit's references/architecture.md. Read-only: GET with a key that can
    only select. Env: BRAIN_INDEX_URL (the table URL), BRAIN_INDEX_KEY, BRAIN_MCP_DIR (to import
    brain_core for the corpus), BRAIN_VAULT, BRAIN_EXCLUDE."""

    page = 1000

    def __init__(self):
        self.url, self.key = _env("BRAIN_INDEX_URL"), _env("BRAIN_INDEX_KEY")
        if not (self.url and self.key):
            raise IndexNotConfigured("BRAIN_INDEX_URL and BRAIN_INDEX_KEY are required")
        mcp_dir = _env("BRAIN_MCP_DIR")
        if mcp_dir:
            sys.path.insert(0, str(Path(mcp_dir).expanduser()))
        try:
            import brain_core
        except ImportError:
            raise IndexNotConfigured("brain_core not importable: set BRAIN_MCP_DIR") from None
        self.core = brain_core
        self.vault = brain_core.Vault(Path(_env("BRAIN_VAULT", "/srv/brain/vault")).expanduser(),
                                      exclude=[p for p in _env("BRAIN_EXCLUDE").split(",") if p])

    def corpus(self):
        return self.core.corpus(self.vault)

    def indexed(self):
        offset = 0
        while True:
            q = urllib.parse.urlencode({"select": "path,chunk,content_hash", "order": "path,chunk",
                                        "limit": self.page, "offset": offset})
            req = urllib.request.Request(f"{self.url}?{q}", headers={
                "apikey": self.key, "Authorization": f"Bearer {self.key}", "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=30) as r:  # noqa: S310 (URL is operator config)
                rows = json.load(r)
            for row in rows:
                yield {"path": row["path"], "chunk_index": row["chunk"], "content_hash": row["content_hash"]}
            if len(rows) < self.page:
                return
            offset += self.page

    def last_run_start(self):
        return last_run_from_env(datetime.now(timezone.utc))


def get_index_adapter(spec: str | None = None):
    spec = spec if spec is not None else _env("BRAIN_INDEX_ADAPTER", "none")
    if not spec or spec == "none":
        raise IndexNotConfigured("BRAIN_INDEX_ADAPTER is not set")
    if spec == "postgrest":
        return PostgrestIndex()
    if ":" in spec:
        path = _env("BRAIN_INDEX_ADAPTER_PATH")
        if path:
            sys.path.insert(0, str(Path(path).expanduser()))
        module, attr = spec.split(":", 1)
        return getattr(importlib.import_module(module), attr)()
    raise IndexNotConfigured(f"unknown index adapter {spec!r}")
