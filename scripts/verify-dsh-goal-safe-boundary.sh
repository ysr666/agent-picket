#!/usr/bin/env bash
# Real isolated DSH Goal work-boundary tests, never touching personal DSH_HOME.
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ -z "${AGENT_PICKET_DSH_BIN:-}" || ! -x "$AGENT_PICKET_DSH_BIN" ||
      -z "${AGENT_PICKET_DSH_HOST:-}" || ! -d "$AGENT_PICKET_DSH_HOST" ]];then
  echo 'Set AGENT_PICKET_DSH_BIN and AGENT_PICKET_DSH_HOST to an isolated official DSH installation' >&2
  exit 2
fi
version="$($AGENT_PICKET_DSH_BIN --version 2>/dev/null || true)"
if [[ "$version" != 0.2.* ]];then
  echo "Unreviewed DSH version: $version" >&2
  exit 2
fi
log="$(mktemp /tmp/ap-goal-host-e2e.XXXXXXXX)"
trap 'rm -f "$log"' EXIT
for mode in normal threshold below concurrent;do
  case "$mode" in
    normal) expected=2; ledger=0; below=0; multi=0;;
    threshold) expected=1; ledger=1; below=0; multi=0;;
    below) expected=1; ledger=1; below=1; multi=0;;
    concurrent) expected=1; ledger=0; below=0; multi=1;;
  esac
  if ! AGENT_PICKET_GOAL_BOUNDARY_NATIVE=1 \
      AGENT_PICKET_LEDGER_E2E="$ledger" AGENT_PICKET_LEDGER_BELOW="$below" \
      AGENT_PICKET_GOAL_MULTI_SESSION="$multi" \
      node --experimental-strip-types --test --test-reporter=tap \
      tests/dsh-goal-boundary.real.test.ts >"$log" 2>&1;then
    echo "DSH_GOAL_REAL_E2E_FAIL: $mode $version" >&2
    tail -85 "$log" >&2
    exit 1
  fi
  if ! grep -Eq "^# pass $expected$" "$log" ||
     ! grep -Eq '^# fail 0$' "$log";then
    echo "DSH_GOAL_REAL_E2E_INCOMPLETE: $mode $version" >&2
    tail -85 "$log" >&2
    exit 1
  fi
  echo "DSH_GOAL_REAL_E2E_PASS=1 VERSION=$version MODE=$mode PASS=$expected"
done
printf 'SCOPE=official_goal_block_resume_cold_restart_durable_utc_day_threshold_strict_below_threshold_multi_session\n'
printf 'NOTE=work timestamps/permissions are synthetic in E2E; installed user UI and other platforms require separate acceptance\n'
