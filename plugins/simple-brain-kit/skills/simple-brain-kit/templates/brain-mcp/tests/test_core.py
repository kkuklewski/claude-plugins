"""Tests for brain_core (standard library only): python3 -m unittest discover -s tests"""
import json
import os
import sys
import tempfile
import time
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from brain_core import (CAPTURE_DECISION, CAPTURE_MAX_PER_DAY, RRF_K, Brain, CaptureRefused,  # noqa: E402
                        RemoteVectorStore, Vault, VaultError, capture_status, clean_text,
                        parse_frontmatter, rrf, tokenize, write_capture)

NOW = datetime(2026, 1, 2, 3, 4, 5, tzinfo=timezone.utc)


def make_vault(root: Path, status: str = "proposed") -> Path:
    files = {
        "topics/index.md": "---\ntitle: \"Index\"\n---\n# Index\n[[pricing]]\n",
        "topics/pricing.md": "---\ntitle: \"Pricing models\"\nupdated: 2026-01-01\nverification: partial\n---\n"
                             "# Pricing\nUsage-based pricing grows with the customer.\n",
        "topics/źródła.md": "---\ntitle: \"Źródła wiedzy\"\n---\nGdzie szukać źródeł.\n",
        "raw/2026-01-01-note.md": "A raw note about onboarding checklists.\n",
        "private/secret-plan.md": "pricing pricing pricing\n",
        ".git/config.md": "pricing\n",
        "ops/runs/2026-01-01-curate.md": "---\njob: curate\nstatus: ok\n---\nold\n",
        "ops/runs/2026-01-02-curate.md": "---\njob: curate\nstatus: stalled\n---\nnew\n",
        "ops/runs/2026-01-02-verify.md": "---\njob: verify\nstatus: ok\n---\nv\n",
        CAPTURE_DECISION: f"---\ntitle: \"Capture\"\nstatus: {status}          # proposed | active | paused\n---\n",
        "notes.txt": "pricing\n",
    }
    for rel, text in files.items():
        p = root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text, encoding="utf-8")
    (root / "inbox/captures").mkdir(parents=True, exist_ok=True)
    return root


def set_status(root: Path, status: str) -> None:
    (root / CAPTURE_DECISION).write_text(f"---\nstatus: {status}   # comment\n---\n", encoding="utf-8")


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = make_vault(Path(self.tmp.name) / "vault")
        self.vault = Vault(self.root, exclude=["private"])

    def tearDown(self):
        self.tmp.cleanup()


class TestHelpers(unittest.TestCase):
    def test_tokenize_folds_diacritics(self):
        self.assertEqual(tokenize("Źródło, łódź!"), ["zrodlo", "lodz"])

    def test_rrf_uses_k60(self):
        fused = dict(rrf([["a", "b"], ["b", "c"]]))
        self.assertEqual(RRF_K, 60)
        self.assertAlmostEqual(fused["b"], 1 / 62 + 1 / 61)
        self.assertAlmostEqual(fused["a"], 1 / 61)
        self.assertEqual([d for d, _ in rrf([["a", "b"], ["b", "c"]])], ["b", "a", "c"])

    def test_frontmatter_strips_comments_and_json_quotes(self):
        fm = parse_frontmatter('---\nstatus: active   # on\ntitle: "a \\"b\\" # c"\n---\n')
        self.assertEqual(fm["status"], "active")
        self.assertEqual(fm["title"], 'a "b" # c')

    def test_clean_text_strips_control_and_bidi(self):
        s = "ok‮evil⁦x\u0007y​z\r\nline two"
        self.assertEqual(clean_text(s, multiline=True), "okevilxyz\nlinetwo")
        self.assertEqual(clean_text("a\nb\tc", multiline=False), "a b c")


