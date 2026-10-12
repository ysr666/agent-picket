# DSH 0.1 cross-owner atomic CAS research (2026-10-12)

Source: real locally installed DSH 0.1.2-rc.1. Issue: ysr666/agent-picket#111. This is an isolated experiment and upstream design proposal. NOT a production DSH patch and NOT a proof of 1.0 readiness.

## Source-level root cause

DSH SettingsProvider.write builds the COMPLETE next namespace from its process-local section and a process-local revision, then calls persist(ns, section). DSH FileSettingsProvider.persistSection does take a cross-process writer lock, re-read the actual settings file via reconcileFromDisk, and writeFileAtomic uses an atomic rename. But the candidate full section was built BEFORE the lock and can be older than the newly loaded disk section. The writer then persists that obsolete section. Therefore the file lock prevents byte-level corruption but NOT data/consent rollback by a different OS process.

Three tests with two genuine, independent DSH SettingsFile process owners (same disposable profile) all FAIL in the official unmodified Host: (1) an acknowledged picket is lost after another owner's petition; (2) an erased category reappears after the other owner's write; (3) rights OFF revert to ON after the other owner's stale petition. These are P0 safety failures, not expected user behavior.

## Experiments: a content-only CAS is insufficient

An opt-in patch INSIDE the test-only process fixture first compares the prior raw namespace against reloaded disk namespace while holding the official file lock; a mismatch rejects. The original three scenarios no longer commit stale data, but an OFF then ON transition changes the section twice and restores its initial bytes. An obsolete owner's subsequent petition is incorrectly accepted. The explicit content-only OFF-ON ABA test FAILS. Equal content does not prove an uninterrupted consent epoch.

## Durable disk generation demonstration

The isolated JSON-only fixture optionally writes an opaque random generation token as an extra test-only root document field every successful write. Each process retains the generation it observed, and while holding the existing file lock, it re-reads the disk and compares BOTH raw namespace AND generation. A stale generation rejects a write, even if the resulting JSON is identical. The new token and section are committed by the real DSH atomic-file writer in one JSON replacement. All three initial two-process scenarios and OFF-ON ABA now PASS (the stale writer rejects, and no false success is returned).

This intentionally modifies a test fixture only, NOT real installed DSH or product source. The unregistered root marker is a laboratory-only implementation; it is NOT suitable for release, legacy document migration or YAML support. The experiment does not prove durability on crash/power loss, network filesystems, Windows filesystem semantics, or every scheduling pattern.

Reproduce actual OFF-ON ABA weakness (expected RED):
AGENT_PICKET_DSH_HOST=/actual/dsh-0.1/node_modules AGENT_PICKET_DSH_DISK_CAS_EXPERIMENT=1 AGENT_PICKET_DSH_DISK_CAS_CONTENT_ONLY=1 node --experimental-strip-types --test --test-name-pattern='UPSTREAM EXPERIMENT ABA' tests/dsh-archive-multiprocess.real.test.ts

Reproduce experimental durable generation (two PASS):
AGENT_PICKET_DSH_HOST=/actual/dsh-0.1/node_modules AGENT_PICKET_DSH_DISK_CAS_EXPERIMENT=1 node --experimental-strip-types --test --test-name-pattern='UPSTREAM EXPERIMENT' tests/dsh-archive-multiprocess.real.test.ts

## Required upstream release-grade contract

