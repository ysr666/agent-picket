#!/usr/bin/env bash
# Strict REAL modern DSH SettingsForms dual-OS-process test. Unlike raw KV
# storage research, this runs official plugin-install and authenticated Host
# settings/describe + settings/mutate. All filesystem activity is temporary.
set -euo pipefail
cd "$(dirname "$0")/.."
bin="$(printenv AGENT_PICKET_DSH_BIN || true)"
if [[ -z "$bin" || ! -x "$bin" ]];then
 echo "REAL_MODERN_DSH_REQUIRED: set AGENT_PICKET_DSH_BIN to a real isolated DSH 0.1.7+/0.2 executable" >&2
 exit 2
fi
version="$("$bin" --version 2>/dev/null || true)"
if [[ "$version" != 0.1.7* && "$version" != 0.2.* ]];then
 echo "UNREVIEWED_DSH_LAYOUT: this modern Host SettingsForms test requires official 0.1.7 or 0.2.x, found $version" >&2
 exit 2
fi
log="$(mktemp /tmp/ap-modern-host-twoowners.XXXXXXXX)"
trap 'rm -f "$log"' EXIT
set +e
AGENT_PICKET_MODERN_HOST_MULTI_OWNER=1 \
 node --experimental-strip-types --test --test-reporter=tap \
 --test-name-pattern='MODERN HOST #111:' \
 tests/dsh-modern-settings-multiowner.real.test.ts >"$log" 2>&1
status=$?
set -e
if [[ "$status" != 0 ]] || ! grep -Eq '^# pass 1$' "$log" ||
  ! grep -Eq '^# fail 0$' "$log";then
 echo "MODERN_HOST_NO_GO: two genuine Host SettingsForms owners did not pass all integrity assertions for DSH $version" >&2
 tail -95 "$log" >&2
 exit 1
fi
echo "MODERN_HOST_TWO_PROCESS_SETTINGS_PASS=1 SDK=$version"
echo "SCOPE=official_settings_conflict_aba_consent_revoke_case_erasure_simultaneous_writes_cold_restart"
echo "NOTE=This does not pass the separate modern KV migration deletion gate or the old 0.1.2 Host gate."
