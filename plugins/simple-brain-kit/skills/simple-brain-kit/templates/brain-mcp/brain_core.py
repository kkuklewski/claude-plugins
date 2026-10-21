"""Core of brain-mcp: read-only vault access, hybrid search and the append-only capture writer.

Standard library only, so it can be tested without the MCP SDK. server.py wraps it in MCP tools.
"""
from __future__ import annotations

import fcntl
import fnmatch
import json
import math
import os
import re
import secrets
import time
import unicodedata
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Iterable

RRF_K = 60
MAX_READ_BYTES = 200_000
CAPTURE_MAX_BYTES = 4096
CAPTURE_MAX_PER_DAY = 20
CAPTURE_DIR = "inbox/captures"
CAPTURE_DECISION = "decisions/0004-brain-capture.md"
CAPTURE_KINDS = ("thought", "link", "talk_summary", "review", "task")
REVIEW_VERDICTS = ("read", "reject")
# A review may point at any curated or raw lane; reject only where a veto means something.
REVIEW_LANES = ("topics/", "raw/", "transcripts/", "inbox/", "ops/runs/")
REJECT_LANES = ("topics/", "raw/", "inbox/")
TASK_TITLE_MAX = 150
TASK_MAX_CHARS = 1000

# --------------------------------------------------------------------------- vault access


class VaultError(ValueError):
    """A request the vault refuses (bad path, excluded folder, not Markdown, ...)."""


@dataclass
class Vault:
    root: Path
    exclude: list[str] = field(default_factory=list)  # glob patterns relative to root

    def __post_init__(self) -> None:
        self.root = Path(self.root).resolve()

    def _excluded(self, rel: str) -> bool:
        parts = rel.split("/")
        if any(p.startswith(".") for p in parts):
            return True
        return any(fnmatch.fnmatch(rel, pat) or fnmatch.fnmatch(rel, pat.rstrip("/") + "/*")
                   for pat in self.exclude)

    def resolve(self, rel: str) -> Path:
        """Map a vault-relative path to a file inside the vault, or raise VaultError."""
        rel = (rel or "").strip().lstrip("/")
        if not rel or "\x00" in rel:
            raise VaultError("empty path")
        p = (self.root / rel).resolve()
        if p != self.root and self.root not in p.parents:
            raise VaultError("path outside the vault")
        rel_norm = p.relative_to(self.root).as_posix()
        if self._excluded(rel_norm):
            raise VaultError("path is excluded")
        if p.suffix.lower() != ".md":
            raise VaultError("only Markdown files can be read")
        if not p.is_file():
            raise VaultError("no such file")
        return p

    def files(self) -> Iterable[tuple[str, Path]]:
        for dirpath, dirnames, filenames in os.walk(self.root):
            rel_dir = Path(dirpath).relative_to(self.root).as_posix()
            rel_dir = "" if rel_dir == "." else rel_dir + "/"
            dirnames[:] = sorted(d for d in dirnames if not self._excluded(rel_dir + d))
            for name in sorted(filenames):
                rel = rel_dir + name
                p = Path(dirpath) / name
                if name.lower().endswith(".md") and not self._excluded(rel) and self._inside(p):
                    yield rel, p

    def _inside(self, p: Path) -> bool:
        """False for a symlink that points out of the vault."""
        try:
            r = p.resolve()
        except OSError:
            return False
        return self.root in r.parents and r.is_file()

    def read(self, rel: str) -> str:
        data = self.resolve(rel).read_bytes()[:MAX_READ_BYTES]
        return data.decode("utf-8", errors="replace")


def parse_frontmatter(text: str) -> dict[str, str]:
    """Flat `key: value` frontmatter parser. Values lose inline comments and JSON/YAML quotes."""
    if not text.startswith("---"):
        return {}
    end = text.find("\n---", 3)
    if end == -1:
        return {}
    out: dict[str, str] = {}
    for line in text[3:end].splitlines():
        m = re.match(r"^([A-Za-z0-9_-]+):\s*(.*)$", line)
        if not m:
            continue
        val = m.group(2).strip()
        if val.startswith('"'):
            try:
                val = json.loads(val[: _json_string_end(val) + 1])
            except ValueError:
                val = val.strip('"')
        else:
            val = re.sub(r"\s+#.*$", "", val).strip().strip("'")
        out[m.group(1)] = str(val)
    return out