class TestRead(Base):
    def test_read_ok(self):
        self.assertIn("Usage-based", self.vault.read("topics/pricing.md"))

    def test_read_refusals(self):
        for bad in ("../outside.md", "/etc/passwd", "notes.txt", "private/secret-plan.md",
                    ".git/config.md", "topics/missing.md", ""):
            with self.subTest(bad=bad), self.assertRaises(VaultError):
                self.vault.read(bad)

    def test_symlink_out_of_vault_refused(self):
        outside = Path(self.tmp.name) / "outside.md"
        outside.write_text("secret")
        os.symlink(outside, self.root / "topics/link.md")
        with self.assertRaises(VaultError):
            self.vault.read("topics/link.md")
        self.assertNotIn("topics/link.md", [r for r, _ in self.vault.files()])


class TestBrain(Base):
    def test_keyword_search_ranks_title_and_excludes(self):
        out = Brain(self.vault).search("pricing")
        paths = [r["path"] for r in out["results"]]
        self.assertEqual(out["mode"], "keyword")
        self.assertEqual(paths[0], "topics/pricing.md")
        self.assertNotIn("private/secret-plan.md", paths)
        self.assertNotIn(".git/config.md", paths)

    def test_search_folds_diacritics_and_lane(self):
        self.assertEqual(Brain(self.vault).search("zrodla")["results"][0]["path"], "topics/źródła.md")
        self.assertEqual(Brain(self.vault).search("onboarding", lane="topics")["results"], [])

    def test_hybrid_fuses_vector_ranking(self):
        def fake_embed(texts):  # 'onboarding' axis vs everything else
            return [[1.0, 0.0] if "onboarding" in t.lower() or "welcome" in t.lower() else [0.0, 1.0]
                    for t in texts]
        b = Brain(self.vault, embed=fake_embed, cache_file=Path(self.tmp.name) / "idx/vectors.json")
        out = b.search("welcome staff")  # no keyword hit, vector finds the raw note
        self.assertEqual(out["mode"], "hybrid")
        self.assertEqual(out["results"][0]["path"], "raw/2026-01-01-note.md")
        self.assertTrue((Path(self.tmp.name) / "idx/vectors.json").is_file())

    def test_embedder_failure_falls_back_to_keyword(self):
        def broken(_):
            raise ConnectionError("down")
        out = Brain(self.vault, embed=broken).search("pricing")
        self.assertEqual(out["mode"], "keyword")
        self.assertEqual(out["vector_error"], "ConnectionError")

    def test_topics_overview_last_run_recent(self):
        b = Brain(self.vault)
        t = {x["path"]: x for x in b.topics()}
        self.assertEqual(t["topics/pricing.md"]["verification"], "partial")
        ov = b.overview()
        self.assertEqual(ov["files_per_lane"]["ops/runs"], 3)
        self.assertIn({"path": CAPTURE_DECISION, "title": "Capture", "status": "proposed"}, ov["decisions"])
        self.assertEqual(b.last_run("curate")["frontmatter"]["status"], "stalled")
        self.assertEqual(b.last_run("verify")["path"], "ops/runs/2026-01-02-verify.md")
        old = time.time() - 30 * 86400
        os.utime(self.root / "raw/2026-01-01-note.md", (old, old))
        b.refresh(force=True)
        self.assertNotIn("raw/2026-01-01-note.md", [r["path"] for r in b.recent(7)])


