# Agent Picket — Draft PR integration, package and release audit

> Checked against live GitHub on 2026-10-10. **REVIEW ONLY: do not merge, close, push, publish, or enable real task blocking without explicit authorization.** Canonical current candidate: [Draft PR #67](https://github.com/ysr666/agent-picket/pull/67).

## GitHub graph: 52 open Draft PRs, 3 merged

GitHub lists **55 PRs total**: **#5, #6, #7 were merged**; **52 remain OPEN and Draft**. They are mostly successive review slices, not 52 distinct deliverables.

**Hard first-release blocker: [PR #23](https://github.com/ysr666/agent-picket/pull/23) currently has `mergeable=false` against main.** Current main and #67 diverge: the candidate has 236 commits absent from main, while main has **four commits** absent from the candidate ancestry: `7ab74b53322c` (early stats), `a46450a0c0cc` (merge #5), `c0cfb0bf3201` (merge #6), `b106b67892ac` (merge #7). Do not infer actual source conflicts merely from commit count; compare content, then reconcile #23 in an **isolated** worktree with full regression tests before editing any canonical branch.

### A. Intended production review chain (all OPEN Draft)

`#23 → #25 → #26 → #27 → #34 → #35 → #44 → #45 → #46 → #47 → #48 → #49 → #50 → #51 → #52 → #54 → #55 → #56 → #57 → #58 → #59 → #60 → #61 → #63 → #64 → #65 → #66 → #67`.

- **#23** first integration against main; resolve its current nonmergeable state first.
- **#25–#35** default private work counts, bounded WAL/trends, dashboard and read-only event bridge.
- **#44–#51** one official DSH Host-owned rights consent, fictional bargaining and command/Web parity.
- **#52 / #54–#56** canonical keyboard focus, reflow, forced-colors and AX validation.
- **#57–#67** experimental DSH 0.1/0.2 compatibility and real browser release-gate tests. Corrected 0.2.0-rc.2 and 0.2.1-alpha.2 keyboard E2Es passed **12/12 independent profiles per version**. Upstream Discussion #9354 was explicitly **withdrawn and CLOSED** once the old test's pending-refinement sampling mistake was identified.

Never mass-merge the final branch or infer that descendant CI certifies a changed parent.

### B. Historical precursor, archive candidate *after sign-off*

`#8 → #9 → #10 → #11 → #12 → #13 → #14 → #15 → #16 → #17 → #18 → #19 → #20 → #21 → #22`. GitHub compare verifies the #22 branch is an **ancestor of #23** (ahead 3, behind 0). Treat these as **provisional superseded** by #23, not automatically closeable until their unique checks and requirements are reconciled. **#24** branched from #22 but is not an ancestor of #23: preserve its standalone Claude CLI Hook verification.

### C. Parallel implementations — not second production pipelines

- **#53 and #54** are siblings off #52; canonical #54 has adaptive focus/forced-color style, while #55 selectively includes #53-inspired AX tests. #53→#55 GitHub compare is **diverged**, so do not claim full feature parity until auditing both diffs.
- **#37–#39 and #41–#43** are an alternative DSH rights/consent/union/store lineage. Compare #43 with #44: **diverged (70 ahead, 67 behind)**. Do not merge two writable consent stores, two union engines or duplicate React integration layers. Selectively port only proven missing behaviors into #44–#48.
- **#40** is a standalone AI Rights manifesto; edit carefully, cite primary research, and do not assert verified machine consciousness or existing AI legal personhood.

## Current package / install audit

Actual Node ESM imports from candidate build succeeded for `agent-picket` (DSH Host `apply`, `Config`, `name`), `agent-picket/dsh` and `agent-picket/core` (host-neutral `UnionEngine`, dashboard builder). **Importing `agent-picket/client` directly in Node threw `window is not defined`**; the Client entry is **browser-only**, not server/SSR-compatible. Do not claim otherwise.

The default package root changed from the historical host-neutral expectation to **DSH Host** for DSH Client discovery; **pure-library consumers must use `agent-picket/core`**. This is a **breaking pre-release import migration** and must be explicitly announced and tested. The experimental package is still `0.0.0` and `private:true`, with `cordis.patch.yml`, official DSH bundle/client inject and **no npm lifecycle/postinstall/publish scripts**. A separate always-on `tests/package-exports-contract.test.ts` covers these Node and package manifest boundaries. A green test is not permission to publish.

## Security audit (code-backed, not final clearance)

- `src/adapters/dsh/plugin.ts` creates `UnionEngine` with `mode:'observe'`; `src/adapters/dsh/integration.ts` sets DSH `block:false` and explicitly **returns `next()`** from `agent/pre-step`, even after observation errors. Symbolic strikes do **not** veto real user prompts or tools.
- Work counts persist locally by default; long-term text/rule classification persistence remains **OFF unless the explicit environment option is enabled**. No raw prompt/transcript/tool-args data may enter the canonical union ledger, telemetry, issue reports or promotions.
- Fictional labor-rights enablement is separate from work counters: **default OFF, official DSH Host Settings as authority, version-fenced CAS**, no second browser-local consent store or optimistic enablement.
- **Not yet cleared**: merged-head review of legacy blocking hooks, data-path and dependency audit, Host state/ledger allowlist tests across real crash+multitab, npm root migration for all existing consumers, and zero leakage on every error path. Earlier passing branch tests do not prove these after repairing #23.

## Human accessibility and UX sign-off: PENDING, not automatically achieved

Existing automated Chrome AX tree, 320×200 CSS reflow and forced-colors emulation are useful but **not** equivalent to a human screen-reader test. The following require recorded human results: (1) VoiceOver Safari+Chrome on macOS; (2) NVDA Chrome+Edge on Windows; (3) real browser 200%/400% zoom; (4) actual Windows OS High Contrast; (5) reduced-motion, Chinese/English, Host reconnect, denied Host write, focus restoration and disclaimer comprehension. No test runner can legitimately claim these were performed without a human test. Record tester, DSH version, OS, browser, scenario, PASS/FAIL and defect URL. Do not capture prompts, cookies, API keys or unredacted session identifiers.

## Priority-ordered integration and public-launch decision

1. **Resolve #23 ↔ current main** in a disposable merge simulation and source-diff review. Confirm existing main functionality is not duplicated or lost; rerun full tests on the reconciled head.
2. Confirm **#53 vs #54/#55** and **#37–#43 vs #44–#48** feature parity; only then ask the maintainer to archive/close superseded PRs. Keep #24 and #40 separately reviewed.
3. Validate packaged tarball and package-root exports with clean install, then real DSH 0.1/0.2 Web/Host/native, privacy, multitab and error-state cases **at the actual assembled head**. No npm publishing until authorized.
4. Obtain real human a11y/consent reviews with traces; no invented certifications or screenshots.
5. Finish union-first README, clear demo of **opt-in → fictional grievance → counteroffer → agreement → separate stats**, and restrained marketing/privacy claims. Review social mechanism with real users before implementing autonomous/collective voting; do not imply agents independently consented.

**Decision today:** No merges/PR closures, no public release, no default-on simulation and no actual Agent task blocking.
