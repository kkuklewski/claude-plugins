"""Tests for brain_health.py against a fixture vault with known counts, and a fake index adapter."""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import brain_health as bh  # noqa: E402
import index_adapters  # noqa: E402

NOW = datetime(2026, 1, 10, 5, 5, tzinfo=timezone.utc)


def git(root, *args, date=None):
    env = dict(os.environ, GIT_AUTHOR_NAME="t", GIT_AUTHOR_EMAIL="t@t", GIT_COMMITTER_NAME="t",
               GIT_COMMITTER_EMAIL="t@t")
    if date:
        env.update(GIT_AUTHOR_DATE=date, GIT_COMMITTER_DATE=date)
    subprocess.run(["git", "-C", str(root), *args], check=True, env=env, capture_output=True)


class FakeIndex:
    """corpus = what the indexer's rules want; indexed = what the store holds."""

    def __init__(self, corpus, indexed, since):
        self._c, self._i, self._s = corpus, indexed, since

    def corpus(self):
        return [{"path": p, "chunk_index": i, "content_hash": h} for p, ch in self._c.items() for i, h in enumerate(ch)]

    def indexed(self):
        return [{"path": p, "chunk_index": i, "content_hash": h} for p, ch in self._i.items() for i, h in enumerate(ch)]

    def last_run_start(self):
        return self._s


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name) / "vault"
        shutil.copytree(HERE / "fixtures" / "vault", self.root)
        state = Path(self.tmp.name) / "state"
        self.cfg = bh.Config(vault=self.root, history=state / "history.jsonl", report=state / "latest.md")

    def tearDown(self):
        self.tmp.cleanup()


class TestMeasure(Base):
    def test_known_counts(self):
        entry, lists = bh.measure(self.cfg, None, NOW)
        expected = {
            "eligible_backlog": 3, "oldest_eligible_days": 9, "transcripts_unreferenced": 1,
            "captures_uncurated": 1, "curation_nights_7d": 2,
            "topics": 7, "orphan_topics": 2, "broken_links": 2, "duplicate_pairs": 1, "malformed_frontmatter": 1,
            "ai_pages": 2, "ai_unreviewed": 1, "ai_verified": 1, "open_questions": 2, "open_warnings": 1,
            "priorities_age_days": None, "index": None,
        }
        self.assertEqual({k: entry[k] for k in expected}, expected)
        self.assertEqual(lists["orphan topic pages"], ["topics/orphan-page.md", "topics/pricing-models-saas.md"])
        self.assertEqual([x.split(" <- ")[0] for x in lists["broken wikilinks (target <- sources)"]],
                         ["gamma", "missing-raw-link"])
        self.assertEqual(lists["near-duplicate page names"], ["topics/pricing-models-saas.md ~ topics/pricing-models.md"])

    def test_folders_come_from_config(self):
        (self.root / "topics").rename(self.root / "wiki")
        cfg = bh.Config(vault=self.root, topics="wiki/", priorities="wiki/priorities.md")
        self.assertEqual(bh.measure(cfg, None, NOW)[0]["orphan_topics"], 2)
        self.assertEqual(bh.measure(self.cfg, None, NOW)[0]["topics"], 0)

    def test_priorities_age_from_git_never_written(self):
        git(self.root, "init", "-q")
        git(self.root, "add", "topics/priorities.md")
        git(self.root, "commit", "-qm", "priorities", date="2025-11-01T12:00:00Z")
        before = (self.root / "topics/priorities.md").read_bytes()
        entry, _ = bh.measure(self.cfg, None, NOW)
        self.assertEqual(entry["priorities_age_days"], 70)
        self.assertEqual((self.root / "topics/priorities.md").read_bytes(), before)

    def test_save_replaces_the_same_day_and_writes_report(self):
        entry, lists = bh.measure(self.cfg, None, NOW)
        bh.save(self.cfg, dict(entry, date="2026-01-09"), "old")
        bh.save(self.cfg, entry, bh.report(entry, lists))
        bh.save(self.cfg, dict(entry, eligible_backlog=99), bh.report(entry, lists))
        days = [json.loads(ln) for ln in self.cfg.history.read_text().splitlines()]
        self.assertEqual([d["date"] for d in days], ["2026-01-09", "2026-01-10"])
        self.assertEqual(days[-1]["eligible_backlog"], 99)
        self.assertIn("topics/orphan-page.md", self.cfg.report.read_text())  # item lists stay on the host