def _json_string_end(s: str) -> int:
    i, esc = 1, False
    while i < len(s):
        c = s[i]
        if esc:
            esc = False
        elif c == "\\":
            esc = True
        elif c == '"':
            return i
        i += 1
    return len(s) - 1


def title_of(rel: str, text: str) -> str:
    fm = parse_frontmatter(text)
    if fm.get("title"):
        return fm["title"]
    m = re.search(r"^#\s+(.+)$", text, re.M)
    return m.group(1).strip() if m else Path(rel).stem


# --------------------------------------------------------------------------- search

_FOLD = str.maketrans({"ł": "l", "Ł": "l", "ø": "o", "Ø": "o", "đ": "d", "Đ": "d", "ß": "ss", "æ": "ae", "œ": "oe"})


def tokenize(text: str) -> list[str]:
    """Lowercase, fold diacritics (so 'zrodlo' finds 'źródło'), split into word tokens."""
    text = unicodedata.normalize("NFKD", text.translate(_FOLD).lower())
    text = "".join(c for c in text if not unicodedata.combining(c))
    return [t for t in re.findall(r"\w+", text) if len(t) > 1]


def rrf(rankings: list[list[str]], k: int = RRF_K) -> list[tuple[str, float]]:
    """Reciprocal Rank Fusion: score(d) = sum over rankings of 1 / (k + rank), rank from 1."""
    scores: dict[str, float] = {}
    for ranking in rankings:
        for rank, doc in enumerate(ranking, start=1):
            scores[doc] = scores.get(doc, 0.0) + 1.0 / (k + rank)
    return sorted(scores.items(), key=lambda kv: (-kv[1], kv[0]))


@dataclass
class Doc:
    rel: str
    title: str
    text: str
    mtime: float
    tokens: list[str]
    fm: dict = field(default_factory=dict)
    review: list[str] = field(default_factory=list)  # from owner reviews not yet applied by the nightly run

    @property
    def flags(self) -> list[str]:
        flags = doc_flags(self.rel, self.fm)
        return flags + [f for f in self.review if f not in flags]


def _truthy(v: str) -> bool:
    return str(v).strip().lower() in ("true", "yes", "1")


def doc_flags(rel: str, fm: dict) -> list[str]:
    """Labels a reader needs to weigh a note: who wrote it and what the owner decided about it."""
    flags = []
    if fm.get("written_by") == "ai":
        flags.append("ai_written")
    if rel.startswith(CAPTURE_DIR + "/"):
        flags.append("capture")
        if fm.get("kind") == "review":
            flags.append("review")
        elif fm.get("kind") == "task":
            flags.append("task")
    if fm.get("owner_read"):
        flags.append("read")
    if fm.get("veto"):
        flags.append("vetoed")
    if _truthy(fm.get("rag_dismissed", "")):
        flags.append("dismissed")
    return flags


def apply_reviews(docs: list[Doc]) -> None:
    """Owner reviews count at once, before the nightly run applies them: the latest review of a
    note wins; read -> "read", reject -> "read" + "vetoed"."""
    latest: dict[str, tuple[str, str]] = {}
    for d in docs:
        if d.rel.startswith(CAPTURE_DIR + "/") and d.fm.get("kind") == "review":
            target, verdict = d.fm.get("target", ""), d.fm.get("verdict", "")
            at = d.fm.get("captured_at", "")
            if target and verdict in REVIEW_VERDICTS and at >= latest.get(target, ("", ""))[0]:
                latest[target] = (at, verdict)
    for d in docs:
        verdict = latest.get(d.rel, ("", ""))[1]
        d.review = ["read", "vetoed"] if verdict == "reject" else ["read"] if verdict == "read" else []


