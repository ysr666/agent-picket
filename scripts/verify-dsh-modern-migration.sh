#!/usr/bin/env bash
# Strict per-record migration erasure gate on an installed modern Storage SDK.
# This tests only a storage-layer lifecycle contract, NOT Host consent CAS.
set -euo pipefail
cd "$(dirname "$0")/.."
sdk="$(printenv AGENT_PICKET_MODERN_STORAGE_SDK || true)"
if [[ -z "$sdk" || ! -f "$sdk/@deepseek-ai/dsh-storage-json/lib/index.js" ||
  ! -f "$sdk/@deepseek-ai/dsh-storage-json/package.json" ]]; then
  echo "MODERN_STORAGE_SDK_REQUIRED: set AGENT_PICKET_MODERN_STORAGE_SDK" >&2
  exit 2
fi
version="$(node -p 'require(process.argv[1]).version' "$sdk/@deepseek-ai/dsh-storage-json/package.json")"
log="$(mktemp /tmp/ap-migration-safety.XXXXXXXX)"
trap 'rm -f "$log"' EXIT
set +e
AGENT_PICKET_MODERN_STORAGE_CHECK=1 AGENT_PICKET_MODERN_MIGRATION_GATE=1 \
node --experimental-strip-types --test --test-reporter=tap \
 --test-name-pattern='MODERN MIGRATION SAFETY:' \
 tests/dsh-storage-json-multiowner.real.test.ts >"$log" 2>&1
status=$?
set -e
if [[ "$status" != 0 ]];then
 echo "MIGRATION_ERASURE_NO_GO: modern DSH storage version $version failed retained-legacy-file erasure guarantee" >&2
 grep -E '^not ok|^# (tests|pass|fail)|MIGRATION_ERASURE_NO_GO' "$log" >&2 || true
 exit 1
fi
if ! grep -Eq '^# pass 1$' "$log" || ! grep -Eq '^# fail 0$' "$log";then
 echo "MIGRATION_ERASURE_NO_GO: a SKIP or missing real SDK cannot satisfy erasure safety" >&2
 exit 1
fi
echo "MIGRATION_ERASURE_PASS=1 SDK=$version (only this storage-layer gate, not overall Host CAS)"
