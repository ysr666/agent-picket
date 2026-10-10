#!/usr/bin/env bash
# Optional real-browser AX/rights acceptance for locally installed DSH.
# Never upgrades DSH, changes a production Profile, or sends model requests.
set -uo pipefail

: "${AGENT_PICKET_DSH_BIN:?Use an isolated DSH executable}"
: "${AGENT_PICKET_DSH_HOST:?Use the isolated DSH installation node_modules}"
: "${AGENT_PICKET_PLAYWRIGHT_ENTRY:?Use installed playwright-core}"
: "${AGENT_PICKET_CHROME_BIN:?Use installed Chrome}"
root="$(cd "$(dirname "$0")/.." && pwd)"
version="$("$AGENT_PICKET_DSH_BIN" --version)"
case "$version" in
  0.1.*|0.2.*) ;;
  *) echo "Unreviewed DSH version $version" >&2; exit 2 ;;
esac
proof="$(mktemp -d "${TMPDIR:-/tmp}/picket-rights-ax-XXXXXXXX")"
echo "DSH=$version"
echo "Evidence (local only): $proof"

if [[ "$version" == 0.1.* ]]; then
  (cd "$root" && node --experimental-strip-types --test \
    tests/dsh-rights-browser.real.test.ts) > "$proof/legacy-real-ax.log" 2>&1
  rc=$?
  echo "LEGACY_DSH_RESULT=$rc"
  exit "$rc"
fi

# DSH 0.2 needs an officially installed Web Profile for a writable Host
# settings namespace. --patch alone can expose the sidebar yet withhold the
# actual consent writer. Do not spoof or inject Host settings in this test.
(cd "$root" && npm run build) > "$proof/build.log" 2>&1 || {
  echo "FAIL stage=build"; exit 1;
}
mkdir "$proof/pack"
tarball="$(cd "$root" && npm pack --ignore-scripts --pack-destination "$proof/pack" --silent)"
test -n "$tarball" && test -f "$proof/pack/$tarball" || {
  echo "FAIL stage=package"; exit 1;
}
pass=0; fail=0
for flavor in source installed; do
  # Each run is independent even if the previous run changed Host consent.
  profile="$(mktemp -d "${TMPDIR:-/tmp}/picket-rights-web-profile-XXXXXXXX")"
  if ! DSH_HOME="$profile" "$AGENT_PICKET_DSH_BIN" plugin --profile web add \
    "$proof/pack/$tarball" > "$proof/install-$flavor.log" 2>&1; then
    echo "FLAVOR=$flavor FAIL stage=official-dsh-plugin-install"
    ((fail+=1))
    continue
  fi
  pattern='real Chrome: source'
  if [[ "$flavor" == installed ]]; then
    pattern='real Chrome: OFFLINE INSTALLED'
  fi
  # source=local source-built compiled artifact loaded by official DSH,
  # installed=additional offline npm installation validation by the test.
  if (cd "$root" && PICKET_TEST_DSH_HOME="$profile" \
    node --experimental-strip-types --test \
    --test-name-pattern="$pattern" \
    tests/dsh-rights-browser.real.test.ts) > "$proof/web-$flavor.log" 2>&1; then
    echo "FLAVOR=$flavor PASS stage=real-chrome-rights-and-ax"
    ((pass+=1))
  else
    echo "FLAVOR=$flavor FAIL stage=real-chrome-rights-and-ax"
    ((fail+=1))
  fi
done
echo "FINAL_DSH=$version PASS=$pass FAIL=$fail TOTAL=2"
if (( fail > 0 || pass != 2 )); then exit 1; fi
