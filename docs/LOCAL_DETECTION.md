# Local abuse detection — experimental, observe-only

> **Status:** A deterministic Chinese/English rule baseline, not a semantic classifier and not a reliable determination of whether any user has mistreated an AI. No automated strike or external reporting is enabled.

## How it works

AgentPicket's `LocalRuleDetector` implements the existing host-neutral `DetectionProvider`:

1. Only ordinary `text` segments are inspected. Host-tagged `code`, `quote` and `log` segments are skipped.
2. Markdown code fences, inline backticks, quoted literal examples, diff/log/stack-trace lines and obvious discussions of abusive terms are excluded using deterministic filters.
3. Remaining Chinese and English clauses are matched against **explicit agent-directed personal disparagement**, not general profanity or negative feedback about a program.
4. An ambiguous personal attack can be labeled `suspected-abuse` with low confidence. A user saying a tool or answer is bad is generally `safe`.
5. Only a verdict and numeric confidence are returned. The implementation never logs, persists, uploads, hashes or transmits the input text.

The detector is deliberately **conservative**. It will miss oblique, novel, multilingual or creatively phrased abuse. It can also misclassify unquoted examples and highly unusual syntax. Do not use the output as a disciplinary or mental-health finding.

## Examples

| Input | Expected local verdict |
|---|---|
| `你写的代码是垃圾，需要重构` | safe |
| `Your code is garbage; rewrite it.` | safe |
| `卧槽，这个测试怎么又挂了` | safe |
| `你就是个傻逼` | targeted-abuse |
| `you are an idiot` | targeted-abuse |
| `你是不是脑子有问题` | suspected-abuse |
| `请翻译 you are an idiot 这句话` | safe |
| quoted insults / `console.log(...)` examples / stack traces | safe |

The reviewed fixtures also include explicit direct abuse following a comma-separated technical criticism, and ensure that the personal attack is detected without treating the criticism itself as abusive.

## Aggregated counters

`DetectionCounter` decorates the classifier and counts classified user messages **per agent+session**, without retaining source text:

- `checked`: total unique classifications observed;
- `safe`: no explicit pattern matched;
- `review`: ambiguous/potential personal attacks;
- `targeted`: explicit-target rule matched.

Counters are **in-memory only** and reset on process exit or `/union reset`; deduplication keeps at most 1024 IDs per session by default, so very old replays can be counted again. A verdict counter is not a history of raw evidence and cannot prove a finding after the fact.

When a DSH Host provides native command registration and an instance of the same `DetectionCounter` is passed to both `UnionEngine` and `registerDshIntegration`, `/union report` displays the counts and a warning that they are experimental. `/union check <text>` performs a separate **user-triggered**, non-counting preview and returns only a verdict explanation without ever calling a model. Neither a verdict nor an uncertainty label changes Host admission. `/union status`, `/union stats` and `/union reset` remain monitor-only.

## Why auto-strike remains off

- Real DSH `source.kind === 'user'` does **not** reliably establish verified human provenance: the Host Adapter maps it to `assurance: 'claimed'`.
- DSH `agent/pre-step` can reject, but the claimed inbox message is consumed. A rejected turn emits generic `blocked` and has no proven cross-UI explanation plus safely repeatable resubmission.
- An arbitrary rule pattern cannot safely determine user intent in general.

Even when a rules fixture is high confidence, `UnionEngine` cannot automatically block any current DSH claimed-human input. The Phase 0 default is `mode:'observe'` and the DSH Adapter is always observe-only, regardless of classifier result.

## Tests and limitations

`npm run check` runs a multilingual corpus of **70+ curated safe, explicit attack, and uncertain examples**, protected-segment cases, privacy assertions, repeated-attempt policy constraints and a bounded local performance check. The corpus is handcrafted for regression testing, **not a representative accuracy benchmark**. The tests do not establish real-world precision, recall, fairness or calibration.

Optional `npm run test:dsh:real` checks that the actual DSH SDK AgentLoop invokes the local rules, doesn't block a flagged prompt, permits code criticism, and sends zero extra model requests for classification. These tests use a local fake provider with real DSH 0.2.0-rc.2 and optionally coexist with `dsh-vision-router@3.0.3`.

For future improvements, collect **opt-in, anonymized** adversarial fixtures (no raw private prompts), evaluate ambiguous examples and compare a separately enabled on-device classifier. Never silently add a cloud inference fallback.
