"""HTTP-level tests for server.py. Skipped when the MCP SDK (and httpx) are not installed."""
import importlib
import os
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE))

try:
    import httpx  # noqa: F401
    import mcp  # noqa: F401
    from starlette.testclient import TestClient
except ImportError:  # pragma: no cover
    TestClient = None

from test_core import make_vault, set_status  # noqa: E402

READ_KEY = "r" * 32
CAPTURE_KEY = "c" * 32
CAPTURE_PATH = "/capture-0123456789abcdef"
HEADERS = {"accept": "application/json, text/event-stream", "content-type": "application/json"}


def rpc(method, params=None, id_=1):
    return {"jsonrpc": "2.0", "id": id_, "method": method, "params": params or {}}


@unittest.skipIf(TestClient is None, "mcp/httpx not installed")
class TestServer(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.root = make_vault(Path(cls.tmp.name) / "vault")
        os.environ.update(BRAIN_VAULT=str(cls.root), BRAIN_READ_KEY=READ_KEY, BRAIN_CAPTURE_PATH=CAPTURE_PATH,
                          BRAIN_CAPTURE_KEY=CAPTURE_KEY, BRAIN_INDEX_DIR=str(Path(cls.tmp.name) / "idx"),
                          BRAIN_EXCLUDE="private")
        sys.modules.pop("server", None)
        cls.server = importlib.import_module("server")
        cls.client = TestClient(cls.server.app)
        cls.client.__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.client.__exit__(None, None, None)
        cls.tmp.cleanup()

    def post(self, path, body, key):
        h = dict(HEADERS)
        if key:
            h["x-api-key"] = key
        return self.client.post(path, json=body, headers=h)

    def tools(self, path, key):
        r = self.post(path, rpc("tools/list"), key)
        self.assertEqual(r.status_code, 200, r.text)
        return sorted(t["name"] for t in r.json()["result"]["tools"])

    def call(self, path, key, name, args):
        r = self.post(path, rpc("tools/call", {"name": name, "arguments": args}), key)
        self.assertEqual(r.status_code, 200, r.text)
        return r.json()["result"]

    def test_keys_required(self):
        self.assertEqual(self.post("/mcp", rpc("tools/list"), None).status_code, 401)
        self.assertEqual(self.post("/mcp", rpc("tools/list"), CAPTURE_KEY).status_code, 401)
        self.assertEqual(self.post(CAPTURE_PATH + "/mcp", rpc("tools/list"), READ_KEY).status_code, 401)
        self.assertEqual(self.client.get("/healthz").text, "ok")

    def test_endpoints_are_separate(self):
        self.assertEqual(self.tools("/mcp", READ_KEY),
                         ["last_run", "overview", "read", "recent", "search", "topics"])
        self.assertEqual(self.tools(CAPTURE_PATH + "/mcp", CAPTURE_KEY), ["capture"])

    def test_read_tools(self):
        res = self.call("/mcp", READ_KEY, "search", {"query": "pricing"})
        self.assertIn("topics/pricing.md", str(res))
        self.assertNotIn("secret-plan", str(res))
        res = self.call("/mcp", READ_KEY, "read", {"path": "../../etc/passwd"})
        self.assertIn("refused", str(res))

    def test_capture_switch(self):
        set_status(self.root, "proposed")
        res = self.call(CAPTURE_PATH + "/mcp", CAPTURE_KEY, "capture", {"kind": "thought", "text": "hi"})
        self.assertIn("not saved", str(res))
        set_status(self.root, "active")
        res = self.call(CAPTURE_PATH + "/mcp", CAPTURE_KEY, "capture", {"kind": "thought", "text": "hi"})
        self.assertIn("saved: inbox/captures/", str(res))
        set_status(self.root, "proposed")

    def test_review_hides_note_from_recent(self):
        set_status(self.root, "active")
        res = self.call(CAPTURE_PATH + "/mcp", CAPTURE_KEY, "capture",
                        {"kind": "review", "target": "topics/pricing.md", "verdict": "read"})
        self.assertIn("saved: inbox/captures/", str(res))
        self.server.brain.refresh(force=True)
        res = str(self.call("/mcp", READ_KEY, "recent", {"days": 3650}))
        self.assertNotIn("topics/pricing.md", res)
        self.assertIn("topics/pricing.md", str(self.call("/mcp", READ_KEY, "recent", {"days": 3650, "include_read": True})))
        set_status(self.root, "proposed")


if __name__ == "__main__":
    unittest.main()
