#!/usr/bin/env python3
"""Nightly health measurement of the vault, kept as a trend. Read-only, standard library, no model.

Run it on the vault host after the index job and before the morning summary. It covers:
- Trend: one JSON line per day in the history file (a rerun on the same day replaces that line).
  Flow (eligible backlog, oldest eligible item, unreferenced transcripts, uncurated captures,
  curation nights in the last 7), structure (orphan topic pages, broken wikilinks, near-duplicate
  page names, malformed frontmatter) and trust (AI pages, unreviewed, verified, open callouts).
- Priorities reminder: days since the last commit to the owner's priorities page, flagged past a
  threshold. It never writes that page: it is the owner's voice.
- Index drift: per-file chunk hashes on disk vs the vector store, through an index adapter that
  uses the indexer's own corpus code (index_adapters.py). Files changed after the last index run
  started are pending, not drift. If the check cannot run, the result is null ("not checked").
Item lists (paths, link targets) go to a report file on this host only. The morning summary gets
one counts-only line from the history (health_lines below), through the notification adapter.

Config (env, see jobs.env.example): BRAIN_VAULT, BRAIN_LANE_* folder names, BRAIN_LINK_SKIP_SOURCES,
BRAIN_PRIORITIES_PATH, BRAIN_PRIORITIES_MAX_DAYS, BRAIN_CURATE_JOB, BRAIN_DUP_STOPWORDS,
BRAIN_HEALTH_HISTORY, BRAIN_HEALTH_REPORT, BRAIN_INDEX_ADAPTER (+ its settings).
Usage: brain_health.py [--dry-run]   (prints the report, writes nothing)
"""
from __future__ import annotations

import collections
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from index_adapters import IndexNotConfigured, get_index_adapter  # noqa: E402

NOT_A_PAGE = re.compile(r"\.(base|canvas|png|jpe?g|gif|webp|svg|pdf|mp3|m4a|wav|mp4|mov)$", re.I)
SUMMARY_FIELDS = [("backlog", "eligible_backlog"), ("orphans", "orphan_topics"), ("broken links", "broken_links"),
                  ("AI unreviewed", "ai_unreviewed"), ("callouts", None), ("index drift", None)]


def _env(name: str, default: str) -> str:
    return os.environ.get(name, "").strip() or default


def _list(name: str, default: str) -> tuple[str, ...]:
    return tuple(x.strip() for x in _env(name, default).split(",") if x.strip())


@dataclass
class Config:
    vault: Path
    raw: str = "raw/"
    topics: str = "topics/"
    transcripts: str = "transcripts/"
    captures: str = "inbox/captures/"
    runs: str = "ops/runs/"
    skip_link_sources: tuple[str, ...] = ("transcripts/", "ops/", "templates/")
    priorities: str = "topics/priorities.md"
    priorities_max_days: int = 30
    curate_job: str = "curate"
    dup_stopwords: set[str] = field(default_factory=set)
    history: Path = Path("~/.local/state/brain-health/history.jsonl")
    report: Path = Path("~/.local/state/brain-health/latest.md")

    @classmethod
    def from_env(cls) -> "Config":
        lane = lambda n, d: _env(n, d).rstrip("/") + "/"  # noqa: E731
        return cls(
            vault=Path(_env("BRAIN_VAULT", "/srv/brain/vault")).expanduser(),
            raw=lane("BRAIN_LANE_RAW", "raw"), topics=lane("BRAIN_LANE_TOPICS", "topics"),
            transcripts=lane("BRAIN_LANE_TRANSCRIPTS", "transcripts"),
            captures=lane("BRAIN_LANE_CAPTURES", "inbox/captures"), runs=lane("BRAIN_LANE_RUNS", "ops/runs"),
            skip_link_sources=_list("BRAIN_LINK_SKIP_SOURCES", "transcripts/,ops/,templates/"),
            priorities=_env("BRAIN_PRIORITIES_PATH", "topics/priorities.md"),
            priorities_max_days=int(_env("BRAIN_PRIORITIES_MAX_DAYS", "30")),
            curate_job=_env("BRAIN_CURATE_JOB", "curate"),
            dup_stopwords=set(_list("BRAIN_DUP_STOPWORDS", "")),
            history=Path(_env("BRAIN_HEALTH_HISTORY", "~/.local/state/brain-health/history.jsonl")).expanduser(),
            report=Path(_env("BRAIN_HEALTH_REPORT", "~/.local/state/brain-health/latest.md")).expanduser(),
        )


