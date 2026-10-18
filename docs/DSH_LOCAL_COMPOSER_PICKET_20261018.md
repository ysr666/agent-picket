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
- Ownership uses the exact official block object identity, never public/localized reason text; an identical-text block owned by another plugin is not deleted. An unconfirmed release of a prior Session forbids a new Session pause and exposes a retry button, including from the HQ landing page.
- With an active local pause, leaving the union automatically clears the native composer block; this is verified by the actual browser alongside Host-side atomic Goal grant revocation.
- An unsupported Host continues its regular tasks and shows the control as unavailable.

## Verification

- The client-side contract suite tests explicit action, idempotence, coexistence, Session switching, revocation, lifecycle and unavailable services.
- Genuine published DSH 0.2.1-alpha.5 plus macOS Chrome: a real unsent Lexical draft is unchanged after clicking Pause in Union HQ, while its actual contenteditable flag flips to false; clicking Unpause restores true and the draft remains verbatim.
- The real browser extension is opted in with PICKET_LOCAL_COMPOSER_E2E=1 in the existing DSH Web official Host CI workflows.

This does NOT satisfy the release-wide Host-owned atomic normal human text/ordered attachments admission gate (#80) or cross-API interception, or Codex remote conditional Goal mutation (#169). Agent Picket 1.0 release remains NO-GO; no production physical strikes are enabled.

## Verified distinction between Goal stop, saved consent and local pause

The Union HQ Action room shows one small read-only official-Goal scope card when there is NO current Host-confirmed union Goal stoppage. Saving consent, enabling labor rights or raising a symbolic placard NEVER displays a stopped-work claim. The card distinguishes Host Goal service unavailable, missing permission, and permission saved but execution not confirmed. It makes no enforcement calls.

An actual union-specific official Goal block is still shown across HQ rooms only when its Host projection matches the current Session/Goal, valid revision and the official picket-work-limit reason. Only this confirmed block offers official Goal Resume. The card explicitly says ordinary human messages, attachments and tools already running remain unaffected. Upon real recovery and native projection update it disappears without asserting success from client-local state.

The separate local composer pause is scoped to one browser editor. Its recovery button is not a Goal Resume, and a symbolic placard is neither.

Unit UI assertions in tests/dsh-native-rights-ui.test.ts cover saved-but-unconfirmed consent, unavailable official service, and valid blocked projection. In the genuine DSH alpha.5 + Chrome E2E, the Action room has no physical-stop claim until a real Host Goal block; after durable block/restart, the confirmed card has truthful scope and resumes through the native revision CAS. Existing human file-byte and local editor-preservation E2E also pass.

## One-time user-visible notification after native Goal block

A confirmed work-limit stop now also uses the already-published DSH conversation input notification channel. When an active, selected Goal's official projection first changes to the union-specific blocked state, a local bilingual notice directs the user to Union HQ for review/resume. It states that existing tools and new human messages still run. This is not an independent adapter, Host RPC, fabricated union vote or additional consent channel.

One shared per-client union notification gate serves both background and visible-HQ subscribers, suppressing duplicate toasts from two listeners. The initial Host projection is seeded rather than toasted on a cold restart or Session navigation. Consents, fake placards, data refreshes, or a Goal blocked by some *other* reason never generate a union-stop notice. No goal objective or user message is used in the notification.

Native proof: in published DSH 0.2.1-alpha.5 + headless Chrome, the actual Session is selected before the offline synthetic Goal enters the real Host blocked phase, and the localized user-visible notice appears. The native Goal's durable restart, concurrent-tab recovery, input and attachment integrity assertions pass in the same E2E run. In older published Hosts, the notice E2E is not promoted to a claimed version-independent guarantee; normal blocking and recovery matrix still runs.

## Global Leave Union recovery across official DSH generations

A regression in the published official DSH 0.2.0-rc.2 Web client after cold restart made its Cause tab sometimes stay on the HQ homepage, leaving the old room-scoped Leave Union button unreachable. The official Goal block, cold persistence and resume were healthy, so the user-facing recovery was defective even though the Host state itself remained safe.

The product fix exposes exactly ONE always-visible Leave Union action in the Union HQ global footer, outside the CSS room filters. It calls the same Host-owned atomic revoke, updates Union membership and real Goal permission in one verified SettingsScope revision, releases the Picket-owned local composer pause and does not implicitly resume a previously blocked Goal. It preserves read-only Host checks and cannot falsely claim a failed revoke succeeded.

Actual published DSH 0.2.0-rc.2 + macOS Chrome: authorized first run, real Goal block, exact human file bytes across cold restart, concurrent two-tab Goal resume, global footer revoke, Host atomic settings change, cold restart and rejoin without regrant: 1/1 PASS. Published alpha.5 plus genuine macOS Chrome: full previous chain, real editable local composer, official visible Goal-stop notification and automatic local unpause on exit: 1/1 PASS.

The rc.2 native CI matrix tests the official durable Goal chain and global exit, rather than an optional client-only ComposerBlocks interaction when no selected Session is restored. More recent alpha.3 through alpha.5 additionally test local editor recovery. Neither suite waives any official Goal safety or human-file integrity assertions.
