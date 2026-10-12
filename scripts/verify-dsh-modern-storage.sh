#!/usr/bin/env bash
# Research only. Raw KV backend observations != Host SettingsForms CAS proof.
set -euo pipefail
cd "$(dirname "$0")/.."
sdk="$(printenv AGENT_PICKET_MODERN_STORAGE_SDK || true)"
if [[ -z "$sdk" || ! -f "$sdk/@deepseek-ai/dsh-storage-json/lib/index.js" ||
  ! -f "$sdk/@deepseek-ai/dsh-storage-json/package.json" ]]; then
  echo "MODERN_STORAGE_SDK_REQUIRED: set AGENT_PICKET_MODERN_STORAGE_SDK to actual SDK node_modules" >&2
  exit 2
fi
version="$(node -p 'require(process.argv[1]).version' "$sdk/@deepseek-ai/dsh-storage-json/package.json")"
log="$(mktemp /tmp/ap-storage-crossowner.XXXXXXXX)"
trap 'rm -f "$log"' EXIT
set +e
AGENT_PICKET_MODERN_STORAGE_CHECK=1 node --experimental-strip-types --test --test-reporter=tap \
  tests/dsh-storage-json-multiowner.real.test.ts >"$log" 2>&1
status=$?
set -e
if [[ "$status" != 0 ]] || ! grep -Eq '^# pass 5$' "$log" ||
  ! grep -Eq '^# fail 0$' "$log"; then
  echo "STORAGE_RESEARCH_INCONCLUSIVE: SDK failed controlled observations" >&2
  cat "$log" >&2
  exit 1
fi
for expected in \
  'MODERN STORAGE single: unrelated old-owner upsert resurrects an erased record' \
  'MODERN STORAGE single: unrelated old-owner upsert restores prior consent record' \
  'MODERN STORAGE per-record: unrelated upsert preserves other key erasure' \
  'MODERN STORAGE per-record: same-key old-owner write can recreate deleted record' \
  'MODERN STORAGE migrated legacy single-unit file can re-seed deleted last per-record entry'; do
  if ! grep -Fq "$expected" "$log";then
    echo "STORAGE_RESEARCH_INCONCLUSIVE: missing named two-process observation" >&2
    exit 1
  fi
done
echo "MODERN_STORAGE_SDK_VERSION=$version"
echo "REAL_OS_PROCESS_STORAGE_OBSERVATIONS=5/5"
echo "SINGLE_LAYOUT=LAST_WRITE_WINS_ERASURE_AND_VALUE_REVERSION_OBSERVED"
echo "PER_RECORD_LAYOUT=UNRELATED_KEYS_ISOLATED_BUT_SAME_KEY_WRITES_UNFENCED"
echo "LEGACY_MIGRATION=ERASED_LAST_NEW_RECORD_REIMPORTED_FROM_RETAINED_OLD_FILE"
echo "HOST_SETTINGS_CAS=NOT_TESTED"
echo "RESEARCH_ONLY; NEVER claim Agent Picket multi-Host safety from raw KV observations."