class KeywordIndex:
    """BM25 over whole files; the title counts three times."""

    def __init__(self, docs: list[Doc], k1: float = 1.4, b: float = 0.75):
        self.docs, self.k1, self.b = docs, k1, b
        self.tf: list[dict[str, int]] = []
        df: dict[str, int] = {}
        for d in docs:
            counts: dict[str, int] = {}
            for t in d.tokens:
                counts[t] = counts.get(t, 0) + 1
            self.tf.append(counts)
            for t in counts:
                df[t] = df.get(t, 0) + 1
        n = max(len(docs), 1)
        self.idf = {t: math.log(1 + (n - f + 0.5) / (f + 0.5)) for t, f in df.items()}
        self.avgdl = sum(len(d.tokens) for d in docs) / n if docs else 1.0

    def rank(self, query: str, limit: int = 50) -> list[str]:
        q = set(tokenize(query))
        scored = []
        for d, tf in zip(self.docs, self.tf):
            dl = len(d.tokens) or 1
            s = 0.0
            for t in q:
                f = tf.get(t)
                if f:
                    s += self.idf[t] * f * (self.k1 + 1) / (f + self.k1 * (1 - self.b + self.b * dl / self.avgdl))
            if s > 0:
                scored.append((s, d.rel))
        scored.sort(key=lambda x: (-x[0], x[1]))
        return [rel for _, rel in scored[:limit]]


Embedder = Callable[[list[str]], list[list[float]]]


def http_embedder(url: str, model: str, api_key: str = "", timeout: float = 30.0) -> Embedder:
    """Embeddings from any OpenAI-compatible /v1/embeddings endpoint (a self-hosted one, ideally)."""

    def embed(texts: list[str]) -> list[list[float]]:
        body = json.dumps({"model": model, "input": texts}).encode()
        req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
        if api_key:
            req.add_header("Authorization", f"Bearer {api_key}")
        with urllib.request.urlopen(req, timeout=timeout) as r:  # noqa: S310 (URL is operator config)
            data = json.load(r)["data"]
        return [row["embedding"] for row in sorted(data, key=lambda r: r["index"])]

    return embed


def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a)) or 1.0
    nb = math.sqrt(sum(y * y for y in b)) or 1.0
    return dot / (na * nb)


def chunks(text: str, size: int = 1500) -> list[str]:
    """Split on headings, then cap chunk length, so each vector covers one section."""
    parts = [p.strip() for p in re.split(r"\n(?=#{1,3} )", text) if p.strip()]
    out: list[str] = []
    for p in parts or [text]:
        out.extend(p[i:i + size] for i in range(0, len(p), size))
    return out or [""]


def chunk_hash(chunk: str) -> str:
    import hashlib
    return hashlib.sha256(chunk.encode()).hexdigest()


def doc_chunks(title: str, text: str) -> list[tuple[int, str, str]]:
    """The indexer's chunking rule: (chunk_index, chunk text, content hash). One definition, used by
    the vector index and by the nightly health check, so the two can never disagree."""
    return [(i, c, chunk_hash(c)) for i, c in enumerate(chunks(f"{title}\n{text}"))]


def corpus(vault: "Vault") -> list[dict]:
    """What the index should contain: every file in scope (Vault.files: Markdown, no hidden or
    excluded folders, no symlinks out) as {path, chunk_index, content_hash}."""
    out = []
    for rel, p in vault.files():
        text = p.read_bytes()[:MAX_READ_BYTES].decode("utf-8", errors="replace")
        out += [{"path": rel, "chunk_index": i, "content_hash": h} for i, _, h in doc_chunks(title_of(rel, text), text)]
    return out


