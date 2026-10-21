"""Tests for the host jobs (standard library only): python3 -m unittest discover -s tests"""
import io
import json
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stderr
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import capture_tasks  # noqa: E402
import morning_summary  # noqa: E402
import trackers  # noqa: E402
from vaultlib import add_fields, fm_value, split_frontmatter  # noqa: E402

TODAY = "2026-01-02"


def capture(root: Path, name: str, **fm) -> Path:
    p = root / "inbox/captures" / name
    p.parent.mkdir(parents=True, exist_ok=True)
    head = "\n".join(f"{k}: {json.dumps(v)}" if isinstance(v, str) else f"{k}: {str(v).lower()}" for k, v in fm.items())
    p.write_text(f"---\n{head}\n---\n\n{fm.get('title', '')}\ndetail line\n", encoding="utf-8")
    return p


class FakeTracker:
    def __init__(self):
        self.tasks = {}  # id -> (title, details, marker)
        self.fail_find = False

    def find(self, marker, hint):
        return next((i for i, t in self.tasks.items() if t[2] == marker), None)

    def create(self, title, details, marker):
        tid = str(len(self.tasks) + 1)
        self.tasks[tid] = (title, details, marker)
        return tid


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name) / "vault"
        self.t1 = capture(self.root, "2026-01-02-010000-task-call-acme-aa.md", kind="task", title="Call ACME about the contract")
        capture(self.root, "2026-01-02-010100-task-x-bb.md", kind="task", title="Buy screws", rag_dismissed=True)
        capture(self.root, "2026-01-02-010200-thought-x-cc.md", kind="thought", title="An idea")

    def tearDown(self):
        self.tmp.cleanup()

    def fm(self, p):
        return split_frontmatter(p.read_text())[0]


class TestCaptureTasks(Base):
    def test_creates_once_and_writes_back(self):
        tr = FakeTracker()
        r1 = capture_tasks.run(self.root, tr, commit=False, today=TODAY)
        self.assertEqual((r1["created"], r1["linked"], r1["pending"], r1["errors"]), (1, 0, 1, 0))
        self.assertEqual(fm_value(self.fm(self.t1), "tracker_task"), "1")
        self.assertEqual(fm_value(self.fm(self.t1), "processed_at"), TODAY)
        self.assertEqual(tr.tasks["1"][0], "Call ACME about the contract")
        self.assertEqual(tr.tasks["1"][1], ["detail line"])
        r2 = capture_tasks.run(self.root, tr, commit=False, today=TODAY)  # rerun: nothing new
        self.assertEqual((r2["created"], r2["pending"]), (0, 0))
        self.assertEqual(len(tr.tasks), 1)

    def test_crash_between_create_and_write_back_links_instead_of_duplicating(self):
        tr = FakeTracker()
        tr.create("Call ACME about the contract", [], "Capture: inbox/captures/" + self.t1.name)
        r = capture_tasks.run(self.root, tr, commit=False, today=TODAY)
        self.assertEqual((r["created"], r["linked"]), (0, 1))
        self.assertEqual(len(tr.tasks), 1)
        self.assertEqual(fm_value(self.fm(self.t1), "tracker_task"), "1")

    def test_dry_run_and_dismissed(self):
        r = capture_tasks.run(self.root, None, dry=True, commit=False, today=TODAY)
        self.assertEqual((r["pending"], r["created"]), (1, 0))  # the dismissed task is not pending
        self.assertNotIn("tracker_task", self.t1.read_text())

    def test_tracker_error_is_counted_not_written(self):
        class Broken(FakeTracker):
            def create(self, *a):
                raise OSError("down")
        with redirect_stderr(io.StringIO()):
            r = capture_tasks.run(self.root, Broken(), commit=False, today=TODAY)
        self.assertEqual((r["status"], r["errors"]), ("error", 1))
        self.assertNotIn("tracker_task", self.t1.read_text())

    def test_commits_only_its_own_files(self):
        git = ["git", "-C", str(self.root)]
        subprocess.run(git + ["init", "-q"], check=True)
        subprocess.run(git + ["-c", "user.email=t@t", "-c", "user.name=t", "add", "."], check=True)
        subprocess.run(git + ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "init"], check=True)
        subprocess.run(git + ["config", "user.email", "t@t"], check=True)
        subprocess.run(git + ["config", "user.name", "t"], check=True)
        (self.root / "dirty.md").write_text("someone else's work\n")
        capture_tasks.run(self.root, FakeTracker(), today=TODAY)
        changed = subprocess.run(git + ["show", "--name-only", "--format=", "HEAD"], capture_output=True, text=True).stdout.split()
        self.assertEqual(changed, ["inbox/captures/" + self.t1.name])
        self.assertIn("?? dirty.md", subprocess.run(git + ["status", "--porcelain"], capture_output=True, text=True).stdout)

    def test_unconfigured_and_stub_trackers_skip(self):
        for name in ("", "none", "jira", "linear", "github", "nope"):
            with self.subTest(name=name), self.assertRaises(trackers.TrackerNotConfigured):
                trackers.get_tracker(name or "none")


class TestAddFields(Base):
    def test_never_overwrites_existing_keys_or_body(self):
        before = self.t1.read_text().split("\n---\n", 1)[1]
        self.assertTrue(add_fields(self.t1, {"tracker_task": "7"}))
        self.assertFalse(add_fields(self.t1, {"tracker_task": "8"}))
        self.assertEqual(fm_value(self.fm(self.t1), "tracker_task"), "7")
        self.assertEqual(self.t1.read_text().split("\n---\n", 1)[1], before)


class TestMorningSummary(Base):
    def test_counts_only(self):
        capture_tasks.run(self.root, FakeTracker(), commit=False, today=TODAY)
        capture(self.root, "2026-01-02-020000-task-y-dd.md", kind="task", title="Email the board")
        capture(self.root, "2026-01-02-030000-review-z-ee.md", kind="review", title="Read: Secret page",
                target="topics/secret-page.md", verdict="read")
        runs = self.root / "ops/runs"
        runs.mkdir(parents=True)
        (runs / "2026-01-02-curate.md").write_text(
            "---\njob: curate\nstatus: ok\ncounts: {processed: 8, created: 2, queued: 0}\n---\nCurated Pricing page.\n")
        (self.root / "ops/owner-queue.md").write_text("## Open\n- [ ] x: [[a]] — decide\n- [ ] y\n## Done\n- [x] z\n")
        text = morning_summary.build(self.root, date(2026, 1, 2), ["curate", "verify"], "https://tasks.example.org/p/1")
        self.assertIn("curate: ok — 8 processed, 2 created", text)
        self.assertIn("verify: missing", text)
        self.assertIn("owner queue: 2 open", text)
        self.assertIn("tasks from captures: 1 new, 1 waiting", text)
        self.assertIn("reviews waiting for the nightly run: 1", text)
        for secret in ("ACME", "contract", "Email the board", "Secret", "Pricing", "screws", "idea"):
            self.assertNotIn(secret, text)
        missing = morning_summary.build(self.root, date(2026, 1, 2), [], "", Path(self.tmp.name) / "none.jsonl")
        self.assertIn("health: no measurement today", missing)


if __name__ == "__main__":
    unittest.main()
