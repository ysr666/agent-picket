# DSH 0.1.7 and 0.2.0 JSON storage multi-owner and migration research

Date: 2026-10-12. Real isolated installed @deepseek-ai/dsh-storage-json SDK 0.1.7-rc.2 and 0.2.0-rc.2, disposable file roots, independent Node OS processes. This examines raw KV storage, NOT actual Host SettingsForms or Agent Picket consent.

## Two different contracts

- single layout: one authoritative in-memory whole unit per process; atomic whole-file replacement but no cross-owner compare-and-swap. An unrelated stale write can overwrite both erasures and changed values.
- per-record layout: one atomic file per record; unrelated keys do not overwrite each other. Same-key writes and deletes have no persistent expected-generation guarantee.
- Unit format version is NOT an authorization epoch or versioned compare-and-swap token.

The actual DSH 0.1.7 config-editor is a SEPARATE layer. It uses a profile patch file lock, re-reads and reconciles patches while holding the lock, and derives the requested edit from the freshly reconciled config. SettingsForms delegates to this config-editor. Consequently, the raw KV observations below do not demonstrate that the official modern Host consent service has the same bugs. That requires direct, multi-owner SettingsForms tests including OFF-ON ABA.

## Five genuine SDK observations reproduced on BOTH versions

Run:

    AGENT_PICKET_MODERN_STORAGE_SDK=/path/to/isolated/dsh/node_modules npm run research:dsh-modern-storage

The script rejects missing SDK with exit code 2. It verifies all five specific tests ran and passed without being conditionally skipped.

1. Single-layout, independent OS owners: A deletes a previously confirmed picket record. B writes an unrelated petition from its old in-memory state. Cold reopen finds the picket resurrected.
2. Single-layout: A turns a consent-shaped KV value OFF. B writes an unrelated petition from its old unit snapshot. Cold reopen finds the old ON value restored.
3. Per-record: A deletes picket key, B writes petition key. Cold reopen sees the picket remains absent. Different record paths protect each other.
4. Per-record: A deletes the union_state key, B writes stale union_state at that SAME key. Cold reopen sees restored old data. Raw KV API permits replacement and does not promise CAS.
5. Per-record legacy migration: write an old single-layout unit containing one case. Per-record load bootstraps that case to the new document and leaves the legacy whole-unit JSON file unchanged. Delete the only new case file, confirm that it is PHYSICALLY ABSENT while the old legacy file remains. The next loadAll reimports that legacy case, and cold restart does so again. This is concrete storage-layer deletion resurrection, not a UI cache symptom.

Both genuine SDK releases: five observations, five passing tests. These tests check observable behavior, not successful security guarantees. The script explicitly prints HOST_SETTINGS_CAS=NOT_TESTED and RESEARCH_ONLY.

## Current upstream master still contains the migration pattern

Inspected packages/storage/storage-json/src/per-record-unit.ts from deepseek-ai/deepseek-harness master:
- loadPerRecordState calls bootstrapLegacyUnit if there are no active new-layout document paths.
- bootstrapLegacyUnit copies records from the prior whole-unit JSON document, retaining that prior file.
- deleteRecord removes a new-layout JSON document without leaving a one-time migration/erasure tombstone.
- When the final new document is deleted, the next load can re-enter bootstrap and resurrect old records.

This is a backend migration lifecycle concern. It only impacts real services whose retained data actually travels through that single-to-per-record upgrade path. It does not prove that Agent Picket's Host union ledger uses this backend or that newer SettingsForms allows stale consent writes.

## Proposed upstream requirements

Per-record migration needs a durable, crash-resilient no-rebootstrap marker or initialized-generation tombstone, established on first initialization, migration, and before destructive deletion can empty all new documents. Empty migrated units must remain empty on reopen. Correctly handle existing migrated-but-unmarked profiles, partial migration, crashes, multiple OS owners and legacy files still retained for inspection. The marker does not itself solve same-key concurrent CAS. Independently audit all backup copies and user-selected export files before promising complete erasure.

For official Host settings, test config-editor edits and SettingsForms CAS with real independent process owners, same-key updates, consent OFF-ON ABA and cold restarts. Do not infer results from raw KV storage alone. Existing old-architecture DSH 0.1.2 P0 #111 remains RED.

Research fixtures are excluded from the npm package and never touch user profiles or patch installed SDKs. Related tracking: Agent Picket #111 (cross-owner), #82 (deletion and retained copies).

## Strict negative erasure gate: separate from research success

The observation-based research suite reports 5/5 because it truthfully observes the present behavior; this must NOT be mistaken for the user-safety property that deletion is permanent. The opt-in strict gate is:

    AGENT_PICKET_MODERN_STORAGE_SDK=/path/to/modern/dsh/node_modules npm run check:dsh-modern-migration

It creates an old single-unit document, loads it using new per-record layout, deletes the migrated last record, and cold-restarts. It requires the record to remain ABSENT; absent SDK causes exit 2, missing/skipped test also fails. On genuine DSH storage-json 0.1.7-rc.2 and 0.2.0-rc.2, this assertion FAILS and prints MIGRATION_ERASURE_NO_GO with exit 1. This is a *storage-layer migration erasure gate*, not an official Host SettingsForms consent result, and only becomes a product release requirement if the Host's retained data uses this particular migration path. The prior unmodified DSH 0.1.2 SettingsFile P0 gate remains independent.
