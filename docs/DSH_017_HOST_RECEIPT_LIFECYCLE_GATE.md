# DSH 0.1.7 official Host receipt lifecycle safety

Candidate child of Draft PR #61, 2026-10-10. **Draft only; not permission to merge, publish npm or block real Agent tasks.**

## Problem established by source review

The older 0.1.7 Client adapter checked the official `remote.settings.mutate` `ok`, namespace and safe integer revision, then **published `result.value` into DSH's shared `configForms.describe()` mirror before checking that the mutation had produced the requested field value**. A corrupt/stale success response could therefore notify subscribers with a premature enabled consent snapshot before the adapter finally rejected the write.

The adapter also lacked its own in-flight disposal state: a late Host response could still touch the shared mirror after the Picket UI fiber was torn down, even though the official Client ConfigForm implementation itself has a disposed-state guard.

## Candidate fail-closed contract

1. Never publish a Host response until the receipt namespace matches exactly `agent-picket`, its revision is safe and not older than the version originally sent, and its returned settings object contains a valid choice and canonical bounded ledger. The specific requested field must match; a **changed** value must have advanced the Host revision. A genuine same-value no-op may retain its existing revision.
2. Re-check the current official Host mirror **after** the network response. Reject if the Host is unavailable/readonly, the plugin is disposed, or another tab has already published a newer revision. When the official mirror already contains the matching response revision and value, do **not** republish a stale duplicate.
3. Publish the checked response only after those validations. Require matching synchronous readback. The single official authenticated, revision-fenced DSH Host writer remains unchanged; no custom RPC or optimistic browser cache is introduced.
4. On scope disposal, immediately mark the adapter unavailable, unsubscribe its own mirror listeners, and drain the in-flight mutation chain. A server request already in flight cannot be undone; the adapter simply refuses to **represent** any late response as fresh consent in the disposed UI.

## Verification and remaining limits

Six always-on tests inject malformed success receipts, unchanged revision on a changed value, Host disconnect while writing, newer revision from another tab, disposal while the RPC is pending, and legitimate same-revision no-op. Unit injection deliberately does **not** establish a real Host ever emits corrupted success responses.

- Source-run `npm run check`: **224 total / 201 pass / 0 fail / 23 conditional skip**.
- Real legacy DSH **0.1.2-rc.1** native + Web + Composer, source/offline-installed: **5/5 pass**.
- Real DSH **0.1.7-rc.2** officially installed Browser/consent/restart/Host CAS: **1/1 PASS** on this candidate. The independently installed typed Composer flow **passed 2 of 3 fresh Profile attempts and failed 1** with an 8-second timeout waiting for the very first typed `/union rights` response. The cause is not yet established: track [Issue #62](https://github.com/ysr666/agent-picket/issues/62) as an **open release blocker**. Do not claim Composer stability or silently retry user commands. Green parent PRs do not count for this new code.
- Human screen-reader, browser zoom and OS High Contrast sign-off remain outstanding. The #53/#54 sibling branches must not be blindly merged. External package-root migration and full canonical stacked PR review remain release blockers.

Avoid logging Host cookies, raw prompts, model tool arguments, raw Session IDs or ledger contents in CI or incident reports.