1. Give each authoritative settings document or namespace a persistent monotonic revision or never-reused generation; surface it in an official API, not just in-process registration.revision.
2. Every mutation binds to the revision read by its initiating caller; under the writer lock, reload the CURRENT document and reject any stale generation BEFORE writing. No acknowledged success for a failed attempt. A safe optional retry must rebase ONLY the intended sparse operation onto fresh state; never restore erased ledgers or a revoked rights preference from an old full-section snapshot.
3. Atomically commit the next revision, changed namespace, and a verifiable receipt. Preserve unknown namespaces, YAML comments, secrets, schema defaults and versions, including migration from pre-revision documents.
4. Verify OFF-ON ABA, concurrent overlaps, crash/restart, watcher ON/OFF, lock failures, corrupted input, both YAML and JSON, Windows/macOS/Linux, and backward compatibility. Do not confuse same-Host browser tabs with independent OS owners.
5. The product must fail closed if true atomic CAS is missing. No real task interception (#80), blanket erasure guarantee (#82), or multi-owner deployment recommendation without proofs.

## Explicit NO-GO gate

The new developer command npm run check:dsh-multiowner uses ONLY the original, unpatched DSH installation. Missing real SDK gives error exit 2; a single failing cross-owner scenario gives error exit 1 and P0_NO_GO. The three real tests all FAIL today. Never treat the lab experiment as an official upstream fix. Positive sequential disk restart remains a SEPARATE 2/2 check with npm run check:dsh-host-archives.

The stable 1.0 release remains NO-GO until official Host resolves #111, alongside other pending safety, accessibility and privacy signoffs.


## Follow-up: later DSH 0.1.7-rc.2 is a different storage architecture

An isolated npm installation of @deepseek-ai/dsh@0.1.7-rc.2 (separate temporary prefix, no changes to existing DSH 0.1.2) exposes dsh-storage-json, dsh-settings and dsh-config-editor but NOT dsh-settings-file. Its JSON storage implementation describes a per-process one-writer / last-write-wins model; that alone cannot establish safe or unsafe cross-owner behavior of the higher-level Host Settings API. The three DSH 0.1.2 SettingsFile P0 probes cannot be invoked against this materially different architecture. Do not claim #111 fixed simply because the old module disappeared.

An initial real Chrome 0.1.7 test invocation also showed our old E2E routing assumption was wrong: we had treated every 0.1.x CLI as the legacy immediate-onboarding path, while this newer Host starts without that same dialog. The test failed its assumption, not a demonstrated user-consent failure. The wrapper scripts/verify-dsh-rights-a11y.sh now checks the actual legacy SettingsFile module before entering that path; if it is absent, returns UNREVIEWED_DSH_SETTINGS_LAYOUT / exit 2 rather than claiming a compatible pass. A separate, genuine, version-scoped modern-host integration acceptance must be written before DSH 0.1.7 can be treated as a supported migration target.

## Extended genuine two-process matrix (2026-10-12)

Three reproducible experiments strengthen the durable disk-generation sketch:

- **Simultaneous independent owners**: start both OS-process owners on the same initial enabled profile; submit a picket and petition concurrently. One (and only one) command is acknowledged, the loser receives an explicit conflict, and a new physical process reads the winning state. This verifies actual overlapping operations, not only ordered stale writes.
- **Conflict then intentional fresh retry**: a confirmed category erasure occurs while another owner holds an old profile. Its first petition rejects. After observing current disk, an explicitly new non-destructive petition succeeds; reopening confirms the deleted category remains erased.
- **Revocation then stale retry**: consent is revoked by A. B attempts a petition from obsolete authorization. Both that stale command and B's second command after disk reconciliation reject; reopening confirms OFF and no new petition.

Including the prior tests, five opt-in experimental cases pass with the test-only disk-generation override. All original DSH P0 cases remain RED. This is not an upstream upgrade.

### One-command reproduction (research, never a release signoff)

From the Agent Picket repository with an actual legacy DSH 0.1 SDK:

    AGENT_PICKET_DSH_HOST=/path/to/legacy-dsh-node_modules npm run research:dsh-disk-cas

The new scripts/verify-dsh-cas-research.sh requires SettingsFile and Commands modules and checks three independent suites, each using disposable temporary profiles:

| Suite | Required observation |
| --- | --- |
| Unmodified official DSH, 3 release blockers | 0 pass / 3 fail |
| Content-only disk CAS, OFF-ON ABA counterexample | 0 pass / 1 fail; obsolete command succeeds |
| Isolated durable disk generation, including overlap and recovery | 5 pass / 0 fail |

Merely skipping tests or failing for an unrelated content-only assertion cannot mark the research summary green. Changes from known observations return an inconclusive error requiring investigation. Even when the command completes, it prints RESEARCH_ONLY and RELEASE_STATUS=P0_NO_GO. The independent real shipping gate is npm run check:dsh-multiowner, run against the UNMODIFIED official SDK. Only its 3/3 passes could contribute toward a future release decision; other blockers remain.

The upstream master branch has migrated away from the old SettingsFile package and GitHub Issues are currently disabled. This is a version-specific reproducible research report, not a current-master patch ready for merge. The modern Host storage/config implementation requires fresh tests.


### Reproduction evidence validation

The research runner now prints its genuine installed SettingsFile SDK version and Node version. In addition to requiring a fail status and exactly three failing official tests, it demands each original **domain-specific assertion message** (lost acknowledged picket, resurrected category, and restored consent). Three unrelated initialization crashes or an incompatible SDK therefore produce RESEARCH_INCONCLUSIVE, **not** a false root-cause reproduction. The content-only ABA control likewise requires the actual successful-stale-request assertion, not merely one arbitrary failure. Keep this evidence quality requirement if adding other DSH versions.