class VectorIndex:
    """Chunk vectors cached by content hash in a JSON file outside the vault."""

    def __init__(self, embed: Embedder, cache_file: Path | None = None, batch: int = 32):
        self.embed, self.cache_file, self.batch = embed, cache_file, batch
        self.cache: dict[str, list[float]] = {}
        if cache_file and cache_file.is_file():
            try:
                self.cache = json.loads(cache_file.read_text())
            except ValueError:
                self.cache = {}
        self.chunks: list[tuple[str, list[float]]] = []

    def build(self, docs: list[Doc]) -> None:
        pending = []
        pairs = []
        for d in docs:
            for _, c, k in doc_chunks(d.title, d.text):
                pairs.append((d.rel, k))
                if k not in self.cache:
                    pending.append((k, c))
        for i in range(0, len(pending), self.batch):
            part = pending[i:i + self.batch]
            for (k, _), vec in zip(part, self.embed([c for _, c in part])):
                self.cache[k] = vec
        live = {k for _, k in pairs}
        self.cache = {k: v for k, v in self.cache.items() if k in live}
        if self.cache_file and pending:
            self.cache_file.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.cache_file.with_suffix(".tmp")
            tmp.write_text(json.dumps(self.cache))
            tmp.replace(self.cache_file)
        self.chunks = [(rel, self.cache[k]) for rel, k in pairs]

    def rank(self, query: str, limit: int = 50) -> list[str]:
        if not self.chunks:
            return []
        q = self.embed([query])[0]
        best: dict[str, float] = {}
        for rel, vec in self.chunks:
            s = _cosine(q, vec)
            if s > best.get(rel, -2.0):
                best[rel] = s
        return [rel for rel, _ in sorted(best.items(), key=lambda kv: (-kv[1], kv[0]))[:limit]]


class RemoteVectorStore:
    """Vector store adapter for an external database (Supabase/pgvector, Qdrant, ...) behind one HTTP
    endpoint you control. Contract: POST {"query": str, "limit": int} -> {"results": [{"path": str}]},
    best first. Indexing happens on the database side (see references/architecture.md)."""

    def __init__(self, url: str, api_key: str = "", timeout: float = 20.0):
        self.url, self.api_key, self.timeout = url, api_key, timeout

    def build(self, docs: list[Doc]) -> None:  # the database keeps its own index
        return None

    def rank(self, query: str, limit: int = 50) -> list[str]:
        body = json.dumps({"query": query, "limit": limit}).encode()
        req = urllib.request.Request(self.url, data=body, headers={"Content-Type": "application/json"})
        if self.api_key:
            req.add_header("Authorization", f"Bearer {self.api_key}")
        with urllib.request.urlopen(req, timeout=self.timeout) as r:  # noqa: S310 (URL is operator config)
            rows = json.load(r).get("results", [])
        return [str(row["path"]) for row in rows if row.get("path")][:limit]


