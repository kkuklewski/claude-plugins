"""Task-tracker adapters for capture_tasks.py.

An adapter is two calls:
    find(marker, hint) -> task id or None   # look for a task whose description contains `marker`
    create(title, details, marker) -> id    # create one task; put `marker` in its description

The marker ("Capture: inbox/captures/<file>") lets a rerun recover from a crash between create and
write-back without creating a duplicate. Pick one with BRAIN_TRACKER=vikunja|jira|linear|github.
Vikunja is the worked example; the others are stubs with the endpoints to call. Replacing the
tracker never changes the vault: captures only ever get `tracker_task` and `processed_at`.
"""
from __future__ import annotations

import html
import json
import os
import urllib.parse
import urllib.request


class TrackerNotConfigured(Exception):
    """Missing settings: the job skips (exit 0) instead of failing."""


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def _http(method: str, url: str, token: str, body=None, timeout: float = 20.0):
    req = urllib.request.Request(url, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:  # noqa: S310 (URL is operator config)
        return json.load(r)


class Vikunja:
    """VIKUNJA_URL (https://tasks.example.org), VIKUNJA_TOKEN (API token: tasks create + read),
    VIKUNJA_PROJECT_ID. New tasks land in the project's default bucket."""

    name = "vikunja"

    def __init__(self):
        self.url, self.token, self.project = _env("VIKUNJA_URL").rstrip("/"), _env("VIKUNJA_TOKEN"), _env("VIKUNJA_PROJECT_ID")
        if not (self.url and self.token and self.project.isdigit()):
            raise TrackerNotConfigured("VIKUNJA_URL, VIKUNJA_TOKEN and VIKUNJA_PROJECT_ID are required")

    def find(self, marker: str, hint: str) -> str | None:
        q = urllib.parse.urlencode({"s": hint, "per_page": 50})
        for t in _http("GET", f"{self.url}/api/v1/projects/{self.project}/tasks?{q}", self.token) or []:
            if html.escape(marker) in (t.get("description") or "") or marker in (t.get("description") or ""):
                return str(t["id"])
        return None

    def create(self, title: str, details: list[str], marker: str) -> str:
        desc = "".join(f"<p>{html.escape(line)}</p>" for line in details + [marker])
        t = _http("PUT", f"{self.url}/api/v1/projects/{self.project}/tasks", self.token,
                  {"title": title, "description": desc})
        return str(t["id"])


class Jira:
    """Stub. JIRA_URL, JIRA_EMAIL + JIRA_API_TOKEN (basic auth), JIRA_PROJECT_KEY.
    find:   GET  /rest/api/3/search/jql?jql=project=<KEY> AND text ~ "\\"<marker>\\""
    create: POST /rest/api/3/issue {"fields": {"project": {"key": KEY}, "summary": title,
            "issuetype": {"name": "Task"}, "description": <Atlassian Document Format with marker>}}
    Return the issue key (e.g. "OPS-12") as the id."""

    name = "jira"

    def __init__(self):
        raise TrackerNotConfigured("the Jira adapter is a stub: implement find/create (see docstring)")


class Linear:
    """Stub. LINEAR_API_KEY, LINEAR_TEAM_ID. GraphQL at https://api.linear.app/graphql.
    find:   query { issues(filter: {description: {contains: "<marker>"}}) { nodes { identifier } } }
    create: mutation { issueCreate(input: {teamId, title, description}) { issue { identifier } } }
    Return the identifier (e.g. "ENG-42") as the id."""

    name = "linear"

    def __init__(self):
        raise TrackerNotConfigured("the Linear adapter is a stub: implement find/create (see docstring)")


class GitHubIssues:
    """Stub. GITHUB_TOKEN (fine-grained: issues read/write on one repository), GITHUB_REPO ("owner/repo").
    find:   GET  /search/issues?q=repo:<owner/repo> in:body "<marker>"
    create: POST /repos/<owner/repo>/issues {"title", "body": details + marker}
    Return the issue number as the id. Mind that issues in a public repository are public."""

    name = "github"

    def __init__(self):
        raise TrackerNotConfigured("the GitHub Issues adapter is a stub: implement find/create (see docstring)")


ADAPTERS = {"vikunja": Vikunja, "jira": Jira, "linear": Linear, "github": GitHubIssues}


def get_tracker(name: str | None = None):
    name = (name or _env("BRAIN_TRACKER")).lower()
    if not name or name == "none":
        raise TrackerNotConfigured("BRAIN_TRACKER is not set")
    if name not in ADAPTERS:
        raise TrackerNotConfigured(f"unknown tracker {name!r}; one of {', '.join(ADAPTERS)}")
    return ADAPTERS[name]()
