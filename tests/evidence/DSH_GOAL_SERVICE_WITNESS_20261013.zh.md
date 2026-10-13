# Agent Picket — Current-Session official DSH Goal service witness

2026-10-13 · Draft-only P0 continuation built on [PR #131](https://github.com/ysr666/agent-picket/pull/131). No parent PR modified; no 1.0 release authorization.

## Why this is needed

Before this change, the first-run physical Goal grant displayed whenever the Host could mutate `agent-picket` settings and had a nonblank Session. Such settings **do not prove that this Host has a usable official DSH Goal service or a recoverable Goal endpoint**. Accepting a new physical grant on a settings-only Host would misrepresent actual capabilities and the user's informed consent.

## What is now certified

A new read-only witness obtains the official optional `remote.goals` injection independently of the nonblocking Union Slots. For an exact real selected Session, it requires a **stable Session ID, Session binding identity, both official `get` and `resume` service methods, and `get(sessionId)` returning an official success result with a schema-shaped GoalView or no Goal**. Failure, missing service, malformed data, identity change, Host rejection and detached Session produce **unavailable**, not real-strike authorization.

This proves availability of a public read-only Goal lookup and its official resume method on that Session. It is **not** a blanket claim of Goal-runner policy registration or version-independent safe enforcement. The physical runtime and official Goal status still need their separate real-work end-to-end test.

- The V12 first-run UI and dedicated Goal Settings only offer new real consent once the witness responds successfully. Ineligible Hosts retain the nonblocking Union onboarding path.
- User clicks re-run a **fresh** `get` witness before any versioned first-run CAS or standalone future physical Goal authorization. A previously successful cached witness cannot by itself authorize a later write.
- A generation fence prevents an invalidated, late async `get` result from certifying an old Session after unload, service removal or a newer check. Concurrent probes are deduplicated; no Goal create/pause/resume occurs during qualification.
- Existing **revocation** remains available through the official Host settings writer even when the Goal service subsequently disappears. Already blocked Goal recovery still requires exact Host-projected `picket-work-limit` and official resume, not speculative replay. No generic chat interception.
- The client browser's self-contained module map enumerates the newly inlined witness explicitly. No hidden import, custom HTTP RPC or Host-private UI patch.

## Regression and acceptance

- Six new hostile-unit cases assert writable-settings-only, absent/malformed/rejected Goal endpoint, missing resume method, identity switching, in-flight stale response and fresh click failure. Existing versioned consent, UI, pack and Port contracts remain in the test suite.
- `npm run check`: **521 tests / 453 pass / 0 fail / 68 explicitly gated skips**.
- `npm pack --json --dry-run --ignore-scripts`: **229,865 bytes**, strict limit 250,000.
- **Both** pinned isolated genuine DSH Web+Chrome Hosts **PASS** single-click CAS, synthetic authentic-format UTC 8h completed-turn work, real Goal blocked rev2, V12 user manual resume rev3 and card removal; no paid model, no real user's data or profile.
- V12 original source/offline-installed independent browser UX tests remain in force; after this patch DSH 0.2.0-rc.2 SOURCE and OFFLINE INSTALLED both PASS. Unavailable service fallback and revocation are also tested with intentionally absent/rejected mocked official RPC.

## Not yet sufficient for a 1.0 release

A successful `goals.get`+present `goals.resume` is only an availability witness. It does not prove that arbitrary DSH revisions have a fully validated Goal-runner enforcement registration. There is no authenticated full Host capability manifest with versioned safe-boundary semantics; unknown future DSH versions must remain subject to separate acceptance. Windows/Linux/Desktop, Codex and Claude Code native release matrix, cold-restart/reopen, multitab races, human AX and original-message/attachment lossless recovery remain NO-GO. `release:gate` must remain nonzero. This is a Draft review only.
