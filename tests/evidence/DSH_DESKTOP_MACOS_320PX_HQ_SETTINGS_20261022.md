# 320px real macOS Desktop Union HQ permission route: PASS WITH HOST LIMITATION

**Date:** 2026-10-22. **App:** installed official DeepSeek Harness Desktop
0.2.1-rc.2, native `dsh-app://app/` (not simulated Web).

The DSH Host issue [#124](https://github.com/ysr666/agent-picket/issues/124)
documents that at 320px its built-in Settings panel leaves the
`settings.section` slot only **36px**; patching host CSS globally is
not authorized. This change adds a **Settings** room within Picket's own
responsive Union HQ dialog, using exactly the **same** Host-authenticated
`SettingsPanel`, permissions scopes and revocation actions as the
official Host Settings extension. No duplicate permission writer.

**Real installed Desktop independent native E2E: EXIT 0**. Disposable Host
and Electron profiles; SHA-256-pinned local candidate `agent-picket-0.0.0.tgz`:
`e25491b55a81f78b1237d49e33663e9f67f6720911e7360db37ad0a352069a17`.

- Installed/enabled via official native Plugins UI; first-run selected
  **Not Now** explicitly. No actual Goal, ordinary-input, or symbolic strike
  was authorized or armed.
- Switched real Electron renderer to **320 × 640 CSS px**.
- **Upstream HOST layout limitation independently exposed:** at 320px the
  official Plugins pane blocks pointer clicks to its sidebar/footer Union
  action even though the button is in the DOM. We did NOT use a hidden
  programmatic DOM `click()` or CSS override. Using actual keyboard
  focus+**Enter**, the real official sidebar button did open the Union HQ.
  Keyboard access is partial mitigation; touch/pointer access is still blocked.
- Opened the new **Settings** tab in the real, own Union dialog; measured
  the true Host-backed permission card width **245px**, fully within the
  320px viewport with no card horizontal overflow.
- Verified first-run `not-now` remained **off**. Focused the native Join
  control, pressed **Enter**, and observed actual Host-backed state and
  `aria-pressed` become **on**. Clicked **Leave union**, confirmed state
  returned **off**. The Settings room stayed reachable for later recovery.
- End-to-end test default is gated: requires
  `PICKET_DESKTOP_INSTALLED_E2E=1`,
  `PICKET_DESKTOP_NARROW_HQ_E2E=1`,
  `PICKET_DESKTOP_ONBOARDING=skip`, pinned private package/installed EXE
  and existing Playwright runtime. Cannot coexist with the explicit
  real-refusal test flag.

**Scope:** This is a meaningful accessible alternative to the 36px built-in
Host Settings panel, **not** a full fix for #124. Host pointer/touch access
to the sidebar Union button still needs an upstream responsive layout or a
separate supported mobile entry. Human VoiceOver/NVDA and forced-colors
certification remain outstanding. Release is **NO-GO**. No main merge,
release tag or package publication.
