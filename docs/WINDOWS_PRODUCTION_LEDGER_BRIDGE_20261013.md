# Windows DurableStats / real DSH Goal integration: P0 still NO-GO

Last verified 2026-10-13. Based on \`integration/agent-picket-1.0-20261012@2e0b3d7b\` and separate still-Draft [PR #125](https://github.com/ysr666/agent-picket/pull/125).

## Ownership and actual evidence

- **Windows production statistics storage:** \`new DurableStats()\` still deliberately throws before creating a filesystem path. This is intentional until the experimental native NTFS WAL research has a release-grade backend with validated private DACL, retained original file handles, owner locking, signed anchor/checkpoint, crash consistency and a production integration. Enabling it based on a \`process.platform\` check or an environment-variable override would violate the release safety gate.
- **Experimental NTFS writer:** PR #125 is independent, includes genuine Windows Node24 CI tests for a synthetic writer, but its latest design acknowledges unproven atomic owner fencing, rollbacks with same-privilege anchor replacement, checkpoint/power-loss guarantees and no safe legacy migration. It does **not** implement full \`DurableStats.recordWork\` over all event families or DSH official Goal E2E. Do not silently import the experimental writer or include it in the published tarball.
- **DSH Host ownership:** official DSH owns permission settings, Goal blocked/active and CAS; the local work ledger owns **only** counters. The Mac DSH Web Goal evidence from #135 is not Windows evidence.
- **Connected devices:** Desktop Commander enumerated one online Mac and one offline machine, **no connected native Windows DSH runtime**. Windows GitHub CI is real Windows for explicitly enabled NTFS research tests but its existing integration job is tagged \`portable-only-durable-ledger-NO-GO\`, not the product Host matrix.

## Change in this Draft

Protect the **already existing physical Goal 8h work-counter read** when a supported POSIX ledger faults or its open WAL/file-owner path is replaced. Instead of trusting \`lifetime.snapshotDays(31)\` even after an error, production \`plugin.ts\` now obtains \`lifetime.trustedWorkDays(31)\`. This validates current opened WAL file ID against its private on-disk path and the current Host lock token, and rejects a closed/faulted ledger; failure returns \`null\` and permanently faults this writer until a clean new lifecycle. Existing read-only history \`snapshotDays()\` is still available for diagnostics and cannot serve as physical strike authority.

Tests construct a genuine 8-hour completed-turn record, then replace only the journal path or change the lock owner token while keeping the cached totals. The Goal threshold input must become \`null\` rather than falsely authorizing an automatic stop. No prompt content, attachments or raw Session/Event IDs are written by the stats ledger.

**Explicit UI/RPC degradation:** the DSH dashboard projection now checks the same trusted-writer status before reporting persistent storage as available. A faulted writer reports storage=unavailable with null lifetime totals/daily history, never zero-filled or cached data labeled trustworthy. The official authenticated work-only lifetime fetch port likewise receives no store when the writer becomes untrusted. This narrowly changes shared DSH integration and plugin read paths; no other Host service or Goal state machine is changed.

**Boundaries:** this is a POSIX safety gate, **NOT** an NTFS production implementation, power-loss durability claim or a physical Windows Goal E2E. No new Host APIs, and no weakening of \`release:gate\`.

## Windows-native negative product-path gate

The Windows-only tests/windows-durable-fail-closed.test.ts now additionally invokes the genuine production DSH apply() on a Windows Node runner, with isolated temp-directory and fake official Host setting/Goal ports. Even with explicitly granted authorized-v1 and a real turn-stopping callback registration, the unsupported Windows ledger must create no filesystem directory and must not call official goals.block. This is native Windows OS execution with a *fake* Host port, NOT a real Windows DSH Host E2E or native NTFS production writer certification. Treat a CI result as evidence only after its own Windows job finishes.

## Reproducible native Windows product acceptance still required

1. On authorized Windows NTFS hardware, log OS build, filesystem type, Node version, DSH Host CLI/Web/Desktop version and exact isolated \`DSH_HOME\`. Never use a real user profile.
2. Independently audit and then adapt PR #125's native security primitives into a genuine \`DurableStats\` backend, not just \`recordSyntheticToolCall\`. Verify all work-event families, UTC day grouping, bounded keyed dedup, no unsafe automatic migration or incomplete-WAL repair.
3. From the **npm-installed production plugin**, create private NTFS work records and reopen in a second process. Verify file ownership/DACL, journals/checkpoints and signed witness, same-event replay and valid sub-threshold work. Test controlled crash windows and a real forced process kill; distinguish tested sync calls from unverified physical power-loss semantics.
4. With the real Windows DSH Host and explicit human-style Host grant, seed synthetic *completed* work events, run an actual isolated offline Goal. Require no block below 8h, then official \`goals/get: blocked/picket-work-limit\` at the eligible round boundary, and manual V12 HQ \`goals.resume\` CAS revision +1, official \`active\`, no replay.
5. Inject corrupt/torn/missing WAL, owner-lock replacement, missing witness and partial writes: storage state must become unavailable, \`todayWork\` returns null and no new physical strike is issued. Check revocation, restart and safe after-block recovery separately.
6. Run portable + native Windows Node24 tests, macOS/Linux Node22/24 checks, package <250000 bytes, \`release:gate\` still NO-GO until the rest of the release matrix is explicitly signed.

**Current outcome:** the production Windows backend and real Windows Host cells remain **NOT VERIFIED / NO-GO**. This Draft is a narrowly scoped fail-closed safety improvement needed by any future backend, not a substitute for the missing native acceptance.
