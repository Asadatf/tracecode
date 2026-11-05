# Architecture decision records

One file per decision that has real trade-offs or would surprise someone
reading the code later: `NNNN-short-title.md`, numbered in order, never
renumbered. Copy `0000-template.md`.

An ADR is never edited to change its decision. To reverse one, write a
new ADR that supersedes it and set the old one's status to
`Superseded by NNNN`.

| ADR                                                    | Title                                                                 | Status                                 |
| ------------------------------------------------------ | --------------------------------------------------------------------- | -------------------------------------- |
| [0001](0001-in-browser-python-execution.md)            | Run and trace code in the browser                                     | Proposed                               |
| [0002](0002-self-host-pyodide.md)                      | Self-host the Pyodide runtime                                         | Proposed                               |
| [0003](0003-browser-ast-and-cached-recommendations.md) | Browser-side AST analysis and cached recommendations                  | Accepted (Umair; no teammate sign-off) |
| [0004](0004-unified-learning-notifications.md)         | Unified learning notifications (in-app + email, one scheduler)        | Accepted (Umair; no teammate sign-off) |
| [0006](0006-spaced-review-schedule.md)                 | Spaced review: persisted per-problem 1 / 3 / 7 day schedule           | Accepted (Umair; no teammate sign-off) |
| [0007](0007-server-side-competitive-grading.md)        | Competitive grading: server-verified sandbox execution, behind a flag | Accepted (Umair; grading not enabled)  |
