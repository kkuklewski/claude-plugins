#!/usr/bin/env python3
"""Fail if anything about to be published looks private: secrets, real IPs, home paths, personal
e-mail addresses, tailnet names or infrastructure IDs. Scans every tracked file plus untracked,
not-ignored files, so a new file is caught before its first commit.

Generic rules live here, because they name formats, not values. Names that are private by
themselves (clients, own hosts and domains, account IDs) live in a local denylist that is never
committed: one case-insensitive regex per line, '#' starts a comment. Default path
~/.config/claude-plugins/leak-denylist.txt, override with LEAK_DENYLIST. Without it the scan runs
the generic rules only and says so.

A line that must keep a match (a test fixture, a documented example) ends with `leak-scan: allow`.
Matches are printed masked, so the scan never repeats a secret in full.
Usage: python3 -I scripts/leak-scan.py   (exit 1 on any finding)
"""
import os
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DENYLIST = pathlib.Path(os.environ.get("LEAK_DENYLIST", "~/.config/claude-plugins/leak-denylist.txt")).expanduser()
ALLOW_MARK = "leak-scan: allow"

RULES = [
    ("Anthropic key", r"sk-ant-[A-Za-z0-9_-]{10,}"),
    ("OpenAI/OpenRouter key", r"\bsk-(?:or-v1-|proj-)?[A-Za-z0-9]{20,}"),
    ("GitHub token", r"\bgh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}"),
    ("AWS key", r"\bAKIA[0-9A-Z]{16}\b"),
    ("Google API key", r"\bAIza[0-9A-Za-z_-]{30,}"),
    ("Slack token", r"\bxox[abpr]-[A-Za-z0-9-]{10,}"),
    ("JWT", r"\beyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}"),
    ("private key", r"-----BEGIN [A-Z ]*PRIVATE KEY"),
    ("Telegram bot token", r"\b[0-9]{8,10}:AA[A-Za-z0-9_-]{30,}"),
    ("Supabase key", r"\bsb_(?:secret|publishable)_[A-Za-z0-9_-]{10,}"),
    ("Apify token", r"\bapify_api_[A-Za-z0-9]{20,}"),
    ("Supabase project URL", r"\b[a-z]{20}\.supabase\.co\b"),
    ("secret assignment",
     r"""(?i)\b(?:api[_-]?key|secret|token|password|passwd)\b["' ]*[:=] *["']?(?![<$%{])[A-Za-z0-9_\-/+]{16,}"""),
    ("long hex string", r"\b[0-9a-f]{32,}\b"),
    ("IPv4 address", r"\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b"),
    ("home path", r"/Users/[A-Za-z][\w.-]*|/home/[A-Za-z][\w.-]*"),
    ("e-mail address", r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"),
    ("tailnet name", r"\b[\w-]+\.ts\.net\b|\btail[0-9a-f]{4,}\b"),
    ("routine or session ID", r"\btrig_[A-Za-z0-9]{16,}|\blocal_[0-9a-f]{8}\b"),
]
# Matches that are fine by design: loopback and documentation addresses, placeholder people.
ALLOWED = {
    "IPv4 address": r"^(?:127\.0\.0\.1|0\.0\.0\.0|192\.0\.2\.\d+|198\.51\.100\.\d+|203\.0\.113\.\d+)$",
    "home path": r"^/(?:Users|home)/(?:you|user|username|me|runner|node)$",
    "e-mail address": r"@(?:example\.(?:com|org|net)|users\.noreply\.github\.com|anthropic\.com"
                      r"|project\.iam\.gserviceaccount\.com)$",
}


def files():
    out = subprocess.run(["git", "-C", str(ROOT), "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
                         capture_output=True, check=True).stdout.decode().split("\0")
    for rel in sorted(set(filter(None, out))):
        path = ROOT / rel
        if path.is_file() and path.name != ".DS_Store":
            yield rel, path


def denylist():
    if not DENYLIST.is_file():
        return None
    rules = []
    for n, line in enumerate(DENYLIST.read_text(encoding="utf-8").splitlines(), 1):
        line = line.split("#", 1)[0].strip()
        if line:
            rules.append((f"private denylist entry {n}", re.compile(line, re.I)))
    return rules


def mask(value):
    return value[:3] + "…" if len(value) > 4 else "…"


def main():
    rules = [(label, re.compile(rx)) for label, rx in RULES]
    private = denylist()
    if private is None:
        print(f"⚠ leak scan: no private denylist at {DENYLIST}; generic rules only")
    findings = 0
    for rel, path in files():
        data = path.read_bytes()
        if b"\0" in data[:8192]:
            continue  # binary
        for n, line in enumerate(data.decode("utf-8", "replace").splitlines(), 1):
            if ALLOW_MARK in line:
                continue
            for label, rx in rules + (private or []):
                for m in rx.finditer(line):
                    allowed = ALLOWED.get(label)
                    if allowed and re.search(allowed, m.group(0)):
                        continue
                    print(f"✘ {rel}:{n}  {label}  [{mask(m.group(0))}]")
                    findings += 1
    if findings:
        print(f"✘ leak scan: {findings} finding(s). Remove them, or end the line with '{ALLOW_MARK}' if intended.")
        return 1
    print("✔ leak scan" + ("" if private is None else f" (+{len(private)} private rules)"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
