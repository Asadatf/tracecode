# Architecture decision records

One file per decision that has real trade-offs or would surprise someone
reading the code later: `NNNN-short-title.md`, numbered in order, never
renumbered. Copy `0000-template.md`.

An ADR is never edited to change its decision. To reverse one, write a
new ADR that supersedes it and set the old one's status to
`Superseded by NNNN`.

| ADR                                                           | Title                                                          | Status                                          |
| ------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------- |
| [0001](0001-in-browser-python-execution.md)                   | Run and trace code in the browser                              | Accepted                                        |
| [0002](0002-self-host-pyodide.md)                             | Self-host the Pyodide runtime                                  | Accepted                                        |
| [0003](0003-browser-ast-and-cached-recommendations.md)        | Browser-side AST analysis and cached recommendations           | Accepted (Umair; signed off by Asad 2026-11-04) |
| [0004](0004-unified-learning-notifications.md)                | Unified learning notifications (in-app + email, one scheduler) | Accepted (Umair; signed off by Asad 2026-11-04) |
| [0005](0005-tracy-provider-adapter-streaming-session-chat.md) | Tracy: provider adapter, NDJSON streaming, session-only chats  | Accepted (Umair; signed off by Asad 2026-11-04) |
