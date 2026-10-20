#!/usr/bin/env bash
# Checks the kit's templates and runs the brain-mcp tests.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SKILL="$HERE/../skills/simple-brain-kit"
VAULT="$SKILL/templates/vault"
MCP="$SKILL/templates/brain-mcp"
fail=0
ok(){ echo "ok   $1"; }
bad(){ echo "FAIL $1"; fail=1; }

# 1. Every decision starts switched off.
for f in "$VAULT"/decisions/*.md; do
  grep -qE '^status: proposed( |$)' "$f" && ok "proposed: $(basename "$f")" || bad "not proposed: $(basename "$f")"
done

# 2. Every nightly playbook carries the query-hygiene rule and points at the run rules.
for p in curate verify-and-resolve inspire; do
  f="$VAULT/ops/playbooks/$p.md"
  grep -q '^## Query hygiene' "$f" && grep -q '_run-rules.md' "$f" && ok "playbook $p" || bad "playbook $p lacks query hygiene or run rules"
done
grep -q 'Never force-push' "$VAULT/ops/playbooks/_run-rules.md" && grep -q 'Never stage' "$VAULT/ops/playbooks/_run-rules.md" \
  && ok "run rules: no force-push, no dirty staging" || bad "run rules incomplete"

# 3. No private data in what ships: IP addresses (except loopback/any), home paths, e-mail addresses, tailnet names.
LEAKS=$(grep -rnIE '\b([0-9]{1,3}\.){3}[0-9]{1,3}\b|/Users/|/home/[a-z]|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}|\.ts\.net' "$SKILL" \
  | grep -vE '\b(127\.0\.0\.1|0\.0\.0\.0)\b' || true)
[ -z "$LEAKS" ] && ok "no private markers in templates" || { bad "private markers:"; echo "$LEAKS" | head -5; }

# 4. brain-mcp unit tests (standard library; server tests skip without mcp/httpx).
OUT=$(cd "$MCP" && python3 -I -B -m unittest discover -s tests 2>&1); RC=$?
[ $RC = 0 ] && ok "brain-mcp tests: $(echo "$OUT" | grep -E '^(OK|Ran)' | tr '\n' ' ')" || { bad "brain-mcp tests"; echo "$OUT" | tail -20; }

# 5. setup_secrets.sh keeps secrets on re-run and rotates only with --rotate.
T=$(mktemp -d); cp "$MCP/env.example" "$MCP/setup_secrets.sh" "$T/"
( cd "$T" && ./setup_secrets.sh --capture >/dev/null && A=$(grep '^BRAIN_CAPTURE_KEY=' .env) \
  && ./setup_secrets.sh --capture >/dev/null && [ "$A" = "$(grep '^BRAIN_CAPTURE_KEY=' .env)" ] \
  && ./setup_secrets.sh --capture --rotate >/dev/null && [ "$A" != "$(grep '^BRAIN_CAPTURE_KEY=' .env)" ] \
  && [ -n "${A#BRAIN_CAPTURE_KEY=}" ] ) && ok "secrets: kept on re-run, rotated only with --rotate" || bad "setup_secrets.sh"
rm -rf "$T"

# 6. sync.sh commits only new captures and never touches other dirty files.
T=$(mktemp -d)
(
  set -e; cd "$T"; git init -q --bare remote.git; git clone -q remote.git v 2>/dev/null; cd v
  git config user.email t@t; git config user.name t
  mkdir -p inbox/captures; touch inbox/captures/.gitkeep; echo x > other.md; git add .; git commit -qm init; git push -q origin HEAD 2>/dev/null
  echo cap > inbox/captures/2026-01-01-a.md; echo y > stray.md
  bash "$MCP/sync.sh" . >/dev/null 2>&1
  [ "$(git log -1 --name-only --format=)" = "inbox/captures/2026-01-01-a.md" ]
  git status --porcelain | grep -q '^?? stray.md'
  [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/HEAD 2>/dev/null || git ls-remote origin HEAD | cut -f1)" ]
) && ok "sync.sh: commits new captures only, pushes" || bad "sync.sh"
rm -rf "$T"

exit $fail
