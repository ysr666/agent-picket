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