# --------------------------------------------------------------------------- reading the vault

def parse_fm(text: str) -> tuple[dict, bool]:
    """(flat frontmatter, well-formed). No frontmatter at all is well-formed."""
    if not text.startswith("---\n"):
        return {}, True
    m = re.match(r"^---\n(.*?)\n---[ \t]*(\n|$)", text, re.S)
    if not m:
        return {}, False
    d, ok = {}, True
    for line in m.group(1).splitlines():
        kv = re.match(r"^([A-Za-z0-9_-]+):[ \t]*(.*)$", line)
        if kv:
            v = kv.group(2).strip()
            if v.startswith('"'):
                try:
                    v = json.loads(v)
                except ValueError:
                    v = v.strip('"')
            else:
                v = re.sub(r"\s+#.*$", "", v).strip().strip("'")
            d[kv.group(1)] = str(v)
        elif line.strip() and not re.match(r"^(\s+|-\s|#)", line):
            ok = False
    return d, ok


def vault_files(root: Path) -> tuple[dict[str, str], set[str]]:
    md, other = {}, set()
    for dirpath, dirs, files in os.walk(root):
        dirs[:] = sorted(d for d in dirs if not d.startswith("."))
        for f in files:
            rel = Path(dirpath, f).relative_to(root).as_posix()
            if f.endswith(".md"):
                md[rel] = Path(dirpath, f).read_text(encoding="utf-8", errors="replace")
            elif not f.startswith("."):
                other.add(f.lower())
    return md, other


def _truthy(v) -> bool:
    return str(v).strip().lower() in ("true", "yes", "1")


def item_day(rel: str, fm: dict) -> date | None:
    for v in (fm.get("captured_at"), fm.get("date"), fm.get("created"), Path(rel).name):
        m = re.match(r"(\d{4}-\d{2}-\d{2})", v or "")
        if m:
            try:
                return date.fromisoformat(m.group(1))
            except ValueError:
                pass
    return None


# --------------------------------------------------------------------------- measures

def flowing(cfg: Config, md: dict, fms: dict, today: date) -> dict:
    """Eligibility follows decision 0001: not curated, no veto, not dismissed, not a review, task or
    link capture."""
    def eligible(p):
        f = fms[p]
        if not p.startswith((cfg.raw, cfg.transcripts, cfg.captures)):
            return False
        if f.get("status") == "curated" or f.get("veto") or _truthy(f.get("rag_dismissed", "")):
            return False
        return not (p.startswith(cfg.captures) and f.get("kind") in ("review", "task", "link"))

    elig = [p for p in md if eligible(p)]
    ages = [(today - d).days for d in (item_day(p, fms[p]) for p in elig) if d]
    curated_text = "\n".join(t for p, t in md.items() if p.startswith(cfg.topics))
    transcripts = [p for p in md if p.startswith(cfg.transcripts)]
    week = {(today - timedelta(days=i)).isoformat() for i in range(7)}
    nights = {p[len(cfg.runs):][:10] for p in md if p.startswith(cfg.runs)
              and p.endswith(f"-{cfg.curate_job}.md") and fms[p].get("status") == "ok"} & week
    return {
        "eligible_backlog": len(elig),
        "oldest_eligible_days": max(ages) if ages else 0,
        "transcripts_unreferenced": sum(Path(p).stem not in curated_text and p[:-3] not in curated_text
                                        for p in transcripts),
        "captures_uncurated": sum(p.startswith(cfg.captures) and p in elig for p in md),
        "curation_nights_7d": len(nights),
    }