class Brain:
    """Read-only view of a vault with keyword or hybrid (keyword + vector, RRF) search."""

    def __init__(self, vault: Vault, embed: Embedder | None = None, cache_file: Path | None = None,
                 ttl: float = 30.0, store: "RemoteVectorStore | None" = None):
        """embed: local vectors (cached in cache_file). store: an external vector store adapter.
        Pass one or neither; without both, search is keyword only."""
        self.vault, self.embed, self.cache_file, self.ttl, self.store = vault, embed, cache_file, ttl, store
        self._sig: tuple | None = None
        self._checked = 0.0
        self.docs: list[Doc] = []
        self.keyword = KeywordIndex([])
        self.vector: VectorIndex | RemoteVectorStore | None = None
        self.vector_error = ""

    def _signature(self) -> tuple:
        stats = [(rel, p.stat().st_mtime, p.stat().st_size) for rel, p in self.vault.files()]
        return tuple(stats)

    def refresh(self, force: bool = False) -> None:
        now = time.monotonic()
        if not force and self._sig is not None and now - self._checked < self.ttl:
            return
        self._checked = now
        sig = self._signature()
        if sig == self._sig and not force:
            return
        docs = []
        for rel, p in self.vault.files():
            text = p.read_bytes()[:MAX_READ_BYTES].decode("utf-8", errors="replace")
            title = title_of(rel, text)
            docs.append(Doc(rel, title, text, p.stat().st_mtime, tokenize(title) * 3 + tokenize(text),
                            parse_frontmatter(text)))
        apply_reviews(docs)
        self.docs, self._sig = docs, sig
        self.keyword = KeywordIndex(docs)
        if self.store is not None:
            self.vector = self.store
        elif self.embed:
            try:
                v = VectorIndex(self.embed, self.cache_file)
                v.build(docs)
                self.vector, self.vector_error = v, ""
            except Exception as e:  # embedding service down: keyword search still works
                self.vector, self.vector_error = None, f"{type(e).__name__}"

    def _doc(self, rel: str) -> Doc | None:
        return next((d for d in self.docs if d.rel == rel), None)

    def search(self, query: str, limit: int = 10, lane: str = "") -> dict:
        self.refresh()
        limit = max(1, min(int(limit), 50))
        rankings = [self.keyword.rank(query)]
        mode = "keyword"
        if self.vector is not None:
            try:
                rankings.append(self.vector.rank(query))
                mode = "hybrid"
            except Exception as e:
                self.vector_error = type(e).__name__
        fused = rrf(rankings)
        if lane:
            fused = [(r, s) for r, s in fused if r.startswith(lane.rstrip("/") + "/")]
        results = []
        for rel, score in fused[:limit]:
            d = self._doc(rel)
            if d:
                results.append({"path": rel, "title": d.title, "score": round(score, 5),
                                "flags": d.flags, "snippet": snippet(d.text, query)})
        out = {"mode": mode, "results": results}
        if self.vector_error:
            out["vector_error"] = self.vector_error
        return out

    def recent(self, days: int = 7, limit: int = 20, include_read: bool = False) -> list[dict]:
        """Recently changed files. Notes the owner marked read or rejected, and the review captures
        themselves, are left out unless include_read is set."""
        self.refresh()
        cutoff = time.time() - max(1, int(days)) * 86400
        docs = [d for d in self.docs if d.mtime >= cutoff]
        if not include_read:
            docs = [d for d in docs if not {"read", "review"} & set(d.flags)]
        docs.sort(key=lambda d: (-d.mtime, d.rel))
        return [{"path": d.rel, "title": d.title, "flags": d.flags,
                 "modified": datetime.fromtimestamp(d.mtime, timezone.utc).strftime("%Y-%m-%d %H:%M")}
                for d in docs[: max(1, min(int(limit), 100))]]

    def topics(self) -> list[dict]:
        self.refresh()
        out = []
        for d in self.docs:
            if d.rel.startswith("topics/"):
                fm = parse_frontmatter(d.text)
                out.append({"path": d.rel, "title": d.title, "updated": fm.get("updated", ""),
                            "verification": fm.get("verification", ""), "flags": d.flags})
        return out

    def overview(self) -> dict:
        self.refresh()
        lanes: dict[str, int] = {}
        for d in self.docs:
            lane = d.rel.split("/")[0] if "/" in d.rel else "(root)"
            if d.rel.startswith("inbox/captures/"):
                lane = "inbox/captures"
            elif d.rel.startswith("ops/runs/"):
                lane = "ops/runs"
            lanes[lane] = lanes.get(lane, 0) + 1
        decisions = []
        for d in self.docs:
            if d.rel.startswith("decisions/"):
                decisions.append({"path": d.rel, "title": d.title,
                                  "status": parse_frontmatter(d.text).get("status", "")})
        last = self.last_run()
        return {"files_per_lane": lanes, "decisions": decisions,
                "last_run": last.get("path", ""), "search_mode": "hybrid" if self.vector else "keyword"}

    def last_run(self, job: str = "") -> dict:
        self.refresh()
        runs = [d for d in self.docs if d.rel.startswith("ops/runs/")]
        if job:
            runs = [d for d in runs if parse_frontmatter(d.text).get("job") == job or d.rel.endswith(f"-{job}.md")]
        if not runs:
            return {}
        d = max(runs, key=lambda d: (d.rel.rsplit("/", 1)[-1][:10], d.mtime, d.rel))
        return {"path": d.rel, "frontmatter": parse_frontmatter(d.text), "text": d.text[:4000]}


