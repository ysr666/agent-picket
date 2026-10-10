# Agent Picket: DSH version and accessibility release gate (2026-10-10)

This is an **isolated compatibility observation**, not a claim that the plugin supports all DSH releases. The only active rights settings writer remains DSH's native authenticated Host service. No user DSH profile, credentials, or package installation was modified during these checks.

## Version evidence

| Target | Result | Scope |
| --- | --- | --- |
| DSH 0.1.2-rc.1 (installed global CLI, **disposable DSH_HOME**) | **PASS** | Chrome/Playwright: source + independently offline npm-installed plugin, 2/2; native Cordis + FileSettings, 1/1; Composer → Host → union sidebar, source + installed, 2/2 |
| DSH 0.1.7-rc.2 (installed in private /tmp npm prefix) | **NOT VALIDATED / compatibility blocker** | Compiled-source Chrome flow reaches built-in Continue and Skip but times out waiting for Agent Picket's first-run dialog. Safe diagnostics measured **zero union launcher, zero welcome dialog and zero other dialogs** at that point, with no uncaught browser page errors. This demonstrates missing union UI, **not yet its root cause**. |
| DSH 0.1.7-rc.2 legacy native-service fixture | **FIXTURE INCOMPATIBLE** | `tests/dsh-native-rights.real.test.ts` imports `@deepseek-ai/dsh-settings-file/lib/index.js`, present in the 0.1.2 dependency tree but absent from 0.1.7's dependency tree. The newer package has `@deepseek-ai/dsh-settings`; it is **not safe to substitute it blindly** or introduce a second consent writer. |

The 0.1.7 browser run uses an isolated CLI/package dependency prefix and the E2E's temporary Host home; browser traffic is limited to loopback and model credentials are empty. A lack of the union launcher after the onboarding screens may involve plugin loading, lifecycle or changed Host settings/runtime APIs. The test timeout alone cannot distinguish these; investigate the 0.1.7 Host plugin loader, native settings service and current Client Slot activation independently before claiming a fix. Do not suppress the failure by skipping the test or installing old settings services alongside the new Host.

## Failure UX hardening in the child Draft

The union dialog previously reused `settings.saveError` with the assertion "No permission was enabled." That was unsupported after rejection of a fictional negotiation or disabling an already-enabled union. The welcome page also claimed simulation "remains off" even if Host write confirmation was stale. These are now localized **confirmation-uncertain** messages, exposed through a single assertive, atomic `role="alert"` per failed operation.

Five always-on stateful UI tests simulate Host-rejected consent, petition and agreement writes; no phantom grievance, right enablement or successful save is asserted. These are **mocked rejection-path contracts**; they do not replace a real Browser AX tree check of an actual Host write refusal.

## Browser zoom and screen readers

Headless macOS Chrome + Playwright `Meta+Equal` was tried three times against an isolated disposable test page. CSS `innerWidth`, `devicePixelRatio`, and `visualViewport.scale` remained unchanged (1280 / 1 / 1). That shortcut test **did not actually change zoom**, so it is not evidence for native 200% or 400% browser zoom. The existing 320×200 CSS layout reflow and emulated forced colors remain valuable automated evidence but are **not substitutes** for real browser zoom, Windows High Contrast or an assisted VoiceOver/NVDA walkthrough.

## Remaining release gates

1. Identify why the native union plugin is absent on DSH 0.1.7-rc.2, then run a revised, faithful cross-version test of the authorized Host settings/Client Slots and Composer command parity.
2. Manually verify VoiceOver on an isolated Mac profile and NVDA on Windows where available, including Host rejection announcements, focus after petition/counter/resolve, and no repeated verbose announcements. Do not silently toggle the user's system accessibility settings.
3. Verify actual 200%/400% browser zoom and physical OS high-contrast mode, documenting device/build and any unsupported configuration.
4. Maintain exactly one writable Host consent/settings owner, no raw prompts/tool payloads, and **no real task blocking**. Explicit maintainer authorization is still required before merge or npm release.

The 0.1.2 Chrome and Native regressions were rerun on the child Draft's initial code: 2/2 and 3/3 respectively. The new UI error-only changes do not alter the underlying Host integration, but the final commit still requires its own full test/CI check.