class TestCapture(Base):
    def cap(self, **kw):
        args = dict(kind="thought", text="An idea.", now=NOW)
        args.update(kw)
        return write_capture(self.root, **args)

    def test_refused_unless_active_and_read_every_request(self):
        with self.assertRaises(CaptureRefused):
            self.cap()
        set_status(self.root, "active")
        self.assertTrue(self.cap().startswith("inbox/captures/2026-01-02-030405-thought-"))
        set_status(self.root, "paused")
        with self.assertRaises(CaptureRefused):
            self.cap()
        (self.root / CAPTURE_DECISION).unlink()
        self.assertEqual(capture_status(self.root), "missing")
        with self.assertRaises(CaptureRefused):
            self.cap()

    def test_file_content_and_frontmatter_quoting(self):
        set_status(self.root, "active")
        rel = self.cap(title='x"\n---\nstatus: active‮', text="body\u0000 text\n---\nmore")
        text = (self.root / rel).read_text()
        head = text.split("\n---\n", 1)[0]
        self.assertEqual(text.count("\n---\n"), 2)  # closing fence + the body's own line, nothing else
        for line in head.splitlines()[1:]:
            key, val = line.split(": ", 1)
            json.loads(val)  # every value is a JSON string
        fm = parse_frontmatter(text)
        self.assertEqual(fm["title"], 'x" --- status: active')
        self.assertEqual(fm["status"], "raw")
        self.assertEqual(fm["written_by"], "human")
        self.assertNotIn("\u0000", text)
        self.assertNotIn("‮", text)

    def test_talk_summary_is_ai_written(self):
        set_status(self.root, "active")
        rel = self.cap(kind="talk_summary", text="We discussed X.")
        self.assertEqual(parse_frontmatter((self.root / rel).read_text())["written_by"], "ai")

    def test_link_needs_http_url(self):
        set_status(self.root, "active")
        for bad in ("", "javascript:alert(1)", "file:///etc/passwd", "https://a b"):
            with self.subTest(url=bad), self.assertRaises(CaptureRefused):
                self.cap(kind="link", url=bad)
        rel = self.cap(kind="link", url="https://example.org/a?b=1", text="why")
        self.assertEqual(parse_frontmatter((self.root / rel).read_text())["url"], "https://example.org/a?b=1")

    def test_bad_kind_and_size_limit(self):
        set_status(self.root, "active")
        with self.assertRaises(CaptureRefused):
            self.cap(kind="note")
        with self.assertRaises(CaptureRefused):
            self.cap(text="x" * 4100)
        self.cap(text="x" * 3500)

    def test_never_overwrites(self):
        set_status(self.root, "active")
        rel = self.cap(title="t", rand=lambda: "same")
        before = (self.root / rel).read_bytes()
        with self.assertRaises(CaptureRefused):
            self.cap(title="t", text="Other.", rand=lambda: "same")
        self.assertEqual((self.root / rel).read_bytes(), before)

    def test_daily_limit(self):
        set_status(self.root, "active")
        for i in range(CAPTURE_MAX_PER_DAY):
            self.cap(text=f"idea {i}")
        with self.assertRaises(CaptureRefused):
            self.cap(text="one too many")
        nxt = datetime(2026, 1, 3, tzinfo=timezone.utc)
        self.cap(text="next day", now=nxt)


