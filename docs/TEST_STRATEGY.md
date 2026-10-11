# Test strategy

Source: WBS 5, backlog PB-29, PB-30, PB-31. Owner   , with every member writing tests
for the code they write.

Testing runs alongside the build from week 2, not after it. Week 5 is for system tests and
fixing, not for discovering that nothing was tested.

## 1. What is tested and how

| Layer | What it covers | When | Who |
|---|---|---|---|
| Unit | Pure logic with no database, no HTTP and no socket: the scoring formula, AI response validation, CSV row parsing, join code generation | Weeks 2 to 3 | The author of the code, with    |
| API | The HTTP endpoints with a test database: register, login, upload, questions, CSV import | Week 4 |    |
| Integration | 1 live session driven through the WebSocket: join, start, answer, reveal, flag, void, leaderboard, end | Week 4 to 5 | Keshan and    |
| Manual | Phone browsers, the big screen, a slow network, the full game run | Weeks 4 to 5 |   ,    |
| Load | 30 or more devices in 1 room | Week 5 | All |

## 2. Where test files live

```
backend/tests/unit/          no database, no network, fast, run on every change
backend/tests/api/           HTTP endpoints against a test database
backend/tests/integration/   a session driven through the WebSocket
frontend/tests/              component and page tests
```

Naming:

- A backend test file is named after the thing it tests: a test file for the scoring
  service sits in `backend/tests/unit` and carries the service name.
- A test name says the case and the expected result, for example that a correct answer at
  the exact time limit scores 500, or that a duplicate display name is refused.
- No test is named test 1, test 2 or similar.

## 3. Rules

1. Unit tests do not touch the database, the network or the clock. If a function needs the
   clock, the time is passed in so the test can set it.
2. API and integration tests use a separate test database that is reset between runs. They
   never run against a database holding real material or real results.
3. No test calls a real AI provider. The provider is replaced with a fixed response, which
   is the point of having both Gemini and Ollama behind 1 interface.
4. A test that fails intermittently is a bug, not noise. Fix it or delete it, do not retry
   around it.
5. Never weaken a check, skip a test or loosen a validation rule to make a build pass.
6. A bug found in week 5 gets a test that fails first, then the fix.

## 4. What must have a test before a merge

| Change | Required test |
|---|---|
| Scoring, ranking, tie break, void | Unit tests for every case in `docs/SCORING.md` section 6 |
| AI response validation | A failing example and a passing example for every rejection rule in `docs/AI_PIPELINE.md` |
| CSV import | A valid row, an invalid row, and the rejection list |
| Any host only endpoint | A request with no token and a request with another host's token, both refused |
| Upload | A non PDF, an oversized file, and a PDF with a page that has no text |
| Join | A wrong code, a duplicate display name, and a successful join |
| Reconnect | Rejoin keeps the score, and a question missed while away scores 0 |

A pull request that changes any of the above and adds no test is not merged.

## 5. Test cases for the 8 MVP features

This is WBS 2.2.6, written in week 1 before the features exist. 1 short list per feature,
each case written as: what the user does, what should happen.

1. Upload and generate. Text PDF, scanned PDF, oversized file, wrong file type, 5
   questions, 30 questions, a PDF where some pages are empty.
2. Add existing questions. Manual question with 4 options, a question missing an option,
   CSV with all valid rows, CSV with some invalid rows, CSV with the wrong columns.
3. Source tracking. Generated question shows the right page and a snippet that exists on
   that page, manual question with no source, manual question with a source note.
4. Rooms. Code is 6 digits, join by code, join by link, join by QR, wrong code, duplicate
   name, room that has ended.
5. Live play. Question appears on all screens together, 1 answer only, answer after the
   lock, everyone answers before the timer, nobody answers, host moves to the next
   question, host ends the quiz.
6. Reveal and challenge. Correct option highlighted, distribution shown, snippet shown,
   flag once, flag twice, host voids a question, leaderboard recalculated.
7. Gap report. Percent wrong per page, sorted worst first, questions with no source
   grouped separately, a voided question excluded.
8. Host accounts. Register, duplicate email, wrong password, token required on host pages,
   logout ends the session.

## 6. Full game test, week 5

1 run from start to finish with real material and several real devices: upload a PDF,
generate questions, review and edit, save the quiz, create a room, join from at least 3
phones, play every question, flag 1 question, void it, finish the quiz, open the gap
report and the flagged list. Write up what happened, including anything that felt slow or
confusing, not only what broke.

## 7. Load test, week 5

30 or more devices in 1 room. Success is no dropped players and no visible lag between the
question appearing on the big screen and on the phones. Record the device count, the
network used and the result. If it fails, the failure goes in `docs/RISKS.md` with an
owner before week 6.

## 8. Log review, week 5

The AI logs are the only record of what was attempted, what came back and what was
rejected. Read them after the full game test and raise anything unexplained as a bug.

## 9. Not covered

No automated browser tests, no visual regression tests, no security scanning tooling and
no performance profiling in the 6 weeks. Phone browser behaviour is checked by hand on
Chrome for Android and Safari for iPhone. If that turns out to be too thin, raise it in
the weekly meeting rather than adding a tool quietly.
