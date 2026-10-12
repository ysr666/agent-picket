#!/usr/bin/env bash
# Explicit, real-Host disk acceptance. Fail when no real SDK is installed;
# unlike generic check, never silently mark all tests SKIP.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -z "$(printenv AGENT_PICKET_DSH_HOST || true)" ]]; then
  echo "REAL_HOST_REQUIRED: set AGENT_PICKET_DSH_HOST to the installed DSH 0.1.x node_modules directory." >&2
  exit 2
fi
if [[ ! -f "$AGENT_PICKET_DSH_HOST/@deepseek-ai/dsh-settings-file/lib/index.js" ||
      ! -f "$AGENT_PICKET_DSH_HOST/@deepseek-ai/dsh-commands/lib/index.js" ]]; then
  echo "REAL_HOST_REQUIRED: genuine DSH SettingsFile and Commands modules not found." >&2
  exit 2
fi

# Known RED multi-owner integrity probes (#111) are a distinct release gate.
unset AGENT_PICKET_DSH_MULTIPROCESS_CHECK AGENT_PICKET_DSH_CROSS_OWNER_CHECK
log="$(mktemp /tmp/ap-host-archive-acceptance.XXXXXXXX)"
trap 'rm -f "$log"' EXIT
node --experimental-strip-types --test --test-reporter=tap \
  tests/dsh-archive-restart.real.test.ts \
  tests/dsh-archive-multiprocess.real.test.ts >"$log" 2>&1 || {
    cat "$log"
    exit 1
  }
cat "$log"
if ! grep -Eq '^# pass 2$' "$log" || ! grep -Eq '^# fail 0$' "$log"; then
  echo "REAL_HOST_INCOMPLETE: expected both actual-disk acceptance cases to PASS; SKIP is insufficient." >&2
  exit 1
fi
echo "REAL_HOST_ARCHIVES_PASS=2 FAIL=0 (independent-owner P0 #111 remains separately RED)"