class TestReviewTaskProvenance(Base):
    def setUp(self):
        super().setUp()
        set_status(self.root, "active")

    def cap(self, **kw):
        args = dict(kind="thought", text="", now=NOW, vault=self.vault)
        args.update(kw)
        return write_capture(self.root, **args)

    def fm(self, rel):
        return parse_frontmatter((self.root / rel).read_text())

    def test_review_records_target_and_verdict(self):
        rel = self.cap(kind="review", target="topics/pricing.md", verdict="Read", text="done")
        fm = self.fm(rel)
        self.assertEqual((fm["kind"], fm["target"], fm["verdict"], fm["written_by"]),
                         ("review", "topics/pricing.md", "read", "human"))
        self.assertEqual(fm["title"], "Read: Pricing models")
        self.assertIn("[[topics/pricing]]", (self.root / rel).read_text())

    def test_review_refusals(self):
        bad = [dict(target="topics/missing.md", verdict="read"),          # must exist
               dict(target="../x.md", verdict="read"),                    # inside the vault
               dict(target="private/secret-plan.md", verdict="read"),     # not an excluded folder
               dict(target="topics/pricing.md", verdict="maybe"),         # verdict read|reject
               dict(target="ops/runs/2026-01-01-curate.md", verdict="reject"),  # reject only where a veto means something
               dict(target=CAPTURE_DECISION, verdict="read")]             # not a reviewable lane
        for kw in bad:
            with self.subTest(**kw), self.assertRaises(CaptureRefused):
                self.cap(kind="review", **kw)
        self.cap(kind="review", target="ops/runs/2026-01-01-curate.md", verdict="read")

    def test_read_connector_flags_reviews_at_once(self):
        b = Brain(self.vault)
        self.assertNotIn("read", {f for r in b.topics() for f in r["flags"]})
        self.cap(kind="review", target="topics/pricing.md", verdict="read")
        self.cap(kind="review", target="raw/2026-01-01-note.md", verdict="reject",
                 now=datetime(2026, 1, 2, 4, tzinfo=timezone.utc))
        b.refresh(force=True)
        flags = {r["path"]: r["flags"] for r in b.recent(days=3650, include_read=True)}
        self.assertIn("read", flags["topics/pricing.md"])
        self.assertNotIn("vetoed", flags["topics/pricing.md"])
        self.assertEqual({"read", "vetoed"} & set(flags["raw/2026-01-01-note.md"]), {"read", "vetoed"})
        hidden = [r["path"] for r in b.recent(days=3650)]
        self.assertNotIn("topics/pricing.md", hidden)
        self.assertFalse(any(p.startswith("inbox/captures/") for p in hidden))  # review captures hidden too
        self.assertIn("topics/index.md", hidden)

    def test_latest_review_wins_and_owner_read_counts(self):
        self.cap(kind="review", target="raw/2026-01-01-note.md", verdict="reject")
        self.cap(kind="review", target="raw/2026-01-01-note.md", verdict="read",
                 now=datetime(2026, 1, 3, tzinfo=timezone.utc))
        p = self.root / "topics/index.md"
        p.write_text("---\ntitle: \"Index\"\nowner_read: 2026-01-01\n---\n")
        b = Brain(self.vault)
        flags = {r["path"]: r["flags"] for r in b.recent(days=3650, include_read=True)}
        self.assertNotIn("vetoed", flags["raw/2026-01-01-note.md"])
        self.assertIn("read", flags["topics/index.md"])

    def test_task_limits_and_title(self):
        rel = self.cap(kind="task", text="Renew the domain\nbefore the end of the month")
        fm = self.fm(rel)
        self.assertEqual((fm["kind"], fm["title"], fm["written_by"]), ("task", "Renew the domain", "human"))
        self.assertIn("-task-", rel)
        for text in ("x" * 151, "ok\n" + "y" * 1000, ""):
            with self.subTest(n=len(text)), self.assertRaises(CaptureRefused):
                self.cap(kind="task", text=text)

    def test_provenance_flag(self):
        thought = self.fm(self.cap(kind="thought", text="My own idea."))
        summary_rel = self.cap(kind="talk_summary", text="I checked three sources and found X.")
        self.assertEqual(thought["written_by"], "human")
        self.assertEqual(self.fm(summary_rel)["written_by"], "ai")
        self.assertIn("AI-written summary", (self.root / summary_rel).read_text())
        flags = {r["path"]: r["flags"] for r in Brain(self.vault).search("checked sources")["results"]}
        self.assertIn("ai_written", flags[summary_rel])

    def test_dismiss_flag(self):
        rel = self.cap(kind="talk_summary", text="Buy screws and two planks", dismiss_reason="shopping list\n")
        text = (self.root / rel).read_text()
        self.assertIn("\nrag_dismissed: true\n", text)
        self.assertEqual(self.fm(rel)["dismiss_reason"], "shopping list")
        self.assertIn("dismissed", Brain(self.vault).search("planks")["results"][0]["flags"])


class TestRemoteVectorStore(Base):
    def test_store_adapter_is_fused(self):
        class FakeStore(RemoteVectorStore):
            def __init__(self):
                pass

            def rank(self, query, limit=50):
                return ["raw/2026-01-01-note.md"]
        out = Brain(self.vault, store=FakeStore()).search("welcome staff")
        self.assertEqual(out["mode"], "hybrid")
        self.assertEqual(out["results"][0]["path"], "raw/2026-01-01-note.md")


if __name__ == "__main__":
    unittest.main()
