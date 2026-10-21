#!/usr/bin/env python3
"""Morning summary, counts only: one short message about last night's runs, captures, tasks and the
owner queue, sent through notify.py. It reads the vault and writes nothing.

Never titles, names or note content: only job names, statuses and numbers. The tracker link
(BRAIN_TRACKER_URL, optional) is the one place to see task titles, behind the tracker's own login.

It also carries the health line from brain_health.py's history (counts with the weekly change, or
"no measurement today").

Env: BRAIN_VAULT, BRAIN_EXPECTED_JOBS (default "curate,verify,inspire"), BRAIN_TRACKER_URL,
     BRAIN_HEALTH_HISTORY, BRAIN_NOTIFY and its channel settings (notify.py).
Usage: morning_summary.py [--print]
"""
from __future__ import annotations

import os
import re
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from brain_health import health_lines  # noqa: E402
from notify import send  # noqa: E402
from vaultlib import CAPTURES, fm_value, split_frontmatter, truthy  # noqa: E402


def _front(path: Path) -> str | None:
    try:
        return split_frontmatter(path.read_text(encoding="utf-8", errors="replace")[:4000])[0]
    except OSError:
        return None


def run_lines(vault: Path, today: date, expected: list[str]) -> list[str]:
    days = {today.isoformat(), (today - timedelta(days=1)).isoformat()}
    latest: dict[str, tuple[str, str]] = {}
    for p in sorted((vault / "ops" / "runs").glob("*.md")):
        if p.name[:10] not in days:
            continue
        block = _front(p)
        job = fm_value(block, "job") or p.stem[11:]
        latest[job] = (p.name, block or "")
    lines = []
    for job in expected + sorted(set(latest) - set(expected)):
        if job not in latest:
            lines.append(f"{job}: missing")
            continue
        block = latest[job][1]
        status = re.sub(r"[^a-z]", "", fm_value(block, "status").lower()) or "unknown"
        counts = re.findall(r"([a-z_]+):\s*(\d+)", fm_value(block, "counts"))
        nums = ", ".join(f"{n} {k}" for k, n in counts if n != "0")
        lines.append(f"{job}: {status}" + (f" — {nums}" if nums else ""))
    return lines


def capture_counts(vault: Path, today: date) -> dict:
    since = (datetime.combine(today, datetime.min.time(), timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d-%H%M%S")
    c = {"captures": 0, "tasks_new": 0, "tasks_waiting": 0, "reviews_waiting": 0}
    folder = vault / CAPTURES
    for p in sorted(folder.glob("*.md")) if folder.is_dir() else []:
        block = _front(p)
        if p.name[:17] >= since:
            c["captures"] += 1
        kind = fm_value(block, "kind")
        if kind == "task" and not truthy(fm_value(block, "rag_dismissed")):
            if fm_value(block, "tracker_task"):
                c["tasks_new"] += fm_value(block, "processed_at") == today.isoformat()
            else:
                c["tasks_waiting"] += 1
        elif kind == "review" and not fm_value(block, "processed_at"):
            c["reviews_waiting"] += 1
    return c


def owner_queue_open(vault: Path) -> int:
    try:
        text = (vault / "ops" / "owner-queue.md").read_text(encoding="utf-8")
    except OSError:
        return 0
    open_part = text.split("## Open", 1)[-1].split("\n## ", 1)[0]
    return len(re.findall(r"^- \[ \]", open_part, re.M))


def build(vault: Path, today: date | None = None, expected: list[str] | None = None, tracker_url: str = "",
          health_history: Path | None = None) -> str:
    today = today or datetime.now(timezone.utc).date()
    expected = expected if expected is not None else ["curate", "verify", "inspire"]
    c = capture_counts(vault, today)
    lines = [f"Brain, {today.isoformat()}"] + run_lines(vault, today, expected)
    lines.append(f"captures (24 h): {c['captures']} · owner queue: {owner_queue_open(vault)} open")
    if c["tasks_new"] or c["tasks_waiting"]:
        lines.append(f"tasks from captures: {c['tasks_new']} new"
                     + (f", {c['tasks_waiting']} waiting" if c["tasks_waiting"] else ""))
        if tracker_url:
            lines.append(f"  {tracker_url}")
    if c["reviews_waiting"]:
        lines.append(f"reviews waiting for the nightly run: {c['reviews_waiting']}")
    if health_history is not None:
        lines += health_lines(health_history, today.isoformat())
    return "\n".join(lines)


def main() -> int:
    vault = Path(os.environ.get("BRAIN_VAULT", "/srv/brain/vault")).expanduser()
    jobs = [j.strip() for j in os.environ.get("BRAIN_EXPECTED_JOBS", "curate,verify,inspire").split(",") if j.strip()]
    history = Path(os.environ.get("BRAIN_HEALTH_HISTORY", "").strip()
                   or "~/.local/state/brain-health/history.jsonl").expanduser()
    text = build(vault, expected=jobs, tracker_url=os.environ.get("BRAIN_TRACKER_URL", "").strip(),
                 health_history=history)
    send(text, "stdout" if "--print" in sys.argv else None)
    return 0


if __name__ == "__main__":
    sys.exit(main())
