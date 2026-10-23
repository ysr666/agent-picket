# P0 – real authenticated headless HTTP client refused without a UI notice

**Date:** 2026-10-24. **Official DSH:** 0.2.1-rc.2 installed
Web Host with isolated temporary Profile and free offline model.

This is a safety negative test, NOT an official DSH CLI/SDK test.
Node.js native HTTP fetch runs OUTSIDE Chrome to send a genuine,
official session/prompt RPC authenticated via DSH launch-token-derived
cookie for the SAME isolated Host. The cookie is shared with the test
browser: this proves a separate no-UI request process, NOT a separate
authenticated *principal*, official SDK, or independent client ID.

Chrome tab A explicitly authorizes shared-v2 whole-Session input loss,
separately arms a real 30-minute strike and confirms Host Settings.
An independent Node HTTP client with NO renderer/banner UI submits
synthetic text+PNG to that Session. Actual observations:

- Official authenticated RPC returned 200, accepted=true.
- Picket Host genuinely refused the turn before model/tool; its exact
  Host receipt is observed, with no content or automatic replay.
- Model call log did NOT increment. A visible Web tab still received
  the Session notice and could manually Resume.
- The ORIGINAL submitting Node caller has no GUI, and therefore no
  visible alert can arrive there. Host refusal receipt contains no
  authenticated originating-client ID or delivery acknowledgment.
- A NEW user request after Resume reaches offline model; no replay.
- Installed-package Web flavor separately exercises genuine Chrome
  second tab B and checks B really sees role=alertdialog; Web tabs
  working does NOT prove headless consumers are notified.

Structured evidence log key: PICKET_HEADLESS_CLIENT_NO_NOTICE_EVIDENCE.
Its truthful fields include genuineSeparateNodeClient=true,
officialAuthenticatedHostRpc=true, originalNodeClientHasNoUi=true,
actuallyRefusedPreModel=true, authenticatedSubmittingClientId=null,
visibleNoticeAtSubmittingClient=false, releaseDecision=NO-GO.

**Release gate:** The Host needs authenticated binding between submitted
turn and its original client AND a supported acknowledgement/notice
delivery path. Or Picket must fail OPEN whenever the submitting client
cannot be verified as notice-capable. A Session-wide Host receipt or
browser cookie/requestId does NOT prove source client or delivery.
Existing one-time shared-v2 risk disclosure is NOT such evidence.
**1.0 is still NO-GO**; no release/publication.

Explicit opt-in: PICKET_INPUT_STRIKE_E2E=1 plus
PICKET_HEADLESS_CLIENT_E2E=1 under DSH rc.2 real Web matrix only.
No developer/user data, paid model, live provider or network secrets.
