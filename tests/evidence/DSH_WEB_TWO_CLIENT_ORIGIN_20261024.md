# P0 real cross-client: two actual Chrome tabs and same official DSH Host

**Date:** 2026-10-24; official installed DeepSeek Harness 0.2.1-rc.2
Web; fresh disposable Host profile; isolated Chrome via Playwright;
test-only offline LLM provider; no user content or paid models.

**Procedure:** Chrome tab A independently joins the union, authorizes
the v2 shared-Session discard risk, and clicks real Session Start.
An independently created Chrome tab B, which did NOT approve or
start a strike, opens the SAME official Host Session and submits
synthetic human text plus PNG through the native session/prompt RPC.
Require authenticated 200 accepted, actual pre-model Host refusal,
separate authenticated Host Session receipt, zero offline model calls,
and the original request text absent from the rendered foreign notice.
Observe actual UI in both Chrome tabs.

**Independent real DSH E2E (EXIT 0 both):**
- source flavor: full real rights-browser test PASS.
- installed flavor: official npm-installed package and full test PASS.
- B really submitted while A armed the same-Session campaign. B
  displayed a visible role=alertdialog explicitly requiring manual
  resend/reupload. A displayed the verified Session refusal status.
- Observed B settings-status badge count 0 and A count 1. The
  user-visible alertdialog is the correct origin-notice check; badges
  are NOT interchangeable with visible delivery.
- Structured observation reported foreignClientOriginNoticeObserved=true,
  originTabVerifiedStatusCount=0, armingTabVerifiedStatusCount=1,
  authenticatedSubmittingTabId=null, receiverProvenanceVerified=false.
- Host receipt is Session-scoped and does NOT authenticate source tab
  identity, even though this exact Web app currently propagates a notice.

**Boundary:** Real two-tab Chrome/Web test is NOT CLI, SDK, Electron
Desktop second-process or authenticated submitting client identity
proof. Official native Electron CDP Target.createTarget is not supported;
we did NOT fake an additional Desktop window. This does not prove that
every foreign Host client gets a notice. Release is still NO-GO.

**Test flag:** PICKET_CROSS_CLIENT_E2E=1, only when separate
PICKET_INPUT_STRIKE_E2E=1 is explicitly enabled in genuine installed
DSH 0.2.1-rc.2 Web workflow. Source and installed paths both run.
Actual B must display role=alertdialog. Normal tests never arm strikes.

**Additional verified UI repair:** Existing Chinese
settings.inputStrikeExplanation erroneously said upload an attachment
without explicitly saying RE-UPLOAD. Real source and installed Web E2E
both caught the regression. Corrected and added bilingual unit guard;
both official Web flavors then PASS.
