# Agent Picket — #23/main conflict reconciliation (review-only)

**2026-10-10. No main merge or released change is authorized.**

## Verified input refs

- Current `main`: `b106b67892acb043acd209bb86073d89d0f50af3` (historical PR #5/#6/#7 integration).
- Canonical [Draft #23](https://github.com/ysr666/agent-picket/pull/23): `0ce92de3c4ba8a33a023f229b643e3968abca23c`.
- Common base: `583443b52e7c1002d25bb1c73e2362109c34f666`.
- #23 base was GitHub `mergeable=false`, so a real merge simulation was required before considering the rest of the 52 Drafts.

## Actual disposable Git merge simulation

The team fetched **these exact public commit objects** into a new disposable local worktree, then attempted `git merge --no-commit --no-ff main` with #23 as first parent. **Six textual conflicts**, not imaginary PR-label conflicts:

| Conflicted file | Review outcome in temporary simulation |
|---|---|
| `README.md` | The later #23 documentation covers the early WorkTracker explanation and adds nonblocking symbolics; select #23 text for the six-way reconciliation candidate |
| `docs/WORK_TRACKING.md` | Add/add conflict; later #23 document covers the canonical local work-count semantics and additional manual commands |
| `src/adapters/dsh/integration.ts` | Later #23 integration includes WorkTracker **plus** LocalRuleDetector, DetectionCounter, SymbolicUnion. Keep monitor-only Host semantics; must never lose `block:false` or `next()` |
| `src/core/index.ts` | Later #23 exports WorkTracker and all additional Core modules. Earlier main only exports WorkTracker |
| `tests/dsh-adapter.test.ts` | Later #23 test imports and covers WorkTracker **plus** newer detection/symbolic behaviors |
| `tests/fixtures/dsh-loop-smoke.mjs` | Later #23 loop fixture adds detection and symbolic setup on top of WorkTracker |

The chosen resolution retained the **more complete candidate-side content in all six files**. This decision was checked with `git diff --cached --stat HEAD`: **zero file changes compared with #23**. The merged result tree is exactly the existing #23 tree:

```text
c3cca718eef78e4c0a7186f30f9f516388c0dda3
```

The isolated real source-suite `npm run check` on that merge worktree returned **100 total / 84 pass / 0 fail / 16 conditional skip**, with typecheck/build successful. These are historical #23 tests; they do **not** substitute for the latest #68's 228-test release contracts or human DSH Web assessments.

## Review-only Git ancestry bridge

A new *separate Draft review branch* contains a **genuine two-parent merge commit** whose parents are (1) the exact #23 head and (2) current main; **its tree is byte-identical to #23**. This establishes reviewed ancestry without silently overwriting existing main changes or requiring a giant 236-commit squash. The branch adds this markdown report as a *separate small documentation commit*, so reviewers can inspect the precise basis.

**Nothing was merged into `main`, nor into #23.** The canonical #23 remains the merge target that still needs explicit owner approval. This proposal contains no new production behavior.

### Acceptance gates if maintainer chooses to adopt this bridge

1. Verify the two parent SHAs and identical production tree, read all six conflict decisions, confirm current main has not advanced in the meantime.
2. Verify #23's own Source+Host tests and privacy boundaries (especially `agent/pre-step → next()`, `block:false`, no raw prompt persistence) on the exact proposed head.
3. After approval, merge the reviewed ancestry bridge into **#23's branch**, not directly into `main`; then let GitHub recompute #23 mergeability. Stop if source tree/head moved or additional conflicts arise.
4. Re-run descendants #25–#68 against the **new real parent** and review/merge in dependency order. Descendant green checks on old bases are not enough.
5. Keep alternate #37–#43 store, #53 sibling work, #40 manifesto and #24 Hook experiment separate until explicit feature-parity audits.
6. Require explicit final authorization before merging #23 into main, un-privating or publishing npm, or any real task-block feature.

**Current classification:** candidate ancestry reconciliation, not a released fix or a user-facing bug.
