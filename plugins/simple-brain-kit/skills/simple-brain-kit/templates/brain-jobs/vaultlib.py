"""Small helpers shared by the host jobs: frontmatter, the vault lock, explicit-path commits.

Standard library only. The jobs run on the host that keeps the vault clone brain-mcp serves.
"""
from __future__ import annotations

import fcntl
import json
import re
import subprocess
import time
from pathlib import Path

CAPTURES = "inbox/captures"


def split_frontmatter(text: str) -> tuple[str | None, int]:
    """Return (frontmatter block without fences, index where the body starts)."""
    m = re.match(r"^---\n(.*?)\n---\n?", text, re.S)
    return (m.group(1), m.end()) if m else (None, 0)


def fm_value(block: str | None, key: str) -> str:
    """One flat value; JSON-quoted scalars (as Brain Capture writes them) are decoded."""
    if not block:
        return ""
    m = re.search(rf"^{re.escape(key)}:[ \t]*(.*)$", block, re.M)
    if not m:
        return ""
    raw = m.group(1).strip()
    if raw.startswith('"'):
        try:
            return str(json.loads(raw))
        except ValueError:
            pass
    return re.sub(r"\s+#.*$", "", raw).strip().strip("'\"")


def truthy(v: str) -> bool:
    return str(v).strip().lower() in ("true", "yes", "1")


def add_fields(path: Path, fields: dict[str, str]) -> bool:
    """Append JSON-quoted fields to a file's frontmatter. Never touches the body or existing keys."""
    text = path.read_text(encoding="utf-8")
    block, end = split_frontmatter(text)
    if block is None:
        return False
    new = {k: v for k, v in fields.items() if not re.search(rf"^{re.escape(k)}:", block, re.M)}
    if not new:
        return False
    block = block.rstrip("\n") + "".join(f"\n{k}: {json.dumps(str(v), ensure_ascii=False)}" for k, v in new.items())
    path.write_text("---\n" + block + "\n---\n" + text[end:], encoding="utf-8")
    return True


class VaultLock:
    """The same lock sync.sh takes (.git/brain-sync.lock), so a job never races a pull or push."""

    def __init__(self, vault: Path, wait: float = 120.0):
        self.path, self.wait, self.f = Path(vault) / ".git" / "brain-sync.lock", wait, None

    def __enter__(self):
        if not self.path.parent.is_dir():
            return self  # not a git checkout (tests, dry runs): nothing to coordinate with
        self.f = open(self.path, "a")
        deadline = time.monotonic() + self.wait
        while True:
            try:
                fcntl.flock(self.f, fcntl.LOCK_EX | fcntl.LOCK_NB)
                return self
            except BlockingIOError:
                if time.monotonic() > deadline:
                    raise TimeoutError("vault lock busy") from None
                time.sleep(2)

    def __exit__(self, *exc):
        if self.f:
            fcntl.flock(self.f, fcntl.LOCK_UN)
            self.f.close()


def commit_paths(vault: Path, paths: list[str], message: str) -> bool:
    """One commit with exactly these paths. Aborts (and unstages) if anything else got staged."""
    if not paths or not (Path(vault) / ".git").exists():
        return False
    git = ["git", "-C", str(vault)]
    subprocess.run(git + ["add", "--"] + paths, check=True)
    staged = subprocess.run(git + ["diff", "--cached", "--name-only"], check=True,
                            capture_output=True, text=True).stdout.split()
    if set(staged) - set(paths):
        subprocess.run(git + ["reset", "-q"], check=True)
        raise RuntimeError("refusing to commit: files outside this job were staged")
    if not staged:
        return False
    subprocess.run(git + ["commit", "-q", "-m", message], check=True)
    return True
