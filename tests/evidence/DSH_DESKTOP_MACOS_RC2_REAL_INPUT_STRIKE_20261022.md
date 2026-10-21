# Actual macOS DSH Desktop real ordinary-input union strike (2026-10-22)

**Native application:** official installed DeepSeek Harness Desktop **0.2.1-rc.2**,
Electron `dsh-app://app/`; NOT Web, a simulated renderer or a patched Host.

**Candidate:** local clean private `agent-picket-0.0.0.tgz`, SHA-256
`a77569fa104525893402e12a4893f16edb9a78b6c26ad6600c9391d834da4369`.
This packaged candidate includes the new native `dsh-app://app/` admission
prerequisite; the *separate* exact Host GET + explicit consent + live Session
campaign remain mandatory. This is a private, unreleased QA candidate.

**E2E acceptance, real installed Desktop: PASS, exit code 0.**

1. Spawned the actual signed native Electron app with a **new disposable**
   `DSH_HOME`, separate `--user-data-dir`, a 127.0.0.1 debugging port,
   and `AGENT_PICKET_DSH_OFFICIAL_WORK_PREVIEW=off`. No existing user
   Desktop process, profile or paid model settings were accessed.
2. Installed and enabled the SHA-256 verified private package via native
   Plugins UI; explicitly joined the union (no Goal permission implied).
3. Created/selected a real official Desktop Session in the native UI.
   Entered native Settings → AI Union; only after an actual authenticated
   official Host **HTTP 200** on
   `/api/agent-picket/refusal-notice/v1?capability=input-discard-resend-v1`
   did the independent **discard and manual resend** consent appear.
   This corrects an earlier premature 404 observed immediately after enable.
4. Read the disclosure, voluntarily granted input-refusal permission, then
   **separately armed** a 30-minute Session strike. Verified exact hashed
   Session ownership and versioned Host campaign through official Settings.
5. Submitted **new synthetic text and PNG image** through the *genuine*
   `session/prompt` Remote RPC in the native `dsh-app://app/` renderer.
   Host accepted the request, but produced an authenticated
   `dsh-host-picket-refusal-v1` metadata receipt for the first turn:
   `discard-manual-resend`, `containsInput=false`,
   `automaticReplay=false`. No source text or image persisted in the notice.
6. The **native Desktop itself displayed** a visible
   `[data-ap-strike-summons=verified]` `alertdialog`, plus
   `[data-ap-native-refusal=verified]`. The in-product notice requires the
   human to **manually resend text and re-upload all images/files**. Picket
   Client only renders this notice when its separate authenticated Host
   receipt matches a complete official `turn/start → turn/end: blocked`
   event window, with no assistant/model/tool steps for the turn.
7. Explicitly clicked native **Resume** and confirmed the physical Host
   campaign was **empty** through official `settings/describe`; nothing
   was auto-replayed.

**Limits:** The native E2E uses an offline disposable Host profile with no
paid provider and validates the genuine Host event/receipt intersection,
not a separate provider-side model-call logger. The existing Web E2E with an
offline model adapter independently checks no model call on rejection.
Native macOS source+installed candidate acceptance does **not** certify
Windows/Linux real-refusal behavior, Session origin provenance across
multiple simultaneous clients, accessibility audit, or the whole 1.0
matrix. Until the other supported native OS tests and human signoff pass,
`release/first-release-evidence.json` is unchanged and the first-release
gate remains **NO-GO**.

**Reproduction:** Build the candidate on Mac from this feature branch,
set `PICKET_DESKTOP_INSTALLED_E2E=1`,
`PICKET_DESKTOP_REAL_INPUT_E2E=1`,
`PICKET_DESKTOP_ONBOARDING=join`, the actual
`PICKET_DESKTOP_EXE`, `PICKET_PLAYWRIGHT_ENTRY`, the exact private
`PICKET_CANDIDATE_TGZ` and its SHA-256 `PICKET_CANDIDATE_SHA256`; run
`node scripts/verify-dsh-desktop-installed-picket.mjs`. The default
runner **never enables real input refusal** without this explicit test flag.
