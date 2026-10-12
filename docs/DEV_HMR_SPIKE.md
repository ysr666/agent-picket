# DSH Web Client development loop (build watch, Live Reload and HMR)

> **Status: implemented in `main` as of 2026-10-12; developer-only.**
> This is **native DSH Web plugin HMR**, not React Fast Refresh and not
> a change to the published plugin protocol.

`npm run dev:watch` watches Agent Picket source, relevant build scripts and
compiler settings. It serializes and debounces builds, keeps watching after
failures, and produces the existing DSH-compatible
`window.__ModuleLoader__.load({ id, factory })` Client entry. The watcher
compiles into a temporary staging directory and atomically publishes its
verified Client **last**; invalid TypeScript or an invalid browser factory
leaves the last-good `dist/` intact.

## Choose the development mode

| Mode | How to select | What changes |
| --- | --- | --- |
| Build only | `npm run dev:watch` | Rebuild artifacts; no browser is launched |
| Web full-page reload | Set the three `AGENT_PICKET_DEV_BROWSER_*` variables below (default `page` mode) | Refresh the private Chrome page after successful builds |
| Native DSH Web HMR | Additionally set `AGENT_PICKET_DEV_RELOAD_MODE=native-hmr` | DSH observes `client.js` and replaces the Client Cordis fiber without page navigation |

The optional browser controller first verifies that the isolated DSH Web
Host exposes both `@deepseek-ai/dsh-client-hmr` and the
`/plugins/events` SSE endpoint. Without this support, native mode **fails
explicitly**; use `AGENT_PICKET_DEV_RELOAD_MODE=page` to fall back.

**No replacement ESM loader is necessary.** Bare ESM imports are not a
drop-in replacement for DSH's existing Client factory and injected React
singletons. Native HMR reactivates the owning plugin fiber and **may reset its
React-local state**. Host-owned state and unrelated page state need not reset,
but Agent Picket Host changes still require a Host restart. Desktop HMR is
not supported by this workflow.

## Verified scope and remaining limits

- Isolated DSH 0.2.0-rc.2 Web, macOS, Chrome: actual Client factory A→B→C
  without page navigation; later 30 consecutive swaps with stable observed
  CSS node count and no JavaScript exceptions during valid updates.
- Isolated watcher-to-Web experiment: normal source edit hot-swapped, a
  deliberate invalid TypeScript edit did not change the running Client,
  and repairing the source allowed HMR again without page navigation.
- Build and regression gates: `npm run check`, plus GitHub Node 22.19 /
  Node 24 and macOS checks. These are **not** exhaustive proof of long-lived
  memory safety or every DSH stable/preview version.
- Separate Electron/Desktop support, plugin-local React state preservation,
  and full accessibility/UX sign-off remain out of scope. No release is
  implied by merging this developer tooling.

## Optional local Web live reload (stacked development experiment)

A private browser can now be launched after the initial successful build, and
reloaded after *each subsequent successful build*. This uses `puppeteer-core`
loaded from an **external developer tooling path**, an isolated Chrome profile,
and CDP **stdio pipe** instead of exposing a Chrome remote-debugging TCP port.
No script injection, browser HTTP server, DSH Host patch, or runtime dependency is
introduced. The browser URL must use HTTP on `localhost`, `127.0.0.1` or `::1`.

For an **isolated DSH Web profile** (never a normal personal DSH profile),
first load the Agent Picket plugin from this checkout's compiled `dist/`
entry (not a copied tarball or stale `node_modules/agent-picket` install).
This is essential: the running Host must serve the same Client file
that `dev:watch` rebuilds. Then set:

```sh
# Install puppeteer-core into a separate test/tooling directory if needed;
# this project deliberately does NOT bundle it.
export AGENT_PICKET_DEV_BROWSER_URL='http://127.0.0.1:PORT/'
export AGENT_PICKET_DEV_CHROME_BIN='/path/to/Chrome-or-Chromium'
export AGENT_PICKET_DEV_PUPPETEER_ENTRY='/absolute/path/to/puppeteer-core/entry.js'
npm run dev:watch
```

If your isolated DSH instance requires login, authenticate **inside the private
Chrome window**. A one-time token may be provided via the URL environment
variable if needed, but never paste it into a shared log or committed script.
The helper does not log the URL. An authenticated browser is still subject to
the Host's real permissions. The helper must not be exposed to public websites,
shared debugging ports or remote users. On Ctrl+C the private Chrome closes.
Set `AGENT_PICKET_DEV_HEADLESS=1` for noninteractive tests.

This is browser **full-page live reload**, not HMR. It resets in-memory React
state and requires a real DSH client reload; it does not promise that navigation
or login state persists. The DSH 0.2.0-rc.2 isolated Chrome A→B experiment
confirmed that a Client file change is visible on both same-tab refresh and a
new browser tab, without restart; other DSH/OS versions remain unverified.

## Native DSH HMR (opt-in, verified on 0.2.0-rc.2 Web)

The upstream DSH Web Host **already** implements module-level plugin HMR:
`@deepseek-ai/dsh-client-hmr` polls a rebuilt `client.js`, publishes
`/plugins/events` SSE frames, and asks the browser Client Modules controller
to replace the affected Cordis fiber. It is **not** React Fast Refresh:
component-local state in that plugin is reset; unrelated page state remains.
It is Web only and is not a supported Electron Desktop HMR path.

With an isolated DSH Web Host and the same-checkout Client artifact, set the
existing three `AGENT_PICKET_DEV_BROWSER_*` environment variables as above,
then opt in to native HMR:

```sh
export AGENT_PICKET_DEV_RELOAD_MODE='native-hmr'
npm run dev:watch
```

The helper checks that the DSH boot graph includes the upstream HMR plugin
and that `/plugins/events` is reachable as an SSE endpoint. On every build
it **does not reload the page**; the Host's own 500ms-default poll publishes
the completed Client update. A failed check closes private Chrome and reports
that native HMR is unavailable; use `AGENT_PICKET_DEV_RELOAD_MODE=page` as
the full-page fallback. Build-only mode can also work with any existing DSH
Web tab when native HMR is already present, without launching helper Chrome.

An isolated real Chrome + DSH 0.2.0-rc.2 A→B→C experiment confirmed
three factory invocations (initial plus two replacements), one initial page
navigation, surviving independent page state, and no unexpected browser
JavaScript errors. The follow-up 30-cycle and failed-compile tests are
summarized above; other Host versions and Desktop HMR are not certified.

## Failed builds must not invalidate a running Client

The normal `npm run build` intentionally deletes `dist/` before TypeScript
and browser factory packaging. During Web HMR development this is unsafe:
invalid TypeScript can leave `dist/adapters/dsh/client.js` as an unwrapped
intermediate file instead of the official `window.__ModuleLoader__.load()`
factory. DSH independently polls this artifact and can react before the
watcher's build-failed message. The **developer watcher only** therefore
compiles into a temporary directory under the checkout, assembles the Client
there, and publishes all siblings atomically with `client.js` **last**. If
compilation or factory assembly fails, the existing `dist/` is untouched.

Production `npm run build`, `prepack`, and the official package format remain
unchanged. Publication is not a disk-failure transaction; on a partial disk
write error do a clean rebuild. Do not assume Desktop Host code hot reloads.
