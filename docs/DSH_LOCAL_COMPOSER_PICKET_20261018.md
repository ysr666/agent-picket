# DSH local composer pause: independently implemented capability

## What is implemented

The published DSH Client ComposerBlocks registry offers a documented browser-only way to disable the currently selected Session input UI. Agent Picket now exposes a manually operated Pause / Unpause button in Union HQ, Action, using this official registry. No new upstream implementation or unpublished API is needed.

This is a real UI editability pause in one client. It is **not** Host-side admission or a guarantee of an Agent physical strike. Direct Session.prompt, conversation.send, another tab, Goal automation and tools can still progress. The Union HQ explains this in Chinese and English. The control is independent from the fictional picket ledger and official Goal safe-boundary stop.

The pause is user operated only. It is not triggered by a detector or by reaching a work-time threshold. No prompt, image or file contents are inspected, read, duplicated, queued, transmitted, discarded or replayed by the plugin. Unsent draft state belongs to DSH and may be lost on browser reload.

## Scope and safety

- Always keep pre-step destructive reject disabled for ordinary human input.
- Never override or clear a different plugin's composer block.
- Keep any local pause attached to one current Session; clear on Session switch, Union exit, service replacement and fiber teardown.
- The browser block is volatile, not Host-persisted. Release must verify native readback and must not report success if it failed.
- An unsupported Host continues its regular tasks and shows the control as unavailable.

## Verification

- The client-side contract suite tests explicit action, idempotence, coexistence, Session switching, revocation, lifecycle and unavailable services.
- Genuine published DSH 0.2.1-alpha.5 plus macOS Chrome: a real unsent Lexical draft is unchanged after clicking Pause in Union HQ, while its actual contenteditable flag flips to false; clicking Unpause restores true and the draft remains verbatim.
- The real browser extension is opted in with PICKET_LOCAL_COMPOSER_E2E=1 in the existing DSH Web official Host CI workflows.

This does NOT satisfy the release-wide Host-owned atomic normal human text/ordered attachments admission gate (#80) or cross-API interception, or Codex remote conditional Goal mutation (#169). Agent Picket 1.0 release remains NO-GO; no production physical strikes are enabled.
