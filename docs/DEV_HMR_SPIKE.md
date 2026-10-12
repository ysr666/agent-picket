# DSH developer reload spike (not a production HMR implementation)

`npm run dev:watch` watches Agent Picket source files, its two build scripts, and compiler/package configuration. It performs an initial production-equivalent build, then debounces edits and **serializes** subsequent builds, continuing after build errors. Unlike a bare `tsc --watch`, each successful cycle also rebuilds the DSH-compatible browser client factory and runs its import-graph checks. It requires no new dependency.

**This command does not hot-swap the browser UI.** A successful rebuild updates `dist/`; it does not establish that a running DSH Host re-reads a Client bundle or that an existing page re-runs a Client factory. Reload/restart the DSH development instance as required by that Host version. A browser refresh may still serve a cached Host client bundle; check that the new code is actually loaded rather than assuming success.

## Why we do not flip the Client to ESM

The current DSH Client expects `window.__ModuleLoader__.load({ id, factory })`; the React singleton and injected services are resolved through that module table. A plain `import`-based ESM build is **not** a drop-in replacement. Switching the package's published `./client` entry would break its documented runtime contract. The Host implementation and its ability to invalidate/reload client bundles must be verified separately.

## Next experiment (separate PR)

1. Establish a real DSH stable/preview Host matrix. Test whether a changed, rebuilt local Client is observed on fresh browser navigation and when its Host plugin fiber reloads; keep the existing packaged-client acceptance gate.
2. Prototype a **loopback-only, explicit opt-in** development notification transport with versioned build events, and a browser-only full-reload fallback. No remote-origin exposure, authentication bypass, production code path, or shell-controlled endpoint. This is *live reload*, not module-level HMR.
3. Only after Host behavior is verified, experiment with targeted Client module disposal/re-registration and React slot cleanup. Validate listener teardown, stores, duplicate registrations, in-flight writes, and multiple tabs. Do not assume a client factory can be re-executed safely.
4. If the upstream DSH team exposes a supported ESM/HMR seam, test it behind a development flag; preserve the current CJS factory packaging until all supported Host versions pass and a migration is planned.

The approach can later be shared with `dsh-computer-history` (tsdown-built React Client) and `dsh-vision-router` (additional HTML/script carrier deduplication), but they have different client ownership rules and must not receive automatic code rewrites.

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

An isolated real Chrome + DSH 0.2.0-rc.2 A→B→C experiment confirmed that the
Client factory was rerun twice (initial plus two replacements), one tab
navigation remained unchanged, an independent page-global marker survived,
and no browser JavaScript errors were captured. Other DSH versions and the
complete cross-platform matrix are separate acceptance gates.

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
