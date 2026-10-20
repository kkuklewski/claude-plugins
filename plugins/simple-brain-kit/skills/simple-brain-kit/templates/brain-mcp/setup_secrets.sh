#!/usr/bin/env bash
# Create .env from env.example with fresh secrets: a read key, and (with --capture) a capture key
# and a random capture path.
#
# Re-running does NOT rotate existing secrets unless you pass --rotate. Rotating breaks every
# connector that is already added: remove and re-add it with the new URL and key afterwards.
#
# Usage: ./setup_secrets.sh [--capture] [--rotate]
set -euo pipefail
cd "$(dirname "$0")"
CAPTURE=0; ROTATE=0
for a in "$@"; do case "$a" in --capture) CAPTURE=1;; --rotate) ROTATE=1;; *) echo "unknown: $a"; exit 2;; esac; done

rand() { python3 -c "import secrets,sys; print(secrets.token_hex(int(sys.argv[1])))" "$1"; }
get() { grep -E "^$1=" .env | head -1 | cut -d= -f2- | sed 's/[[:space:]]*#.*$//'; }
put() { python3 - "$1" "$2" <<'PY'
import re, sys
k, v = sys.argv[1], sys.argv[2]
s = open(".env").read()
s = re.sub(rf"^#?\s*{k}=.*$", f"{k}={v}", s, count=1, flags=re.M) if re.search(rf"^#?\s*{k}=", s, re.M) else s + f"{k}={v}\n"
open(".env", "w").write(s)
PY
}

[ -f .env ] || { cp env.example .env; chmod 600 .env; echo "created .env from env.example"; }

if [ -n "$(get BRAIN_READ_KEY)" ] && [ $ROTATE = 0 ]; then
  echo "BRAIN_READ_KEY already set: kept. (--rotate replaces it and breaks connectors already added.)"
else
  put BRAIN_READ_KEY "$(rand 32)"; echo "BRAIN_READ_KEY: new"
fi

if [ $CAPTURE = 1 ]; then
  if [ -n "$(get BRAIN_CAPTURE_KEY)" ] && [ $ROTATE = 0 ]; then
    echo "capture secrets already set: kept. (--rotate replaces them and breaks the capture connector.)"
  else
    put BRAIN_CAPTURE_PATH "/capture-$(rand 16)"; put BRAIN_CAPTURE_KEY "$(rand 32)"
    echo "BRAIN_CAPTURE_PATH and BRAIN_CAPTURE_KEY: new"
  fi
fi

mkdir -p data
echo
echo "Secrets live in .env only (mode 600). Read them from there when you add the connectors;"
echo "they are not printed here so they do not end up in terminal scrollback or logs."
