# 0001. Run and trace code in the browser

Date: 2026-10-29
Status: Proposed

## Context

The core loop needs to run learner code against tests and record a
step-by-step trace (line, locals, loop iterations) of failing runs.
Running untrusted code on our own servers needs a real sandbox (containers,
resource limits) and costs money per run; a hackathon team on Vercel has
neither. Practice problems don't need tamper-proof grading.

## Decision

Python only in v1, executed with Pyodide inside a dedicated Web Worker in
the learner's browser. Tracing uses `sys.settrace` in that worker, capped
at a maximum step count; a wall-clock timeout terminates the worker to
stop infinite loops. Pyodide and the worker load lazily on the problem
page, never on initial render of other pages.

## Alternatives considered

- **Server-side sandbox (Judge0, Piston, own containers)** — real
  isolation and secure hidden tests, but hosting cost, latency, and a
  trace format we'd have to build anyway.
- **JavaScript via an in-browser interpreter (JS-Interpreter, Sval)** —
  lighter than Pyodide, but stepping semantics are less faithful and the
  target learners more often practise in Python.

## Consequences

- No execution infra or per-run cost; works offline once loaded.
- Pyodide is a ~10 MB first download on the problem page — show a loading
  state and cache it.
- Results are self-reported by the client, so "hidden" tests and pass
  status are not secure. Acceptable for practice; revisit for anything
  competitive or credentialed.
- Adding a second language means a second runner + tracer behind the same
  `RunResult` contract.
