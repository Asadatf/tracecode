# 0002. Self-host the Pyodide runtime

Date: 2026-11-01
Status: Accepted (built in M1–M3; Umair and Asad, 2026-11-04)

## Context

ADR-0001 runs learner code with Pyodide in the browser. The engine loaded it
from jsDelivr's CDN on the first Run. The uncached download is ~14 MB; on a
slow connection it took ~34 s, past the engine's 30 s init timeout, so the
first Run failed with "Pyodide did not initialize" and the page looked stuck
on "Loading Python runtime…".

## Decision

- Pin `pyodide` (exact version) as an npm dependency. `scripts/copy-pyodide.mjs`
  runs on `postinstall` and copies the runtime files to
  `public/pyodide/v<version>/` (gitignored), served with a one-year immutable
  cache header. A unit test keeps the package version and `PYODIDE_VERSION`
  in step.
- Start loading Pyodide when a practice page opens, not on the first Run.
- Raise the init timeout from 30 s to 120 s; execution stays bounded by its
  own `timeoutMs`.

## Alternatives considered

- **Stay on the CDN, only preload + longer timeout** — fixes the symptom but
  keeps a third-party runtime dependency in the core loop (outages, blockers,
  school/corporate networks that filter CDNs).
- **Commit the files to the repo** — 14 MB of binaries in git history on
  every version bump.

## Consequences

- The core loop has no third-party origin; dev and preview load locally.
- Install copies ~14 MB into `public/`; Vercel serves it from its CDN.
- Upgrading Pyodide = bump the npm version and `PYODIDE_VERSION` together.
- Browser e2e tests now load Pyodide from the app server, not a blank page.
