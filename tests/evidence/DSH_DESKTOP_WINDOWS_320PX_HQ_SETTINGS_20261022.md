# Official Windows DSH Desktop narrow 320px Union HQ Settings: PASS, upstream pointer limitation retained

2026-10-22, independently installed official Windows **DeepSeek Harness
Desktop 0.2.0-rc.2**; real native Electron `dsh-app://app/`, not Web Chrome
or test-only React. Original user profile/other running desktop untouched.
Separate disposable `DSH_HOME` and Electron data directory.

**Exact code:** `d9a1860b637a5926d4196f5774c9839827edf4b0` exported
from the audited Mac branch as source ZIP SHA256
`f8b3b651977e417afb2d463d5d344fed686a50a6f433d070728d57755f2c5302`.
Source ZIP was checksum-verified on Windows **before extraction**.
Official Windows Node dependency install, TypeScript compile/build and
private native Windows npm pack succeeded.

**Native Windows private candidate:** 247,741 bytes, SHA256
`98675b1b772a2cfb1d127d2ede282738e4c55b7019dea4c9c6180d7602306905`.

**RUN EXIT 0**, via
`PICKET_DESKTOP_INSTALLED_E2E=1`,
`PICKET_DESKTOP_NARROW_HQ_E2E=1`,
`PICKET_DESKTOP_ONBOARDING=skip`, native installed EXE, pinned built
package and native Playwright. Exact official 320 × 640 CSS-px renderer:

- Official native UI installed/enabled plugin, selected **Not Now** in first
  run, thereby making NO physical Goal/input stoppage grant.
- At 320px original Host Plugins content overlays the sidebar action's
  pointer hit target. Without overriding Host CSS, **keyboard focusing and
  pressing Enter** on the genuine Union action opens the Picket HQ dialog.
  **Upstream Host touch/mouse entry issue remains open**.
- Navigated native HQ **Settings** room, reusing the same Host-backed
  permissions component registered in `settings.section`.
- Measured exact readable permission-card width **246px**, contained within
  the 320px viewport; no horizontal card scroll. This bypasses the original
  Host modal's reported 36px Slot without modifying Host.
- From authoritative initial Not Now/Host off state, pressed keyboard Enter
  on Join and saw Host-backed membership ON; clicked Leave and read OFF.
  The Settings room remained accessible after revocation. No automatic
  or real-strike grant was created.
- No paid model/provider, private conversation or real work submitted.

Independent companion macOS official Desktop 0.2.1-rc.2 passed exact same
flag at **245px**; see `DSH_DESKTOP_MACOS_320PX_HQ_SETTINGS_20261022.md`.
Screen-reader human verification and actual pointer/touch Host entry at
320px have NOT passed. #124 remains upstream-open. Release **NO-GO**.
No merge to main, release tag or npm publication.
