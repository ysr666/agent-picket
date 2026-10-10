# Native /union CLI localization: shared DSH rights, independent language (PR #50)

## Intent

Agent Picket's DSH **native `/union` rights and fictional bargaining commands** previously emitted mixed English and Simplified Chinese text, even while the **Browser union panel** had a proper multilingual UI.

The native CommandRuntime is hosted on the **DSH Host**, whereas the React panel reads its locale from DSH's **Browser Client**. The Host command invocation has no verified browser-locale channel. This PR therefore deliberately **does not pretend that the Host knows each Browser tab's language**.

## Behavior

- Adds one harmless setting to the existing *single authoritative* Host `agent-picket` settings namespace: `commandLocale: 'auto' | 'en' | 'zh-CN'`, default `auto`. This preference is **independent of** the fictional simulation opt-in `welcomeDecision` and the canonical numeric-only `unionLedger`.
- Adds `/union language` (alias `/union lang`) to inspect language and `/union language zh-CN`, `/union language en`, `/union language auto` to change it. The preference is persisted with the official **DSH SettingsProvider.update(namespace, patch, expectedRevision)** and must be read back before success is claimed.
- `auto` resolves the Host's `LC_ALL` → `LC_MESSAGES` → `LANG` → `Intl` fallback using the existing BCP-47 locale normalization. POSIX `zh_CN.UTF-8` is normalized correctly. Unsupported languages fall back to English without guessing that Traditional Chinese should use Simplified Chinese.
- **Rights ON/OFF/status, grievances, demo petitions, counteroffers, simulated union resolution, command help, parameter errors, save errors, persistence confirmations, interval/history details and language commands** use the existing typed `src/i18n/en.ts` and `src/i18n/zh-CN.ts` catalogs, via the shared `formatMessage`.
- **Other legacy statistics/diagnostic commands**, such as `/union lifetime`, `/union trends`, `/union safety`, still have their original English-first technical outputs. Those remain a separate localization task. JSON `/union snapshot` is intentionally **not translated** because it is a machine-readable contract.
- Changes to a command language **never enable simulation, alter a petition or modify model/task blocking policy**.
- Web Client language remains independently selected. A future Host-supported locale bridge may allow opt-in following a specific Browser tab; this PR does not invent one.

## Commands

```text
/union language            # query current command language
/union language zh-CN      # force simplified Chinese Host command responses
/union language en         # force English
/union language auto       # follow Host language
/union rights on           # enable explicitly fictional union
/union grievances          # see simulated pending demands and intervals
/union petition-demo       # user-triggered fictional rest request
/union counter 1 30        # offer a 30-minute interval
/union resolve 1 accept    # simulate union acceptance; NOT an AI vote
```

## Verification

- Complete clean checkout `npm ci --offline --ignore-scripts` + `npm run check`: **191 tests / 168 passed / 0 failed / 23 opt-in environment skips**. Includes English↔Chinese↔auto, invalid locale inputs, privacy/opt-in independence and `zh_CN.UTF-8` behavior.
- Actual **DSH 0.1.2-rc.1 / Chrome** Composer typed-command→sidebar real E2E: **2 pass / 0 fail** (compiled source and privately offline-installed npm tarball). Both test Chinese output, invalid usage, English return and **language persistence across a real Browser reload**, with the 30-minute simulated agreement still visible.
- Previously verified, unchanged **Host restart/two-tab/rights onboarding Chrome regression: 2 pass**, real **Cordis CommandRuntime+FileSettingsProvider: 1 pass**, without model keys or external Browser network traffic. Both were re-run with the new setting schema.
- No real task blocking, model calls, transcript collection, new Host RPC or second consent store. Tests use disposable DSH_HOME; no user's normal profile altered.

## Further release gates

1. Finish language coverage for legacy technical/statistics command output without altering machine-readable snapshot schemas.
2. Test multiple Browser Client language preferences against the shared Host setting to ensure the *documented* command-level global preference is understood (not per-tab).
3. Cross-version DSH, screen-reader, keyboard, color scheme and end-to-end merge chain review.

Draft stacked PR on #49; do not merge/publish automatically.
