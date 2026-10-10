# DSH 0.1.7 Host/profile integration experiment (2026-10-10)

**Draft experiment; not a compatibility claim, merger authorization, or production release.** This branch extends the #56 accessibility/rejection baseline, without enabling real prompt/tool blocking or introducing an independent rights settings store.

## What changed

- Add a sanctioned `dsh.bundle.patch` to `package.json` and the distributable `cordis.patch.yml`. It inserts exactly one Host entry (`id: agent-picket`, `name: agent-picket/dsh`); native Cordis/SettingsProvider remains the only settings owner.
- Upgrade the existing Host-side `@deepseek-ai/schemastery` from 3.18.1 to 3.18.4 to use DSH's `.volatile()` config fields. Do not bundle an additional browser React instance or depend on internal Host client APIs.
- Export `Config` for the new DSH 0.1.7+ Host `SettingsForms` mechanism. Preserve the older `settings.register()` route for DSH 0.1.2; select **one** route at runtime, never both.
- The new form adapter delegates `describe`/`update` and expected revision to the official Host service, rejects writes addressed to unrelated namespaces, and strictly checks the ledger before command-origin writes. The Config schema also declares a size limit and a canonical-ledger validation transform. Suppress the generic raw-ledger settings page using the official `settings.configure({auto:false})` API.
- New always-on tests check the Host version selection, Config shape/default OFF, false or oversized transcript-bearing ledger rejection, official CAS forwarding and the bundle's packed files.

## Directly observed evidence (isolated macOS, Node 24.5.0)

- `npm run check` on this branch: **206 tests / 183 pass / 0 fail / 23 conditional skips**. The first 202 tests were inherited; four new tests cover the experimental Config path.
- **Legacy DSH 0.1.2-rc.1:** after adding the new Config export, five real opt-in tests passed: Chrome source + offline-installed package (2), native Cordis/SettingsFile (1), Composer-to-sidebar source + installed (2). All used disposable `DSH_HOME`, blank model credentials and browser network limited to loopback.
- **DSH 0.1.7-rc.2 official plugin management:** `DSH_HOME=<temporary-root> dsh plugin --profile web add <locally packed tarball>` succeeded in a throwaway profile. `package.json` now lists `agent-picket` under `dsh.profile.bundles` rather than installing as a plain dependency. `--dump-config` resolves exactly one `agent-picket/dsh` entry.
- The 0.1.7 `--dump-config-schema` tool exposes the `welcomeDecision` and `unionLedger` fields of the plugin's Config, but warns that **the transform callback's validation is not projected to generic JSON Schema**. Native end-to-end validation of malformed settings edits remains required.
- **DSH 0.1.7-rc.2 Web E2E still FAILS** even after official bundle installation + new Host Config: no Agent Picket welcome dialog appeared after DSH's own Continue and provider-skip screens (8-second Playwright timeout). Prior diagnostics verified that the Host plugin apply function does run when directly patched, while the browser showed no Picket launcher or unhandled page error. This is a **release-blocking Client/Host compatibility gap**, not a green new Host result.
- Inspecting the installed 0.1.7 client bundles did not locate the old `settingsScope` service string. Its replacement/public authenticated client settings API and Client Slot lifecycle have **not** been verified. Do not add a browser write RPC or a second consent owner as a shortcut.

## Safety and required next tests

1. Reproduce the actual DSH 0.1.7 authenticated Client lifecycle and identify its public write service, if any. The new settings form is *not* proof the React union sidebar works on 0.1.7.
2. Exercise the new 0.1.7 Host's real ConfigEditor/settings service with malformed ledger writes and revision contention. Mocked provider/schema tests and `--dump-config-schema` are insufficient evidence of on-disk validation.
3. Independently verify native `/union` command invocation on 0.1.7 and check real durable preferences across full Host restart. A green 0.1.2 test does not prove 0.1.7 native command parity.
4. Re-evaluate schema upgrade portability on Ubuntu and macOS via new-head CI. Do not assume npm-package installation equals working Client support.
5. Keep human VoiceOver/NVDA, native 200%/400% zoom, OS high-contrast, strict whitelist/privacy review and the canonical parent PR merge audit as blockers.

**No real task blocking, hidden telemetry, session raw IDs, prompt/tool payloads, alternate settings writers, npm publish or merge were introduced.** Treat this as an incomplete experimental compatibility branch and keep its PR Draft.

**Follow-up:** Draft child branch `fix/dsh-017-client-official-settings-20261010` has real DSH 0.1.7 Web consent/bargaining PASS, but full Composer parity is still NOT VERIFIED. See `docs/DSH_017_OFFICIAL_CLIENT_WEB_VALIDATION.md`. Historical failures above describe the *parent* state, not the newest candidate.
