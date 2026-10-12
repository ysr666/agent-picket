#!/usr/bin/env bash
# Strict real-Host P0 #111 safety gate.
# Runs 3 independent OS-process integrity assertions on disposable config.
# Their existing FAIL results are release-blocking, not expected-green tests.
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ -z "$(printenv AGENT_PICKET_DSH_HOST || true)" ||
      ! -f "$AGENT_PICKET_DSH_HOST/@deepseek-ai/dsh-settings-file/lib/index.js" ||
      ! -f "$AGENT_PICKET_DSH_HOST/@deepseek-ai/dsh-commands/lib/index.js" ]]; then
  echo "REAL_HOST_REQUIRED: set AGENT_PICKET_DSH_HOST to genuine DSH 0.1.x SDK" >&2
  exit 2
fi
# NEVER let a test-only prototype masquerade as safety in the real release.
unset AGENT_PICKET_DSH_DISK_CAS_EXPERIMENT AGENT_PICKET_DSH_DISK_CAS_CONTENT_ONLY
log="$(mktemp /tmp/ap-multiowner-gate.XXXXXXXX)"
trap 'rm -f "$log"' EXIT
set +e
AGENT_PICKET_DSH_MULTIPROCESS_CHECK=1 \
  node --experimental-strip-types --test --test-reporter=tap \
  --test-name-pattern='P0 #111:' \
  tests/dsh-archive-multiprocess.real.test.ts >"$log" 2>&1
status=$?
set -e
cat "$log"
if [[ "$status" -ne 0 ]]; then
  echo "P0_NO_GO: independent DSH Host owners failed cross-process integrity. DO NOT RELEASE." >&2
  exit 1
fi
if ! grep -Eq '^# pass 3$' "$log" || ! grep -Eq '^# fail 0$' "$log"; then
  echo "P0_NO_GO: incomplete or skipped cross-owner evidence cannot pass the gate." >&2
  exit 1
fi
echo "P0_CROSS_OWNER_PASS=3 (verify the tested official SDK version and human release criteria separately)"
