# DSH Web 0.2.0-rc.2 / 0.2.1-alpha.2 · Safe task hold Host contract gap and minimal API request

**Status: verified negative capability audit for both isolated npm versions; no physical strike enabled.** Reproduce using an **isolated official DSH installation**, not a personal profile:

```sh
AGENT_PICKET_DSH_HOST=/path/to/isolated/node_modules \
  node scripts/inspect-dsh-web-admission.mjs
AGENT_PICKET_DSH_HOST=/path/to/isolated/node_modules \
  node --experimental-strip-types --test tests/dsh-web-admission-audit.test.ts
# Intentionally exits 1 while genuine enforcement is unqualified:
AGENT_PICKET_DSH_HOST=/path/to/isolated/node_modules \
  node scripts/inspect-dsh-web-admission.mjs --require-safe-hold
```

## Direct observations (published `@deepseek-ai/dsh` 0.2.0-rc.2 and 0.2.1-alpha.2 packages)

- `dsh-client-ui-conversation/lib/types/client/contract/composer-blocks.d.ts`: `ctx.conversation.blocks.set(sessionId, {reason})` can set the composer UI block. Its implementation's own comment in `input/blocks.d.ts` explicitly calls this **an affordance, not enforcement**. `lib/client.js` passes the block to the rendered input bar, whose `disabled` expression includes `blocked !== void 0`.
- `dsh-client-ui-conversation/lib/types/client/service.d.ts`: the public `IConversation.send(text)` and full `ConversationController.sendSession` paths remain independently callable. `lib/client.js`'s `async send(text)` forwards directly to `this.scopedSession('send').prompt(...)`, without checking the browser composer block registry. A browser-only block therefore **cannot guarantee zero Host model calls**, nor cover other clients/tabs.
- `dsh-api-session-controller/lib/types/client/contract/session.d.ts`: `beginSubmission` creates a client-local submission echo and `ISession.prompt` sends the already-prepared content. A transient `SubmissionHandle.abandon()` retires a pending echo as failed; it is **not** a durable user-input hold, automatic status, or one-time resume receipt.
- `dsh-agent/lib/types/runtime-types.d.ts`: `PreStepDecision` has only `kind:'reject'` and `kind:'enter'`. Rejecting after `session/prompt` may prevent the model request but **does not guarantee the source composer draft, complete image/file sequence, or actionable notice and replay**.
- `source.kind:'user'` and `source.rpcId` are not a privileged proof that a human—not an automated caller—supplied the payload.

Both versions were independently installed to isolated temp node_modules roots and scanned. The alpha version had the same seven checked interface facts; in particular, its published `ISession` and `IConversation` signatures still lack a documented hold/resume port. These are narrow claims about the **installed published Host API/compiled source**, not a runtime proof that future DSH builds have the same deficiency. `scripts/inspect-dsh-web-admission.mjs` is a static contract check: it **never authorizes** real enforcement on a successful scan.

## Proposed smallest *official Host-owned* API

Introduce a composable, authenticated **pre-prompt admission boundary** shared by Web / Desktop and API send pathways, not just CSS-disabled input:

1. The Host captures the exact new human-origin submission **before** calling the model or consuming the draft. The Host records an opaque `attemptRef`, authentic user intent provenance (not merely role), complete text, references, ordered images/files, and a durable state `pending`/`held`/`admitted`/`cancelled`.
2. A registered plugin may return `allow`, `warn`, or `hold({code, localizedReason})`, **without receiving raw input/attachment contents unless separately permitted**. The Host itself persists original submission and displays a mandatory actionable warning; read-only audit of reason/status is available. The Host must not return `held` to the plugin until it can prove draft/attachment retention and rendered notice.
3. A Host-owned `resumeOnce(attemptRef, receiptRef, humanAuthorization)` API atomically releases the exact stored payload to the ordinary session queue **once**, even after tab switch, crash/restart, double-click or racing approvals. `status(receiptRef)` resolves ambiguous lost acknowledgments without guessing/retrying. Revoke / disable is explicit and restores user control; no running tool is force-killed.
4. The Host must document whether a hold is possible for queued, steering, automated, API, Web and Desktop submissions; automated/uncertain provenance must **never** count as verified human abuse.
5. Versioned feature negotiation: the plugin cannot infer these guarantees from the existence of `ComposerBlocks` or `agent/pre-step`. Unsupported versions remain observe/warn only.

## Independent native acceptance before Agent Picket enables real action

- Build one synthetic request with text + a browser image + an uploaded file, send during consented 8h/repeated confirmed abuse, prove **zero model calls** while held, original payload retained byte-for-byte and in order, reason rendered, and exactly one model call on authorized resume.
- Test Enter/button, `conversation.send`, `Session.prompt`, queued/steered input, multiple Web tabs, Desktop, reconnect/reload, Host restart, simultaneous resume and OFF/revocation. The same hold decision must not merely disable UI while other entry points silently bypass it.
- Verify authenticated direct-human source and versioned informed permission with real Host fixtures; legacy simulation-only welcome is not enforcement consent.

**Current user promise:** DSH Web automatic physical refusal stays disabled until the supported Host build passes all of these tests. `ComposerBlocks` may be used for clearly labelled *UI affordances* but is not promoted to enforcement.

Source: `docs/BLOCKING_SAFETY.md`, `src/core/host-hold-port.ts`, `src/core/pre-submit-admission.ts`, Issue #80 and Draft PR #110.