def snippet(text: str, query: str, width: int = 240) -> str:
    body = text.split("\n---", 1)[1] if text.startswith("---") and "\n---" in text[3:] else text
    folded = tokenize(body)
    q = set(tokenize(query))
    flat = " ".join(body.split())
    if not q or not folded:
        return flat[:width]
    low = flat.lower()
    for t in q:
        i = low.find(t)
        if i >= 0:
            start = max(0, i - width // 3)
            return ("…" if start else "") + flat[start:start + width]
    return flat[:width]


# --------------------------------------------------------------------------- capture

_BIDI_AND_INVISIBLE = {
    0x061C, 0x200B, 0x200C, 0x200D, 0x200E, 0x200F, 0x2028, 0x2029,
    0x202A, 0x202B, 0x202C, 0x202D, 0x202E, 0x2060, 0x2066, 0x2067, 0x2068, 0x2069, 0xFEFF,
}


def clean_text(s: str, *, multiline: bool) -> str:
    """Strip control characters (keeping \\n and \\t in multi-line text) and bidi/invisible ones."""
    s = unicodedata.normalize("NFC", s or "").replace("\r\n", "\n").replace("\r", "\n")
    keep = {"\n", "\t"}
    out = []
    for c in s:
        if c in keep:
            out.append(c)
        elif ord(c) in _BIDI_AND_INVISIBLE or unicodedata.category(c) in ("Cc", "Cf", "Cs", "Co", "Zl", "Zp"):
            continue
        else:
            out.append(c)
    s = "".join(out)
    if not multiline:
        s = " ".join(s.replace("\t", " ").split())
    return s.strip()


class CaptureRefused(Exception):
    """The capture was not written; the message says why and is safe to show to the caller."""


def capture_status(vault_root: Path) -> str:
    """Read the switch on every request. Anything unreadable counts as off."""
    try:
        text = (Path(vault_root) / CAPTURE_DECISION).read_text(encoding="utf-8")
    except OSError:
        return "missing"
    return parse_frontmatter(text).get("status", "") or "missing"


_URL_RE = re.compile(r"^https?://[^\s<>\"]+$", re.I)


def _slug(s: str, n: int = 40) -> str:
    s = unicodedata.normalize("NFKD", s.translate(_FOLD).lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s[:n].strip("-") or "capture"


def _review_target(vault: Vault, target: str, verdict: str) -> tuple[str, str, str]:
    verdict = clean_text(verdict, multiline=False).lower()
    if verdict not in REVIEW_VERDICTS:
        raise CaptureRefused(f"a review needs verdict {' or '.join(REVIEW_VERDICTS)}")
    try:
        p = vault.resolve(clean_text(target, multiline=False))
    except VaultError as e:
        raise CaptureRefused(f"a review needs the path of an existing note ({e})") from None
    rel = p.relative_to(vault.root).as_posix()
    if not rel.startswith(REVIEW_LANES):
        raise CaptureRefused("only notes in topics/, raw/, transcripts/, inbox/ and ops/runs/ can be reviewed")
    if verdict == "reject" and not rel.startswith(REJECT_LANES):
        raise CaptureRefused("only topics/, raw/ and inbox/ notes can be rejected; mark it read instead")
    text = p.read_bytes()[:20000].decode("utf-8", errors="replace")
    return rel, verdict, clean_text(title_of(rel, text), multiline=False)[:80]


def write_capture(vault_root: Path, kind: str, text: str = "", title: str = "", url: str = "",
                  target: str = "", verdict: str = "", dismiss_reason: str = "",
                  vault: Vault | None = None, now: datetime | None = None,
                  rand: Callable[[], str] | None = None) -> str:
    """Write one capture as a new file. Returns the vault-relative path, or raises CaptureRefused.

    Provenance is part of the kind: thought, link, review and task carry the owner's own words or
    decisions (written_by: human); anything the agent found, checked or worked out is a talk_summary
    (written_by: ai). dismiss_reason marks a capture that is not knowledge (a shopping list): it is
    kept, but curation and search treat it as dismissed.
    """
    root = Path(vault_root)
    status = capture_status(root)
    if status != "active":
        raise CaptureRefused(f"capture is switched off ({CAPTURE_DECISION} status: {status})")
    if kind not in CAPTURE_KINDS:
        raise CaptureRefused(f"kind must be one of {', '.join(CAPTURE_KINDS)}")
    body = clean_text(text, multiline=True)
    title = clean_text(title, multiline=False)[:120]
    url = clean_text(url, multiline=False)
    dismiss_reason = clean_text(dismiss_reason, multiline=False)[:200]
    extra: dict[str, str] = {}

    if kind == "review":
        rel, verdict, target_title = _review_target(vault or Vault(root), target, verdict)
        if len(body) > 500:
            raise CaptureRefused("keep the reason of a review under 500 characters")
        title = f"{'Read' if verdict == 'read' else 'Rejected'}: {target_title}"
        body = f"Owner marked [[{rel[:-3]}]] as **{verdict}**." + (f"\n\nReason: {body}" if body else "")
        extra = {"target": rel, "verdict": verdict}
        url = ""
    elif not body and not url:
        raise CaptureRefused("empty capture")
    elif kind == "link":
        if not url or len(url) > 2048 or not _URL_RE.match(url):
            raise CaptureRefused("a link capture needs an http(s) url")
    elif url and not _URL_RE.match(url):
        raise CaptureRefused("url must be http(s)")
    if kind == "task":
        first = body.split("\n", 1)[0].strip()
        if not first or len(first) > TASK_TITLE_MAX or len(body) > TASK_MAX_CHARS:
            raise CaptureRefused(f"a task is one title line (max {TASK_TITLE_MAX} characters) plus optional "
                                 f"detail lines, {TASK_MAX_CHARS} characters in all")
        title = first
    if kind == "talk_summary":
        body = "> AI-written summary, not the owner's words.\n\n" + body

    now = now or datetime.now(timezone.utc)
    rand = rand or (lambda: secrets.token_hex(3))
    fm = {
        "type": "capture",
        "kind": kind,
        "title": title or (body.split("\n", 1)[0][:80] if body else url[:80]),
        "captured_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "written_by": "ai" if kind == "talk_summary" else "human",
        "source": "brain-capture",
        "trust": "unverified",
        "status": "raw",
        **extra,
    }
    if url:
        fm["url"] = url
    lines = [f"{k}: {json.dumps(v, ensure_ascii=False)}" for k, v in fm.items()]
    if dismiss_reason:
        lines += ["rag_dismissed: true", f"dismiss_reason: {json.dumps(dismiss_reason, ensure_ascii=False)}"]
    head = "\n".join(lines)
    content = f"---\n{head}\n---\n\n{body}\n".encode("utf-8")
    if len(content) > CAPTURE_MAX_BYTES:
        raise CaptureRefused(f"capture is {len(content)} bytes; the limit is {CAPTURE_MAX_BYTES}. Shorten it.")

    cap_dir = root / CAPTURE_DIR
    if not cap_dir.is_dir():
        raise CaptureRefused("captures folder is missing")
    day = now.strftime("%Y-%m-%d")
    lock_fd = os.open(cap_dir / ".capture.lock", os.O_CREAT | os.O_WRONLY, 0o600)
    try:
        fcntl.flock(lock_fd, fcntl.LOCK_EX)
        today = sum(1 for n in os.listdir(cap_dir) if n.startswith(day) and n.endswith(".md"))
        if today >= CAPTURE_MAX_PER_DAY:
            raise CaptureRefused(f"daily limit of {CAPTURE_MAX_PER_DAY} captures reached")
        name = f"{now.strftime('%Y-%m-%d-%H%M%S')}-{kind.replace('_', '-')}-{_slug(fm['title'], 30)}-{rand()}.md"
        path = cap_dir / name
        try:
            fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY | getattr(os, "O_NOFOLLOW", 0), 0o644)
        except FileExistsError:
            raise CaptureRefused("a capture with this name already exists; try again") from None
        with os.fdopen(fd, "wb") as f:
            f.write(content)
    finally:
        fcntl.flock(lock_fd, fcntl.LOCK_UN)
        os.close(lock_fd)
    return f"{CAPTURE_DIR}/{name}"
