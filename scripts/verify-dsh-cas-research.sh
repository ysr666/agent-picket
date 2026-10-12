#!/usr/bin/env bash
# Reproduce DSH 0.1.x cross-owner CAS research on actual disposable OS processes.
# Expected RED controls are not a release-pass signal.
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ -z "$(printenv AGENT_PICKET_DSH_HOST || true)" ||
      ! -f "$AGENT_PICKET_DSH_HOST/@deepseek-ai/dsh-settings-file/lib/index.js" ||
      ! -f "$AGENT_PICKET_DSH_HOST/@deepseek-ai/dsh-commands/lib/index.js" ]]; then
  echo "REAL_HOST_REQUIRED: supply an installed legacy DSH 0.1 SettingsFile+Commands SDK" >&2
  exit 2
fi
dir="$(mktemp -d /tmp/ap-cas-research.XXXXXXXX)"
trap 'rm -rf "$dir"' EXIT

research_test() {
  local label="$1" expected="$2" pass="$3" fail="$4"
  shift 4
  set +e
  "$@" >"$dir/$label.log" 2>&1
  local status=$?
  set -e
  if [[ "$expected" == "green" && "$status" != 0 ]] ||
     [[ "$expected" == "red" && "$status" == 0 ]] ||
     ! grep -Eq "^# pass $pass$" "$dir/$label.log" ||
     ! grep -Eq "^# fail $fail$" "$dir/$label.log"; then
    echo "RESEARCH_INCONCLUSIVE=$label status=$status; inspect fixture or SDK" >&2
    tail -90 "$dir/$label.log" >&2
    exit 1
  fi
  echo "RESEARCH_RESULT=$label EXPECTED=$expected PASSED=$pass FAILED=$fail (isolated OS processes)"
}

research_test original red 0 3 \
 env -u AGENT_PICKET_DSH_DISK_CAS_EXPERIMENT -u AGENT_PICKET_DSH_DISK_CAS_CONTENT_ONLY \
 AGENT_PICKET_DSH_MULTIPROCESS_CHECK=1 \
 node --experimental-strip-types --test --test-reporter=tap \
 --test-name-pattern='P0 #111:' tests/dsh-archive-multiprocess.real.test.ts

research_test content_aba red 0 1 \
 env AGENT_PICKET_DSH_DISK_CAS_EXPERIMENT=1 \
 AGENT_PICKET_DSH_DISK_CAS_CONTENT_ONLY=1 \
 node --experimental-strip-types --test --test-reporter=tap \
 --test-name-pattern='UPSTREAM EXPERIMENT ABA' tests/dsh-archive-multiprocess.real.test.ts
if ! grep -Fq "'success' !== 'error'" "$dir/content_aba.log"; then
  echo "RESEARCH_INCONCLUSIVE: content-only ABA did not prove stale authorization success" >&2
  exit 1
fi

research_test durable green 5 0 \
 env -u AGENT_PICKET_DSH_DISK_CAS_CONTENT_ONLY \
 AGENT_PICKET_DSH_DISK_CAS_EXPERIMENT=1 \
 node --experimental-strip-types --test --test-reporter=tap \
 --test-name-pattern='UPSTREAM EXPERIMENT' tests/dsh-archive-multiprocess.real.test.ts

echo "RESEARCH_ONLY: prototype PASS does NOT satisfy official DSH multi-owner release gate."
echo "RELEASE_STATUS=P0_NO_GO (unmodified real Host 0/3; isolated durable-epoch research 5/5)"
