#!/usr/bin/env bash
# Current published DSH 0.2.x: real Host, Chrome, official install & Composer.
# Never use the developer's normal profile or model credentials.
set -euo pipefail
cd "$(dirname "$0")/.."
for name in AGENT_PICKET_DSH_BIN AGENT_PICKET_DSH_HOST AGENT_PICKET_PLAYWRIGHT_ENTRY AGENT_PICKET_CHROME_BIN;do
 if [[ -z "$(printenv "$name" || true)" ]];then
   echo "DSH_COMPAT_REQUIRED: missing $name" >&2;exit 2
 fi
done
bin="$AGENT_PICKET_DSH_BIN"
version="$("$bin" --version)"
case "$version" in
  0.2.*) ;;
  *) echo "UNREVIEWED_DSH_RELEASE: expected published 0.2.x; found $version" >&2;exit 2 ;;
esac
if [[ ! -f "$AGENT_PICKET_DSH_HOST/@deepseek-ai/dsh/package.json" ||
      ! -f "$AGENT_PICKET_PLAYWRIGHT_ENTRY" ||
      ! -x "$AGENT_PICKET_CHROME_BIN" ]];then
 echo 'REAL_SDK_CHROME_REQUIRED' >&2;exit 2
fi
work="$(mktemp -d /tmp/agent-picket-current-dsh-XXXXXXXX)"
profile=""
trap 'rm -rf "$work"; if [[ -n "$profile" ]];then rm -rf "$profile";fi' EXIT
echo "DSH_COMPAT_VERSION=$version"
echo STAGE=official-two-process-settings
bash scripts/verify-dsh-modern-host-multiowner.sh >"$work/host.log" 2>&1 || {
 echo 'DSH_COMPAT_NO_GO stage=official-two-process-settings' >&2
 tail -20 "$work/host.log" >&2;exit 1
}
grep -F 'MODERN_HOST_TWO_PROCESS_SETTINGS_PASS=1' "$work/host.log"
echo STAGE=real-browser-source-and-offline-package
PICKET_DIGNITY_E2E=1 bash scripts/verify-dsh-rights-a11y.sh >"$work/rights.log" 2>&1 || {
 echo 'DSH_COMPAT_NO_GO stage=real-browser-source-and-offline-package' >&2
 tail -24 "$work/rights.log" >&2;exit 1
}
grep -E '^(DSH02_COMMAND_RUNTIME|FLAVOR=|FINAL_DSH=)' "$work/rights.log"
if ! grep -Fq 'PASS=2 FAIL=0 TOTAL=2' "$work/rights.log";then
 echo 'DSH_COMPAT_NO_GO: incomplete real Chrome test evidence' >&2;exit 1
fi
echo STAGE=real-typed-composer
mkdir -p "$work/pack"
package_file="$(npm pack --ignore-scripts --pack-destination "$work/pack" --silent)"
if [[ ! -f "$work/pack/$package_file" ]];then
 echo 'DSH_COMPAT_NO_GO: package missing' >&2;exit 1
fi
profile="$(mktemp -d /tmp/agent-picket-current-profile-XXXXXXXX)"
if ! DSH_HOME="$profile" "$bin" plugin --profile web add "$work/pack/$package_file" >"$work/install.log" 2>&1;then
 echo 'DSH_COMPAT_NO_GO: official plugin install failed' >&2;exit 1
fi
if ! PICKET_TEST_017_HOME="$profile" \
  node --experimental-strip-types --test --test-reporter=tap \
  --test-name-pattern='Composer → union sidebar parity: offline-installed package' \
  tests/dsh-union-composer-sidebar.real.test.ts >"$work/composer.log" 2>&1;then
 echo 'DSH_COMPAT_NO_GO: Composer-to-Host failed' >&2
 tail -38 "$work/composer.log" >&2;exit 1
fi
if ! grep -Eq '^# pass 1$' "$work/composer.log" ||
  ! grep -Eq '^# fail 0$' "$work/composer.log";then
 echo 'DSH_COMPAT_NO_GO: Composer test skipped or incomplete' >&2;exit 1
fi
echo 'COMPOSER_NATIVE_COMMAND_PARITY=1/1'
echo "DSH_CURRENT_COMPAT_PASS=$version"
echo 'LIMITS=manual_accessibility_and_1.0_release_reviews_remain_separate'
