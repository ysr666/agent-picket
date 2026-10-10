#!/usr/bin/env bash
# Opt-in, genuine DSH keyboard-only browser qualification.
# All DSH profiles are newly created and disposable; never replay a command.
set -uo pipefail

: "${AGENT_PICKET_DSH_BIN:?Point to an authorized, installed DSH executable}"
: "${AGENT_PICKET_DSH_HOST:?Point to the DSH installation node_modules}"
: "${AGENT_PICKET_PLAYWRIGHT_ENTRY:?Point to a local playwright-core entrypoint}"
: "${AGENT_PICKET_CHROME_BIN:?Point to an installed Chrome executable}"

runs="${PICKET_DSH_MATRIX_RUNS:-4}"
if ! [[ "$runs" =~ ^[1-9][0-9]*$ ]] || (( runs > 16 )); then
  echo 'PICKET_DSH_MATRIX_RUNS must be an integer from 1 to 16' >&2
  exit 2
fi
root="$(cd "$(dirname "$0")/.." && pwd)"
bin="$AGENT_PICKET_DSH_BIN"
version="$("$bin" --version)"
case "$version" in
  0.1.*|0.2.*) ;;
  *) echo "Unreviewed DSH version: $version" >&2; exit 2 ;;
esac
runroot="$(mktemp -d "${TMPDIR:-/tmp}/picket-keyboard-matrix-XXXXXXXX")"
pack_dir="$runroot/pack"
mkdir -p "$pack_dir"
pack_file="$(cd "$root" && npm pack --ignore-scripts --pack-destination "$pack_dir" --silent)"
if [[ -z "$pack_file" || ! -f "$pack_dir/$pack_file" ]]; then
  echo 'Unable to pack the private local Agent Picket candidate' >&2
  exit 2
fi

export PICKET_RUN_DSH_KEYBOARD_E2E=1
pass=0
fail=0
echo "DSH keyboard-only matrix: version=$version requested=$runs"
echo "Evidence directory: $runroot"
for (( i=1; i<=runs; i++ )); do
  profile="$(mktemp -d "${TMPDIR:-/tmp}/picket-dsh-profile-XXXXXXXX")"
  install_log="$runroot/install-$i.log"
  run_log="$runroot/keyboard-$i.log"

  if ! DSH_HOME="$profile" "$bin" plugin --profile web add "$pack_dir/$pack_file" >"$install_log" 2>&1; then
    ((fail+=1))
    echo "RUN=$i FAIL stage=official-plugin-install"
    continue
  fi

  # The real Chrome test launches this installed profile with no API keys,
  # blocks external HTTP(S), types /union, selects via ArrowDown+Enter,
  # asserts the native claimed phase, then submits exactly once.
  if (cd "$root" && PICKET_TEST_017_HOME="$profile" \
      node --experimental-strip-types --test \
      --test-name-pattern='KEYBOARD slash-menu' \
      tests/dsh-union-composer-sidebar.real.test.ts) >"$run_log" 2>&1; then
    ((pass+=1))
    echo "RUN=$i PASS stage=keyboard-Composer-to-Host"
  else
    ((fail+=1))
    echo "RUN=$i FAIL stage=keyboard-Composer-to-Host"
    # Do not print the complete browser log, which may contain application
    # state; bounded failure logs remain local for authorized review.
  fi
done
echo "FINAL DSH=$version PASSED=$pass FAILED=$fail TOTAL=$runs"
if (( fail > 0 )); then
  echo 'NO-GO: at least one independent real keyboard-only run failed' >&2
  exit 1
fi