def connected(cfg: Config, md: dict, fms: dict, wellformed: dict, attachments: set) -> tuple[dict, dict]:
    by_stem = collections.defaultdict(list)
    for p in md:
        by_stem[Path(p).stem.lower()].append(p)
    paths = {p[:-3].lower() for p in md}
    inbound, broken = collections.Counter(), collections.defaultdict(set)
    for p, text in md.items():
        text = re.sub(r"```.*?```", "", text, flags=re.S)
        text = re.sub(r"`[^`\n]*`", "", text)
        own = p[:-3].lower()
        for link in re.findall(r"\[\[([^\]|#\n]+)", text):
            k = link.strip().lower()
            k = k[:-3] if k.endswith(".md") else k
            base = k.split("/")[-1]
            if k in paths:
                targets = [k]
            elif base in by_stem:
                targets = [x[:-3].lower() for x in by_stem[base]]
            else:
                if not p.startswith(cfg.skip_link_sources) and not NOT_A_PAGE.search(k) and base not in attachments:
                    broken[k].add(p)
                continue
            for t in targets:
                if t != own:
                    inbound[t] += 1
    topics = [p for p in md if p.startswith(cfg.topics)]

    def is_index(p):
        stem = Path(p).stem.lower()
        return stem in ("index", "moc") or stem.endswith(("-index", "-moc")) or fms[p].get("type") in ("index", "moc")

    orphans = sorted(p for p in topics if not inbound[p[:-3].lower()] and not is_index(p))

    def toks(p):
        return set(re.findall(r"[a-z0-9]{4,}", Path(p).stem.lower())) - cfg.dup_stopwords

    pages = sorted(p for p in topics if not is_index(p))
    dups = [(a, b) for i, a in enumerate(pages) for b in pages[i + 1:]
            if toks(a) and toks(b) and len(toks(a) & toks(b)) / len(toks(a) | toks(b)) >= 0.5]
    malformed = sorted(p for p in md if not wellformed[p])
    lists = {"orphan topic pages": orphans,
             "broken wikilinks (target <- sources)": [f"{k} <- {', '.join(sorted(v)[:3])}" for k, v in sorted(broken.items())],
             "near-duplicate page names": [f"{a} ~ {b}" for a, b in dups],
             "malformed frontmatter": malformed}
    return {"topics": len(topics), "orphan_topics": len(orphans), "broken_links": len(broken),
            "duplicate_pairs": len(dups), "malformed_frontmatter": len(malformed)}, lists


def trustworthy(cfg: Config, md: dict, fms: dict) -> dict:
    topics = [p for p in md if p.startswith(cfg.topics)]
    ai = [p for p in topics if fms[p].get("written_by") == "ai"]
    return {
        "ai_pages": len(ai),
        "ai_unreviewed": sum(not (fms[p].get("owner_read") or _truthy(fms[p].get("human_reviewed", ""))) for p in ai),
        "ai_verified": sum(fms[p].get("verification") == "done" for p in ai),
        "open_questions": sum(md[p].count("[!question]") for p in topics),
        "open_warnings": sum(md[p].count("[!warning]") for p in topics),
    }


def priorities_age(cfg: Config, today: date) -> int | None:
    try:
        out = subprocess.run(["git", "-C", str(cfg.vault), "log", "-1", "--format=%cs", "--", cfg.priorities],
                             capture_output=True, text=True, timeout=20).stdout.strip()
        return (today - date.fromisoformat(out)).days if out else None
    except (OSError, ValueError, subprocess.SubprocessError):
        return None


def index_drift(cfg: Config, adapter, now: datetime) -> tuple[dict | None, list[str]]:
    """Corpus (from the indexer's own code) vs store, per file. None when the check cannot run."""
    if adapter is None:
        return None, []
    try:
        want, have = collections.defaultdict(dict), collections.defaultdict(dict)
        for c in adapter.corpus():
            want[c["path"]][int(c["chunk_index"])] = c["content_hash"]
        for r in adapter.indexed():
            have[r["path"]][int(r["chunk_index"])] = r["content_hash"]
        since = adapter.last_run_start()
    except Exception as exc:  # store unreachable, bad credentials, schema mismatch
        return None, [f"not checked: {type(exc).__name__}"]
    drift, pending = [], []
    for p in sorted(set(want) | set(have)):
        if want.get(p) == have.get(p):
            continue
        state = "not in index" if p not in have else "removed from vault" if p not in want else "changed"
        fresh = p in want and since is not None and (cfg.vault / p).stat().st_mtime >= since.timestamp()
        (pending if fresh else drift).append(f"{p} ({state})")
    return {"indexed_files": len(have), "index_drift": len(drift), "index_pending": len(pending)}, drift


