# Agent Picket 1.0 · Host-atomic real enforcement contract

> Draft PR #110, parallel child tasks #117 (DSH Desktop), #118 (Claude Code), #119 (Codex); DSH Web parent #80. This is **only a typed adapter boundary**, NOT evidence that an existing Host can safely block.

## Shared Core

- `planPreSubmitAdmission` evaluates only consented, pre-submit, Host-evidenced work and genuine Core abuse decisions. It requests a Host hold only after all five safety predicates are claimed ready; otherwise warn/allow. Existing adapters remain observe-only.
- `tryHoldWithHost(input)` accepts an *official, opaque Host attempt reference* and a `QualifiedHostHoldPort` implemented by the exact client/version. The port must act on the **Host's currently owned submission**, without the plugin retrieving or storing original messages or attachments.
- A result is `held` **only** if the Host returns the matching `host-owned-hold` ticket, a fresh opaque receipt reference, confirmed prior notice, and retained original submission. Extra fields are rejected to avoid accidentally carrying private content.
- A missing port degrades to nonblocking warn/allow. `unconfirmed` means the Host call may already have taken effect; **never auto-retry, resubmit, discard, or falsely claim a successful block**. Host itself must provide status/recovery if transport fails mid-hold.
- `resumeHostHold(port,ticket)` only passes back the Host-owned ticket and accepts `resumed` or `already-resumed`. Exactly-once submission, persistent idempotency and retention across restart/another tab are **Host duties**, not guaranteed by Core tests.

## Mandatory real Host integration tests before setting capabilities true

1. First-run versioned informed consent explicitly includes real interruption; historical simulation consent is not reused; OFF/revocation immediately disables future holds.
2. A genuine directly-human pre-submit attempt with raw text **and images/files** is intercepted before model execution. A claimed UserPromptSubmit or role=user label alone is not proof of direct human authorship.
3. The prompt, attachment bytes, file references, order and formatting are retained by the **official Host**, not a plugin-owned raw data queue. A forced refusal runs zero model requests.
4. User receives a localized actionable reason and can appeal/disable, optionally bypass once, and resume **exactly once**. Same logical request must not disappear or run twice after reload, crash or concurrent tabs.
5. An unrelated ordinary request is unaffected. Unsupported Host APIs, uncertain origin, unsafe provenance, corrupt receipt, transport failure or missing permission never calls a destructive `reject` path.
6. Record exact client/runtime version and Windows/macOS/Linux coverage. A passing mock port test proves contract shape only, not actual Host readiness.

If any item cannot be proven on the exact Host build, keep real task admission OFF and report a concrete blocker (not a simulated victory). See #32, #79, #80 and `docs/BLOCKING_SAFETY.md`.
