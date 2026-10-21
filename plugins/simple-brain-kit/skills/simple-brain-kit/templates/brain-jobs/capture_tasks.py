#!/usr/bin/env python3
"""Turn Brain Capture `kind: task` captures into tracker tasks: one task per capture, never two.

Run nightly on the vault host, after sync.sh pulled and before the morning summary. For each
`inbox/captures/*.md` with `kind: task`, no `tracker_task` and no `rag_dismissed: true`, it creates
a task with the configured adapter (trackers.py), then writes `tracker_task` and `processed_at`
into the capture's frontmatter under the vault lock and commits exactly those files. sync.sh pushes.

Never twice: a capture with `tracker_task` is skipped. If a run crashed after creating the task but
before writing the id, the next run finds the task by the capture path in its description and only
writes the id. Veto model: tasks are created without asking; the owner deletes unwanted ones. It
never edits or deletes a tracker task. It prints counts only, never task titles.

Env: BRAIN_VAULT (vault clone), BRAIN_TRACKER (vikunja|jira|linear|github) and that adapter's settings.
Without a configured tracker it prints status "skipped" and exits 0.
Usage: capture_tasks.py [--dry-run] [--no-commit]
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from trackers import TrackerNotConfigured, get_tracker  # noqa: E402
from vaultlib import (CAPTURES, VaultLock, add_fields, commit_paths, fm_value,  # noqa: E402
                      split_frontmatter, truthy)

MAX_PER_RUN = 20  # the capture endpoint allows 20 captures a day in all


def pending_tasks(vault: Path):
    folder = vault / CAPTURES
    for path in sorted(folder.glob("*.md")) if folder.is_dir() else []:
        text = path.read_text(encoding="utf-8", errors="replace")
        block, end = split_frontmatter(text)
        if block is None or fm_value(block, "kind") != "task" or fm_value(block, "tracker_task"):
            continue
        if truthy(fm_value(block, "rag_dismissed")):
            continue
        yield path, block, text[end:]


def details_of(title: str, body: str) -> list[str]:
    lines = [ln.strip() for ln in body.splitlines() if ln.strip() and not ln.startswith(("#", ">"))]
    return [ln for ln in lines if ln != title]


def run(vault: Path, tracker=None, dry: bool = False, commit: bool = True, today: str | None = None) -> dict:
    today = today or datetime.now(timezone.utc).date().isoformat()
    created = linked = pending = errors = 0
    touched: list[str] = []
    with VaultLock(vault):
        for path, block, body in list(pending_tasks(vault)):
            title = fm_value(block, "title")[:250]
            if not title:
                errors += 1
                print(f"skip {path.name}: no title", file=sys.stderr)
                continue
            pending += 1
            if dry or created + linked >= MAX_PER_RUN:
                continue
            rel = f"{CAPTURES}/{path.name}"
            marker = f"Capture: {rel}"
            try:
                task_id = tracker.find(marker, path.name)
                if task_id:
                    linked += 1
                else:
                    task_id = tracker.create(title, details_of(title, body), marker)
                    created += 1
                add_fields(path, {"tracker_task": task_id, "processed_at": today})
                touched.append(rel)
            except (urllib.error.URLError, KeyError, ValueError, TimeoutError, OSError) as exc:
                errors += 1
                print(f"failed {path.name}: {type(exc).__name__}", file=sys.stderr)
        if commit and touched:
            commit_paths(vault, touched, f"brain(tasks): {created} created, {linked} linked")
    return {"status": "error" if errors else "ok", "dry_run": dry, "pending": pending,
            "created": created, "linked": linked, "errors": errors}


def main() -> int:
    vault = Path(os.environ.get("BRAIN_VAULT", "/srv/brain/vault")).expanduser()
    dry = "--dry-run" in sys.argv
    tracker = None
    if not dry:
        try:
            tracker = get_tracker()
        except TrackerNotConfigured as e:
            print(json.dumps({"status": "skipped", "reason": str(e)}))
            return 0
    result = run(vault, tracker, dry=dry, commit="--no-commit" not in sys.argv)
    print(json.dumps(result))
    return 1 if result["errors"] else 0


if __name__ == "__main__":
    sys.exit(main())
