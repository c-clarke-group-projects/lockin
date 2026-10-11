# Contributing

How work moves from the backlog into `main`. 6 people work in parallel from week 2, so
these rules exist to keep `main` runnable and the history readable.

## 1. Before you start

1. Pick a story from `docs/TASKS.md`. It has a backlog ID such as PB-14 and a WBS code
   such as 3.5.1.
2. Check it is yours for this week. If you want to take someone else's, say so in the
   team chat first and record the swap in `docs/WORKLOG.md`.
3. Set the backlog row to In progress.

## 2. Branches

`main` is protected. It must always run. Nobody pushes to it directly.

Branch off the latest `main`, 1 branch per story:

```
feat/PB-14-room-create
fix/PB-19-scoring-time
docs/PB-01-setup-notes
test/PB-29-scoring-unit
chore/PB-01-gitignore
```

Format: `type/BACKLOG-ID-short-description`.

Types: `feat`, `fix`, `docs`, `test`, `chore`, `refactor`.

Keep a branch alive for days, not weeks. If a story is too big to finish in a few days,
split it in the backlog first.

Delete your branch after the merge.

## 3. Commit messages

Conventional commits, with a scope:

```
feat(rooms): create room with 6 digit code and join link
fix(scoring): measure answer time on the server, not the device
test(ai): reject questions whose snippet is not in the page text
docs(protocol): add the reveal message fields
```

Rules:

- Subject in the imperative, lower case after the type, no full stop at the end, 72
  characters or fewer.
- Body optional. Use it to say why, not what. Wrap at 72 characters.
- Reference the backlog item in the body or the pull request: `Refs: PB-19`.
- Plain language, numerals rather than words, no em dashes or en dashes.
- No AI attribution of any kind. No `Co-Authored-By` naming a tool, no generated with
  footer, no mention of an assistant. See `CLAUDE.md` section 1.
- 1 logical change per commit. Do not mix a refactor into a feature commit.

## 4. Pull requests

- 1 pull request per backlog story. Open it against `main`.
- Title: `PB-19 server side scoring` or `PB-19 fix answer timing`.
- Fill in the template. A pull request with an empty checklist is not reviewed.
- Rebase on the latest `main` before asking for review. Fix your own conflicts.
- Keep it under roughly 400 changed lines where you can. A large pull request gets a
  slow review and hides bugs.

### Review

- Reviewer is Keshan, who owns code review on the team sheet. 1 approval is required.
- A pull request that touches login, tokens, scoring, flags and voiding, uploads or
  anything reading an environment variable must say so in the description. The reviewer
  checks the failure path as well as the success path.
- The author merges after approval, not the reviewer.
- Squash merge, so `main` carries 1 commit per story. The squash subject follows the
  commit rules above.

### Merge blockers

- Tests for the story do not pass.
- A secret, an API key, a password or real user data appears in the diff.
- A network call with no timeout or no retry limit.
- Unrelated files changed.
- AI attribution anywhere in the branch.

## 5. Tags and releases

- Tag `main` at the end of each week: `w1`, `w2`, `w3`, `w4`, `w5`, `w6`. The weekly demo
  point stays recoverable.
- Tag the week 6 release `v0.1.0-mvp`.

## 6. Things that need a decision first

Stop and ask in the weekly meeting, then record the outcome in the `PLAN.md` decision log,
before you:

- change `docs/WEBSOCKET_PROTOCOL.md`, because backend and frontend build against it
- change the scoring rules in `docs/SCORING.md`
- change a database table that another member is already using
- add a dependency, a paid service, an API or a trial
- rewrite shared history, force push, or delete a branch or tag that is not yours

## 7. History

Do not force push to `main`. Do not rewrite history on a branch that someone else has
pulled. Rebasing your own unpushed work is fine.
