# 2026-10-19 — Union actions must not race before next React render

Native Union HQ buttons used React busy state, which updates only after a new render. Repeated clicks on the same mounted button could enter twice before that commit; even a later Host reject would cause an extra error or action.

A synchronous shared in-flight ref now fences user-directed Host mutations: union join/leave, bargaining/petition/placard/action, opposing accept vs decline, case filing and follow-up. Ref is released on successful write or failure, keeping deliberate retry possible. Official Goal resume has a separate in-flight ref so nonmembers can recover an already-blocked Goal without submitting duplicate native revision-conflicting requests.

Unit tests exercise same-render double click, accept vs decline, refusal and retry, official Goal resume failure and retry, and filing a case while attempting another placard action. These are client-side dedup guards, NOT cross-process atomicity guarantees. Host CAS and readback remain authoritative.

Local npm run check: 639 total, 564 pass, 0 fail, 75 optional skips. Published DSH 0.2.1-alpha.5 + authentic isolated Chrome Web Goal test: official blocked Goal, notice, human file untouched, cold restart, two-tab Goal CAS recovery, Union revocation and local pause release: PASS. No general text/file submission block is enabled.
