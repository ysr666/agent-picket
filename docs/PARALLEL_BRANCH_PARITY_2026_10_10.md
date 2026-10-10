# Parallel Draft PR parity audit — consent, union and accessibility

> Verified directly against current remote GitHub content and commit SHAs on 2026-10-10. **Review only.** No PR closure, merge, force-push, package publication or permission to block real Agent tasks is authorized by this document.

## Live inventory and decision rule

**Live GitHub snapshot: 58 PRs, 55 OPEN Drafts, 3 already merged (#5/#6/#7).** The earlier audit's “52 Draft” count was a **historical snapshot** before newer #68–#70; it is not a current tally. Avoid filing yet another independent Draft for an audit-only change; add verified evidence to the existing #70 documentation.

A candidate is “superseded” only if its remaining *behavioral* delta is either demonstrated in the currently selected chain, or **explicitly rejected with justification**. Similar source names, green CI on separate heads, ancestry divergence and absence of a file are **not** enough to declare full parity.

## A. Accessibility sibling PRs #53 and #54

Verified commit graph (not PR labels alone):

- Common base **#52**: `ed85c9212a2e23a9a198ff5cfb5003d05cda1111`.
- **#53** alternate: `c5a0f36e7cc6f7981af68f7f2522d8f7d0dca583` (7 commits beyond #52).
- **#54** selected variant: `38eaf9338bad8c43bba097c0a3827f4e2b44e0db` (5 commits beyond #52).
- **#55**: `6250a14532f78d834b3ed4ffb18b0797e871aba4` is a **descendant of #54** (2 commits ahead / 0 behind), but **diverged from #53** (7 ahead / 7 behind). **#70 remains descended from #54** (65 ahead / 0 behind). Do not attempt to merge #53 and #54 as sequential fixes.

### What #53 offered and what the selected route does instead

| Item | #53 experimental approach | #54 → #55 → current #70 | Audit decision |
|---|---|---|---|
| 320×200 CSS consent/modal reflow | Fixed 12px overlay padding, `calc(100dvh - 24px)`, `flexShrink:0` | DSH-relative `min(3vw,20px)` padding, bounded `maxHeight:'100%'`, modal scroll; #55 and later real-browser tests check 320×200 | Same intended *user-visible outcome*, distinct implementation; chosen route has real Chrome tests |
| Focus after bargaining updates | Unconditionally focus the union heading once the response completes | Check the **current active element is outside the open union modal** before restoring focus, to avoid stealing focus after unrelated rerenders | Prefer selected route's narrower, fail-safe focus policy |
| Grievance announcements | `role=status aria-live=polite aria-atomic=true` on whole pending grievance section | `aria-live=polite aria-atomic=true` on the changed grievance title only | Different a11y announcement scope; **not proven perceptually identical**. Retain for human VoiceOver/NVDA verification |
| Forced-colors primary buttons | Baseline primary button had `border:0` | #54 uses a discernible 1px theme border, tested with Chrome forced-colors emulation | Prefer selected route |
| CSS overflow safety | Local modal sizing fixes | #54 adds `minWidth:0`, `overflowWrap:anywhere`, and bounded dialog width | Prefer selected route |

**Disposition:** #53 is an **alternate design, not a missing cumulative production change**. Mark as *superseded candidate for maintainer review*, but **do not close yet**, because human screen-reader announcement checks and actual Windows OS contrast/browser-zoom are not signed off. Do not import #53's unconditional focus restoration or a second overlay implementation solely to “include everything.”

## B. Alternate #37–#43 versus integrated #44–#48

Verified file-level evidence using remote GitHub content, not branch names:

| Experimental PR | Actual feature / source | Comparison with selected route | Decision |
|---|---|---|---|
| **#37** | Host-neutral `src/i18n/index.ts`; en/zh-CN locale dictionaries and original native command localization | `src/i18n/index.ts` at #37 is **byte-identical** to #70. Dictionaries have been extended in later revisions | Core i18n carried forward; newer bilingual strings/tests take precedence |
| **#38** | Standalone `src/product/rights-consent.ts` OFF-by-default controller | Alternative controller is **not shipped** in selected current DSH graph. The current authority is official Host `agent-picket` Settings namespace | **Intentionally replaced**; do not install a second consent owner |
| **#39** | `src/product/union-desk.ts` structured demands and negotiated rest breaks, native commands | The module exists in #70 but its text differs (**63 unified diff lines**) as integration evolved. The final DSH Client's `createLaborDesk` and authorized bargaining adapter are already covered by a **single-state-machine contract test** | Functional intent carried forward; *not byte-identical*, do not wholesale merge early engine |
| **#41** | `src/adapters/node/rights-storage.ts` + `src/adapters/dsh/rights-owner.ts`: alternate JSON-file-backed consent and negotiation owner | Both are **absent** from #70. The selected path instead registers **one** Host-managed revision-fenced namespace and ledger. `tests/dsh-merge-contract.test.ts` expressly prohibits importing `createNodeRightsStores` or `createDshRightsOwner` in the DSH Host entry | **Deliberately rejected** for current DSH release; alternative files must not be installed alongside official Settings |
| **#42** | Browser authenticated `src/adapters/dsh/client-rights-scope.ts` | Source is **byte-identical** between #42 and #44; #70 has a small subsequent change (**7 diff lines**) for later client compatibility | **Carried forward** and hardened; no second scope |
| **#43** | React union onboarding/settings Slots, localizable union UI | `native-rights-ui.ts`, `src/i18n/en.ts`, and `src/i18n/zh-CN.ts` at **#43 and #44 are byte-identical**. #70 evolves those files (security, focus, consent, bargaining and 0.2 compatibility) | **Carried forward** by integrated #44; don't merge an additional React Slot set |
| **#44–#48** | Official DSH Host rights namespace, one Client settings owner, Web/native unified ledger | Current selected integration; tested via real Chrome, Host CAS/multitab/restart and `dsh-merge-contract.test.ts` | **One release candidate**, pending #23/main ancestry, full-chain security and human a11y sign-off |

### Proof that selected Host does not quietly activate #41

At current candidate #70, `src/adapters/dsh/rights-owner.ts`, `src/adapters/node/rights-storage.ts`, and `src/product/rights-consent.ts` **do not exist**. `src/product/union-desk.ts` exists as the evolved simulation logic, but must only write through the **official authorized Host settings channel**. The shipped DSH Client bundle is already checked by `tests/dsh-merge-contract.test.ts` for **exactly one** labor desk, one authenticated bargaining adapter, one ledger parser and one set of native React Slots. Do not treat the mere existence of the old *concept* as permission for another writer.

### Other standalone branches

- **#40** ethical manifesto: an editorial/research artifact, not a core code dependency; review all primary sources and distinguish AI-rights advocacy from proven consciousness or legal status.
- **#24** Claude CLI Hook experiment: separate supported-platform validation; never imply the DSH release certifies Claude/Codex native integration.

## Merge/archival plan (requires maintainer sign-off)

1. **Do not close any branch yet.** Add factual “superseded / intentionally rejected / hold” audit comments with references for #53, #41, #42 and #43, while retaining historical code and tests.
2. Reconcile **#23 ↔ main** using the already verified [review-only ancestry bridge #69](https://github.com/ysr666/agent-picket/pull/69) **only after owner approval**. Then run all descendants on the changed parent.
3. Check the chosen Host's **single authorization namespace, revision CAS, zero raw-prompt storage and real-task continuity** on that assembled head; maintain the default OFF simulation.
4. Complete actual VoiceOver/NVDA, real 200%/400% zoom and Windows OS High Contrast. The #53 grievance-announcement difference is an explicit human UX review case, *not* a currently demonstrated bug.
5. After reviewing these outcomes, the maintainer may individually close superseded #37–#43 and #53 with a replacement link, without deleting branches. **Do not bulk-close or bulk-merge PRs.**

**Status:** This audit does not claim 55 independent features, user-facing certification or permission to merge/publish. Work-time statistics stay subordinate to the fictional union experience.