class TestIndexDrift(Base):
    def test_drift_vs_pending(self):
        since = datetime(2026, 1, 10, 3, 15, tzinfo=timezone.utc)
        old, new = since.timestamp() - 86400, since.timestamp() + 60
        for rel, t in (("raw/2026-01-01-a.md", old), ("raw/2026-01-05-b.md", old),
                       ("raw/2026-01-06-c.md", new), ("topics/beta.md", old), ("topics/alpha.md", new)):
            os.utime(self.root / rel, (t, t))
        corpus = {"raw/2026-01-01-a.md": ["h1"], "raw/2026-01-05-b.md": ["h2", "h2b"], "raw/2026-01-06-c.md": ["h3"],
                  "topics/beta.md": ["h4"], "topics/alpha.md": ["h5"]}
        indexed = {"raw/2026-01-01-a.md": ["h1"],              # in step
                   "raw/2026-01-05-b.md": ["h2", "STALE"],     # changed before the last run: drift
                   "topics/alpha.md": ["OLD"],                # changed after the last run: pending
                   "topics/deleted.md": ["h9"]}               # removed from the vault: drift
        # raw/...-c.md: not in index but new -> pending; topics/beta.md: "indexed" but no rows -> drift
        idx, drift = bh.index_drift(self.cfg, FakeIndex(corpus, indexed, since), NOW)
        self.assertEqual(idx, {"indexed_files": 4, "index_drift": 3, "index_pending": 2})
        self.assertEqual(drift, ["raw/2026-01-05-b.md (changed)", "topics/beta.md (not in index)",
                                 "topics/deleted.md (removed from vault)"])

    def test_unreachable_store_is_not_checked(self):
        class Down(FakeIndex):
            def indexed(self):
                raise ConnectionError("store down")
        idx, items = bh.index_drift(self.cfg, Down({}, {}, None), NOW)
        self.assertIsNone(idx)
        self.assertEqual(items, ["not checked: ConnectionError"])

    def test_no_adapter_configured(self):
        for spec in ("", "none"):
            with self.assertRaises(index_adapters.IndexNotConfigured):
                index_adapters.get_index_adapter(spec)
        os.environ.pop("BRAIN_INDEX_URL", None)
        with self.assertRaises(index_adapters.IndexNotConfigured):
            index_adapters.get_index_adapter("postgrest")

    def test_kit_corpus_is_the_index_rule(self):
        mcp = HERE.parent.parent / "brain-mcp"
        sys.path.insert(0, str(mcp))
        import brain_core
        vault = brain_core.Vault(self.root)
        rows = brain_core.corpus(vault)
        self.assertEqual({r["path"] for r in rows}, {rel for rel, _ in vault.files()})
        v = brain_core.VectorIndex(lambda texts: [[1.0] for _ in texts])
        b = brain_core.Brain(vault)
        b.refresh(force=True)
        v.build(b.docs)
        cached = set(v.cache)
        self.assertEqual({r["content_hash"] for r in rows}, cached)


class TestHealthLine(Base):
    def write(self, *entries):
        self.cfg.history.parent.mkdir(parents=True, exist_ok=True)
        self.cfg.history.write_text("\n".join(json.dumps(e) for e in entries) + "\n")

    def test_counts_and_weekly_change(self):
        base = {"eligible_backlog": 5, "orphan_topics": 2, "broken_links": 2, "ai_unreviewed": 1,
                "open_questions": 1, "open_warnings": 1, "index": {"index_drift": 3},
                "priorities_age_days": 10, "priorities_max_days": 30}
        self.write(dict(base, date="2026-01-02"), dict(base, date="2026-01-05", eligible_backlog=50),
                   dict(base, date="2026-01-10", eligible_backlog=3, open_questions=3, index={"index_drift": 0},
                        priorities_age_days=45))
        lines = bh.health_lines(self.cfg.history, "2026-01-10")
        self.assertEqual(lines[0], "health (vs 01-02): backlog 3 (-2), orphans 2, broken links 2, AI unreviewed 1, "
                                   "callouts 4 (+2), index drift 0 (-3)")
        self.assertEqual(lines[1], "  priorities page is 45 days old (target 30): yours to update")

    def test_not_checked_and_no_measurement(self):
        self.write({"date": "2026-01-10", "eligible_backlog": 1, "index": None})
        self.assertIn("index drift not checked", bh.health_lines(self.cfg.history, "2026-01-10")[0])
        self.assertEqual(bh.health_lines(self.cfg.history, "2026-01-11"), ["health: no measurement today"])
        self.assertEqual(bh.health_lines(Path(self.tmp.name) / "missing.jsonl", "2026-01-11"),
                         ["health: no measurement today"])

    def test_line_has_no_paths(self):
        entry, lists = bh.measure(self.cfg, None, NOW)
        bh.save(self.cfg, entry, bh.report(entry, lists))
        text = "\n".join(bh.health_lines(self.cfg.history, "2026-01-10"))
        for leak in ("topics/", "orphan-page", "gamma", "pricing"):
            self.assertNotIn(leak, text)


if __name__ == "__main__":
    unittest.main()
