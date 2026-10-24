# Genuine macOS DSH Desktop · private Agent Picket installed UI acceptance (2026-10-21)

**Tested:** official installed DeepSeek Harness Desktop `0.2.1-rc.2`,
native Electron `dsh-app://app/` (not Web), macOS ARM; project integration
base `1ccccfd811b3e84b0f94ddf9431b2f2a04ad3788`.

**Candidate:** complete privately built `agent-picket-0.0.0.tgz`,
SHA-256 `d7630d6e01f2ed899de8736a170e6745bf58745c7eb7659cd514503eabfd0d3c`,
246,256 bytes, `private: true`. This exact source was used for the build;
the separately updated opt-in test script and test code do not ship in the tarball.

**Isolation:** each run spawned its **own** official Electron executable,
disposable `DSH_HOME` and `--user-data-dir`, bound CDP to a random 127.0.0.1
port, and verified `dsh-app://app/` before interacting. It never touched
the user's existing Desktop process/profile. Both `AGENT_PICKET_STATS` and
`AGENT_PICKET_DSH_OFFICIAL_WORK_PREVIEW` were OFF. Only the spawned child
was terminated; its disposable profile was deleted. No account login,
live model, paid API, prompt corpus, or external requests were used.

**Actual results, final script:**
- `PICKET_DESKTOP_ONBOARDING=skip`: **EXIT 0**. Native official Plugins →
  Add Plugin → tarball Install → Enable → first-run Not Now → closed union
  with voluntary rejoin. No input strike armed.
- `PICKET_DESKTOP_ONBOARDING=join`: **EXIT 0**. Native install/enable,
  joined Union HQ, real native dignity/hearing empty state, negotiation &
  advocacy rooms, Picketverse stance/Gazette, fictional score hide/reveal,
  leave-union without uninstall, full **process cold-restart** with verified
  persisted opt-out and no repeated first-run warning. No input strike armed.
- Native welcome correctly applied the Host's observed Goal capability gate;
  the final two independent runs offered no actual Goal stop. No model/tool
  round, genuine input refusal, resubmission or recovery was attempted.

**Result limitations:** This is **macOS Desktop real UI acceptance**, not
ordinary input blocking, Host-proven Goal refusal, cross-process resume,
Windows parity or human VoiceOver signoff. The 1.0 release gate remains
**NO-GO**. See `scripts/verify-dsh-desktop-installed-picket.mjs` for the
reproducible opt-in path, SHA pin and destructive actions limited to test roots.
