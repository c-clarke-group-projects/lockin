## What this changes

1 or 2 sentences. Say why, not only what.

Backlog: PB-XX
WBS: X.X.X

## How it was tested

Say what you actually ran and what the result was. Do not write that tests pass unless you
ran them.

- [ ] Unit tests
- [ ] API tests
- [ ] Checked by hand in the browser
- [ ] Checked on a phone browser, if this touches a participant screen

## Checklist

- [ ] All acceptance criteria in the backlog row are met
- [ ] Tests for this story pass
- [ ] No secrets, API keys, passwords or real user data in the diff
- [ ] Every new network call has a timeout, a retry limit and logs
- [ ] No unrelated files changed
- [ ] Commit messages follow `CONTRIBUTING.md`
- [ ] No AI attribution anywhere in the branch
- [ ] Documentation updated if this changes the protocol, the data model, the scoring
      rules or the setup steps

## Sensitive areas

Tick anything this touches, so the reviewer checks the failure path as well as the success
path.

- [ ] Login, tokens or host only routes
- [ ] Scoring, ranking or voiding
- [ ] Uploads
- [ ] Flags
- [ ] Anything reading an environment variable
- [ ] The WebSocket protocol
- [ ] Database tables already in use by someone else

## Anything the reviewer should know

Open questions, known gaps, or anything deliberately left for a later story.
