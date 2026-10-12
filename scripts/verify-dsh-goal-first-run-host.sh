#!/usr/bin/env bash
# Isolated REAL DSH Web Host first-run double-owner Settings CAS acceptance.
# Never operates on the default DSH profile. Installs to mkdtemp DSH_HOME.
set -euo pipefail
cd "$(dirname "$0")/.."
bin="${AGENT_PICKET_DSH_BIN:-}"
if [[ -z "$bin" || ! -x "$bin" ]]; then
  echo 'Set AGENT_PICKET_DSH_BIN to an isolated official DSH executable' >&2
  exit 2
fi
version="$($bin --version 2>/dev/null || true)"
if [[ "$version" != 0.2.* ]]; then
  echo "Review Host first-run contract before running on $version" >&2
  exit 2
fi
report="$(mktemp /tmp/ap-real-first-run-host.XXXXXXXX)"
trap 'rm -f "$report"' EXIT
if ! AGENT_PICKET_MODERN_HOST_MULTI_OWNER=1 \
  node --experimental-strip-types --test --test-reporter=tap \
  --test-name-pattern='MODERN HOST #1.0:' \
  tests/dsh-modern-settings-multiowner.real.test.ts > "$report" 2>&1; then
  tail -90 "$report" >&2
  exit 1
fi
if ! grep -Eq '^# pass 1$' "$report" || ! grep -Eq '^# fail 0$' "$report"; then
  tail -90 "$report" >&2
  exit 1
fi
echo "REAL_DSH_FIRST_RUN_HOST_CONSENT_PASS=1 VERSION=$version"
echo 'Scope: atomic two-field consent, stale cross-Host writer, invalid-batch rollback, revocation and cold restart'
echo 'Remaining: real welcome UI warning/button, user accessibility signoff, complete 1.0 matrix'
