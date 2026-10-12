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
