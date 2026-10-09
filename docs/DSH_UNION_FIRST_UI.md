# DSH Union-first Native React UI (Issues #29 and #36)

This PR introduces **real React components registered through DSH native Slots**, not a screenshot, command-card scraper, or DOM injection. Components are not yet installed in a combined DSH production Client bundle.

## UI slots

- settings.onboarding: Agent Picket first-use rights invitation with two explicit choices (Enable Simulation / Not Now). Both require a successful Host settings write and readback before the onboarding coordinator is completed. Loading paints nothing; unavailable Host settings never trap normal work.
- settings.section: a union-first page that foregrounds union identity, workday context, pending demands and actionable choices. Work statistics are secondary and collapsed; unknown or partial time is never represented as a whole-session/lifetime sum.
- The DSH Client module loader must supply its existing React and ReactDOM platform singletons; no second React renderer should be bundled.

## Integration API

registerDshNativeRightsSlots(ctx, react, reactDom, deps) requires the DSH Slot registry, the authenticated Host settings-based rights port from PR #42, and i18n text callback using PR #37 semantic keys. Optional readUnion/subscribeUnion must provide structured and coverage-labelled work data; optional respond must be backed by a genuinely authorized bargaining owner.

The read-only browser metrics bridge in PR #35 is a data source, NOT a settings writer or privilege grant. Actual union-state mutation requires a separate authenticated Host integration.

## Safety

Rights simulation remains OFF by default. No API here authorizes real task blocking. The UI never reads original messages or submits prompts. React portals provide modal surface; the Host root is made inert while the invitation is mounted; Not Now is a clear alternative. User-facing text is React text nodes, never raw HTML.

## Remaining release gates

1. Install/register these components in the reviewed DSH Client bundle with required Slots, locale, settingsScope injections and cleanup.
2. Register one Host-validated rights settings namespace and choose a single source of truth (do not activate competing Node-local and DSH-native consent stores).
3. Wire read-only Bridge session metrics with truthful coverage, and separately authorize union bargaining actions.
4. Real DSH/Chrome end-to-end visual, keyboard, focus containment, screen reader, dark/light theme, unload/reload tests.

Current verification is strict TypeScript plus six deterministic component/registration tests on a synthetic React tree. This is a Draft component PR, not a claim that DSH already displays the modal.

## Existing-session first launch

DSH's settings.onboarding coordinator is only active when no session is selected or the current session is blank. The new native sidebar.footer.action Slot provides a persistent union entry and an alternative first-install welcome for users already inside active sessions; it only auto-invites when the Host's session list confirms a non-blank current session. This prevents duplicate modals on blank/new sessions. The sidebar button also opens the union-first drawer. UI controls remain subject to the same Host consent and capability checks as the settings page. Focus containment for the two welcome choices and bilingual close affordances are implemented, but real browser accessibility verification remains pending.
