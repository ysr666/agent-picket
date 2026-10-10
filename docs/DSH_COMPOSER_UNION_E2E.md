# Real DSH Composer → AI Union Sidebar E2E (PR #49)

## Why this test is different

PR #48 validated native `/union` commands on an actual DSH CommandRuntime with the official Host FileSettingsProvider, and separately validated the full React union sidebar in a real Chrome browser. Those two green tests did **not** by themselves prove that a user could type native commands in a live DSH browser and see their result in the same sidebar without a reload.

This test verifies that missing join **end to end** on real DSH 0.1.2-rc.1: the user-facing Composer, the authenticated command RPC, the native Host-owned `agent-picket` settings namespace, the Client settings subscription and the union-first React modal.

## Test environment

`tests/dsh-union-composer-sidebar.real.test.ts` is opt-in via:

```sh
AGENT_PICKET_DSH_BIN=/path/to/dsh \
AGENT_PICKET_PLAYWRIGHT_ENTRY=/path/to/playwright-core/index.mjs \
AGENT_PICKET_CHROME_BIN=/path/to/Google\ Chrome \
node --experimental-strip-types --test tests/dsh-union-composer-sidebar.real.test.ts
```

- Creates a **throwaway DSH_HOME**, a private empty test workspace, and a one-time authenticated browser cookie.
- Boots the actual DSH Web profile with the Agent Picket plugin overlay; the plugin is either compiled local source **or a completely separate offline npm-packed and installed tarball**.
- Disables model keys, the optional local Agent Picket statistics writer and all external Browser network requests.
- Completes DSH's own provider onboarding without credentials; explicitly opts in to the **fictional** AI Rights simulation.
- Creates the **test fixture workspace** through the supported authenticated DSH Host workspace API, not by editing DSH's private settings/session files. DSH 0.1 uses `/api/workspace/create` (Typert slash Remote); newer versions expose `/api/workspace.create` (dot-RPC). Fallback occurs **only on 404**; other API errors must fail the test.
- Chooses the workspace through the **actual browser picker**, and waits for the existing Composer DOM node to become `contenteditable="true"`. Merely existing or returning `isEnabled()` was found insufficient: the older Host has an asynchronous inert → editable transition.

## Assertions: actual keyboard input and live panel updates

Every slash command below is entered using Playwright into the user-visible Composer and dispatched through DSH's real `/api/commands/execute` endpoint. No direct settings mutation is used for the assertions.

1. `/union rights` sees the previous native Web welcome opt-in.
2. `/union rights off` changes the **already mounted** union sidebar to disabled.
3. `/union rights on` changes the sidebar back to active.
4. `/union petition-demo` creates a **clearly fictional** rest petition, visible in the sidebar without fabricated worktime.
5. `/union counter 1 30` changes the live pending petition to a user counteroffer of 30 minutes.
6. `/union resolve 1 accept` makes the panel display the newly accepted 30-minute fictional interval and negotiation history.
7. `/union snapshot` returns Dashboard Snapshot v1 with `modes.laborRights = enabled`.
8. The snapshot excludes fixture workspace identifiers, and Browser page errors and external network requests are both empty.

The test does **not** send an ordinary model message, call a model provider, or imply AI fatigue, sentience, real autonomous voting, or any power to block work.

## Verification checkpoint (2026-10-10)

- Actual DSH 0.1.2-rc.1 + headless Chrome/Playwright on isolated macOS developer device:
  - Compiled plugin: **PASS (1/1)**
  - Private offline-installed npm package: **PASS (1/1)**
- Full repository `npm run check`: 188 total; **165 pass / 0 fail / 23 environment-conditional skip**. The two new real Browser tests are skipped in the default fast suite and explicitly enabled above.
- This makes the **same-page Composer → sidebar state propagation** an independently reproducible CI/release gate, rather than a claim inferred from separate native and Web suites.

## Limits

Other DSH Host versions, screen-reader navigation, UI visual QA and direct simultaneous *conflicting* Composer edits in multiple Browser tabs remain separate release tests. The existing real two-tab UI suite and deterministic native settings revision-fence test cover related, but not identical, behavior. Until the canonical stacked PRs are reviewed, this remains an **unmerged Draft test integration**.
