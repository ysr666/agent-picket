# Genuine Windows DSH Desktop 0.2.0-rc.2 real input-strike E2E — PASS (2026-10-22)

**Official native Host, not Web or a mock.** Actual installed Windows
DeepSeek Harness Desktop **0.2.0-rc.2**, native Electron `dsh-app://app/`,
running on the owner's authorized Windows computer with a disposable DSH
Host profile, disposable Electron user-data directory and CDP bound to
127.0.0.1. The ordinary user profile and other running sessions were
untouched. All synthetic test inputs; no paid model configured.

**Source:** feature branch commit
`67642846c68fee678b5ce12176ae00dcb5f282bc`, independently exported
as ZIP SHA-256
`fa6678c6f24183eab73963c6a017c3540527c50b38eacfa03224dd942a2b6d05`.
Downloaded via temporary same-LAN transfer to Windows, checked exact ZIP
SHA-256 **before extraction**. Native Node 24 npm dependency install,
TypeScript and DSH Client build passed.

**Private native-Windows packed plugin:** `agent-picket-0.0.0.tgz`
247,463 bytes, SHA-256
`41a076ef58a6a51f4874bff8f1eea2edbb51860d1d2388176606057287fabc86`.
No publication or release tags.

**Exact command:** `PICKET_DESKTOP_INSTALLED_E2E=1`,
`PICKET_DESKTOP_REAL_INPUT_E2E=1`, `PICKET_DESKTOP_ONBOARDING=join`,
plus the absolute official installed EXE, the absolute Playwright entry,
the pinned private tarball and exact SHA-256; then
`node scripts/verify-dsh-desktop-installed-picket.mjs`. PowerShell's
environment variables were set for the child only.

**RESULT: EXIT 0**, all of:
- Actual native Plugins install and Enable; informed first-run Join.
- Genuine `dsh-app://app/` authenticated Host `/api` route witness 200.
- Separate user-visible **discard and manual resend** grant, independent
  real Session campaign, exact hashed Session and Host consent readback.
- Genuine official Host accepted **one synthetic text + PNG image**
  through `session/prompt`, but physically refused this turn before any
  model/tool step as attested by the **matching Host Picket refusal receipt**
  and official blocked/no-model/no-tool event window.
- Native visible `[data-ap-strike-summons=verified]`
  `role=alertdialog` and
  `[data-ap-native-refusal=verified]`; the user is explicitly warned
  that rejected text/images/files must be manually resubmitted.
- User clicked **Resume**, and the Host's authoritative
  `realInputStrikeCampaign` was confirmed empty. No automatic replay.

**Independent platform coverage:** Same private branch and exact
E2E mode passed genuine macOS DSH Desktop 0.2.1-rc.2; see companion
`DSH_DESKTOP_MACOS_RC2_REAL_INPUT_STRIKE_20261022.md`.
These are **two distinct native OS installations**, neither Web nor a
cross-OS emulation.

**Remaining:** Native Linux is not tested, neither Windows screen reader
nor macOS VoiceOver human signoff is complete. Session-wide Host refusal
cannot securely identify another UI's submitting window; visible notice
proven only in the independently running submitting native Client.
Native profile contains no paid provider, so the native E2E relies on
official blocked-turn + matching Host receipt for zero model/tool events;
the real Web offline provider-call E2E is separate. The release matrix
remains **NO-GO**. Do not merge main, tag, or publish.
