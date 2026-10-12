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
  # Version numbering alone cannot identify the SDK architecture:
  # 0.1.2 provides the legacy SettingsFile owner; official 0.1.7-rc.2
  # switched to dsh-storage-json/config and must NOT be silently treated as
  # if it had the same consent/write infrastructure. Failing closed is
  # better than misreporting legacy E2E as a later-Host pass.
  if [[ ! -f "$AGENT_PICKET_DSH_HOST/@deepseek-ai/dsh-settings-file/lib/index.js" ]]; then
    echo "UNREVIEWED_DSH_SETTINGS_LAYOUT: DSH $version has no legacy SettingsFile SDK; this test cannot claim modern Host support." >&2
    exit 2
  fi
  (cd "$root" && node --experimental-strip-types --test \
    tests/dsh-rights-browser.real.test.ts) > "$proof/legacy-real-ax.log" 2>&1
  rc=$?
  echo "LEGACY_DSH_RESULT=$rc"
  exit "$rc"
fi

# A real DSH 0.2 CommandRuntime is exercised with an isolated, strict
# Config-validated Host-settings stand-in. The full genuine DSH 0.2 Host
# settings API is separately covered by the Chrome tests below: neither
# source may be substituted for the other in release claims.
if (cd "$root" && AGENT_PICKET_TEST_DSH_VERSION="$version" \
    node --experimental-strip-types --test \
    tests/dsh-command-runtime-02.real.test.ts) > "$proof/real-commands-02.log" 2>&1; then
  echo "DSH02_COMMAND_RUNTIME=PASS stage=real-commands-with-isolated-settings"
else
  echo "DSH02_COMMAND_RUNTIME=FAIL stage=real-commands-with-isolated-settings"
  exit 1
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
  # Explicitly opt-in acceptance mode: install the audited, test-only OFFLINE
  # LLM adapter into a throwaway official Web Profile. Not shipped in npm;
  # no API keys, network connection or model billing.
  if [[ "${PICKET_DIGNITY_E2E:-0}" == "1" ]]; then
    if ! DSH_HOME="$profile" "$AGENT_PICKET_DSH_BIN" plugin --profile web add \
      "$root/tests/fixtures/offline-web-provider" \
      >"$proof/offline-provider-$flavor.log" 2>&1; then
      echo "FLAVOR=$flavor FAIL stage=official-offline-provider-install"
      ((fail+=1))
      continue
    fi
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
