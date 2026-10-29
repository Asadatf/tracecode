# Pull requests — write the description last, not first

**Don't write the PR title/description when you open the PR if the work
isn't actually done yet.** The failure mode this rule exists to stop: an
agent opens a PR early (to satisfy branch protection, or to get CI
feedback while iterating), writes a title and description describing what
it intends to do, then the branch evolves — more commits land, bugs get
found and fixed, scope shifts — and the description never gets updated.
The merged PR's description now describes the _first_ commit's intent, not
what actually shipped. That's the wrong context for a human reviewer, and
it's actively misleading for any AI (a future Claude Code Review pass, an
agent scanning PR history for context on why something exists) that reads
that description later and trusts it.

## The rule

- If the work is genuinely finished before you open the PR, write the real
  title/description immediately — normal case, nothing changes.
- If you need to open the PR before the work is done (branch protection
  requires a PR to exist to get CI signal, or you're iterating and want
  visibility), **open it as a draft** (`gh pr create --draft`) with a
  minimal title and no fabricated description — don't write final-sounding
  copy for work that isn't final. A one-line placeholder is fine.
- **Only write the real title and description once you've verified the
  work is actually done** — same bar as `docs/rules/commits.md`'s
  don't-over-commit rule: locally verified, `local-review` clean, nothing
  left to fix. At that point, mark it ready for review (`gh pr ready`) and
  write the description to reflect everything that actually happened
  across the whole branch — every commit, every fix, every scope change —
  not just what was true when the branch was created.
- If a PR was opened non-draft with an early description (e.g. before this
  rule existed, or a different agent didn't follow it) and more work
  landed afterward, treat rewriting the description as part of finishing
  the work, not optional cleanup — `gh pr edit --body "..."` before
  merging.

## Why draft specifically, not just "remember to update it later"

Draft is a real GitHub state, not a note-to-self that's easy to skip.
`.github/workflows/claude-code-review.yml` already gates on
`github.event.pull_request.draft == false` — a draft PR doesn't get an AI
review pass at all, so there's no wasted review run against a description
(or a diff) that's still changing. Marking the PR "ready for review" is
already the natural trigger point to also finalize the description — do
both in the same step, not as two separate things to remember.

## What "done" means here

Same definition as `docs/rules/commits.md`: locally verified with
`local-review`, not "I think this works." Don't mark a PR ready and write
its final description, then discover a bug and push another fix — that's
the over-committing pattern from `commits.md` happening to the PR
description specifically. If you do end up pushing after marking ready,
update the description again before merging; don't leave it describing an
earlier state of the branch.

## Screenshots

A pull request that changes what people see carries a `## Screenshots`
section in its description: the screen before the change and after it.
That way someone who doesn't read code sees the change without opening the app. A
change nobody sees (an API, a cron, a refactor, tests) leaves it out.

- Before and After of the same screen at the same size, Before first, from
  the running app: Before on `main` (or production), After on your branch.
  New UI shows the new screen, empty and filled.
- Start each image's alt text with "Before:" or "After:" and say what it
  shows.
- In the browser, drag the images into the description. An agent can't
  upload one, so it commits them on the PR branch under
  `.pr-screenshots/<topic>/` and links each at that commit:
  `https://github.com/<org>/<repo>/blob/<sha>/.pr-screenshots/<topic>/before.png?raw=1`.
  A link through a branch name breaks once the branch is deleted; one
  through a commit doesn't.
- Use one of those two kinds, a GitHub upload or a PNG, JPEG, GIF or
  WebP in this repo linked at a commit, and at most six.
- Add them before you merge.

```md
## Screenshots

| Before                                                                                                                                 | After                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| ![Before: the cards stacked in a narrow rail](https://github.com/your-org/your-repo/blob/<sha>/.pr-screenshots/cards/before.png?raw=1) | ![After: the cards in one row under the table](https://github.com/your-org/your-repo/blob/<sha>/.pr-screenshots/cards/after.png?raw=1) |
```