def measure(cfg: Config, adapter=None, now: datetime | None = None) -> tuple[dict, dict]:
    now = now or datetime.now(timezone.utc)
    today = now.date()
    md, attachments = vault_files(cfg.vault)
    parsed = {p: parse_fm(t) for p, t in md.items()}
    fms = {p: v[0] for p, v in parsed.items()}
    wellformed = {p: v[1] for p, v in parsed.items()}
    entry = {"date": today.isoformat(), "measured_at": now.strftime("%Y-%m-%dT%H:%M:%SZ")}
    entry.update(flowing(cfg, md, fms, today))
    conn, lists = connected(cfg, md, fms, wellformed, attachments)
    entry.update(conn)
    entry.update(trustworthy(cfg, md, fms))
    entry["priorities_age_days"] = priorities_age(cfg, today)
    entry["priorities_max_days"] = cfg.priorities_max_days
    entry["index"], lists["index drift (older than the last index run)"] = index_drift(cfg, adapter, now)
    return entry, lists


# --------------------------------------------------------------------------- output

def report(entry: dict, lists: dict) -> str:
    lines = [f"# Brain health {entry['date']}", "", "```json", json.dumps(entry, indent=1), "```"]
    for title, items in lists.items():
        if items:
            lines += ["", f"## {title} ({len(items)})"] + [f"- {i}" for i in items]
    return "\n".join(lines) + "\n"


def save(cfg: Config, entry: dict, text: str) -> None:
    cfg.history.parent.mkdir(parents=True, exist_ok=True)
    old = cfg.history.read_text(encoding="utf-8").splitlines() if cfg.history.exists() else []
    keep = [ln for ln in old if ln.strip() and json.loads(ln).get("date") != entry["date"]]
    cfg.history.write_text("\n".join(keep + [json.dumps(entry, separators=(",", ":"))]) + "\n", encoding="utf-8")
    cfg.report.parent.mkdir(parents=True, exist_ok=True)
    cfg.report.write_text(text, encoding="utf-8")


def health_lines(history: Path, day: str) -> list[str]:
    """One counts-only line for the morning summary, with the change against the newest entry at
    least 7 days older. No paths, no titles."""
    try:
        entries = [json.loads(ln) for ln in history.read_text(encoding="utf-8").splitlines() if ln.strip()]
    except (OSError, ValueError):
        entries = []
    today = next((e for e in entries if e.get("date") == day), None)
    if not today:
        return ["health: no measurement today"]
    week_ago = (date.fromisoformat(day) - timedelta(days=7)).isoformat()
    base = next((e for e in sorted(entries, key=lambda e: e.get("date", ""), reverse=True)
                 if e.get("date", "") <= week_ago), None)

    def value(e, key, label):
        if label == "callouts":
            return e.get("open_questions", 0) + e.get("open_warnings", 0)
        if label == "index drift":
            return (e.get("index") or {}).get("index_drift")
        return e.get(key)

    parts = []
    for label, key in SUMMARY_FIELDS:
        now_v = value(today, key, label)
        if now_v is None:
            parts.append(f"{label} not checked")
            continue
        was = value(base, key, label) if base else None
        parts.append(f"{label} {now_v}" + (f" ({now_v - was:+d})" if was is not None and now_v != was else ""))
    lines = [(f"health (vs {base['date'][5:]}): " if base else "health: ") + ", ".join(parts)]
    age, limit = today.get("priorities_age_days"), today.get("priorities_max_days", 30)
    if age is not None and age > limit:
        lines.append(f"  priorities page is {age} days old (target {limit}): yours to update")
    return lines


def main() -> int:
    cfg = Config.from_env()
    dry = "--dry-run" in sys.argv[1:]
    try:
        adapter = get_index_adapter()
    except IndexNotConfigured:
        adapter = None
    except Exception as exc:  # a custom adapter that fails to load must not stop the measurement
        print(f"index adapter: {type(exc).__name__}", file=sys.stderr)
        adapter = None
    entry, lists = measure(cfg, adapter)
    text = report(entry, lists)
    if dry:
        print(text)
    else:
        save(cfg, entry, text)
    print(json.dumps({"status": "ok", "dry_run": dry, "index_checked": entry["index"] is not None}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
