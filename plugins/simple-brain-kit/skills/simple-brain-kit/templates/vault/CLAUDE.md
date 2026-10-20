# Brain vault

The rules for every agent working in this vault are in AGENTS.md (lanes, write boundaries, page
conventions). Claude Code loads it through the import below; other agents read AGENTS.md directly.

@AGENTS.md

Before any nightly run: read the playbook in `ops/playbooks/` that the run names, and the decision
record it depends on. If that record does not say `status: active`, log `skipped` and stop.
