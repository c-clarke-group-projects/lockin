# PLAN

Product: Quiz and Competition Platform (repository name: lockin)
Plan version: 1
Created: 2026-10-10
Status: week 1, setup and design

Source documents, kept in `docs`:

- `quiz_platform_mvp_proposal.pdf`, version 1, October 2026
- `quiz_platform_wbs.xlsx`
- `quiz_platform_gantt_chart_6_weeks.xlsx`
- `quiz_platform_product_backlog.xlsx`, 47 stories, 34 in the MVP

If this file and a spreadsheet disagree, raise it in the weekly meeting and fix both.

## 1. What we are building

A live quiz platform for teachers and study groups. A host uploads their own study
material as a PDF, the platform generates multiple choice questions from it, and
participants join a live room by 6 digit code, link or QR with a display name only.

Every generated question stores the page number and the snippet it came from. The room
can flag a bad question during the reveal and the host can void it. After the quiz the
host gets a gap report showing which pages had the most wrong answers.

The part that is not already on the market is the trust loop: source linked answers,
the challenge button, and the gap report. Generating questions from a PDF, joining by
QR, a timer and a speed leaderboard are expected features, not differentiators.

## 2. MVP scope, the 8 features

1. Upload and generate. Text based PDF in, multiple choice questions with 4 options out.
2. Add existing questions. Manual entry and CSV import with a fixed template.
3. Source tracking. Page number and snippet stored on every generated question.
4. Rooms. 6 digit code, join link and QR code, display name only, no participant account.
5. Live play. Host controlled pace, timer per question, live leaderboard.
6. Reveal and challenge. Correct answer, answer distribution, source snippet, flag and void.
7. Gap report. Final rankings, per question results, pages with the most wrong answers.
8. Host accounts. Email and password login so quizzes and reports are saved.

### Out of scope for the MVP

Scanned PDF support with OCR, slide and Word uploads, personal follow up packs, study
group uploads, confidence wager, streak and comeback bonuses, team mode, self paced
homework mode, history across quizzes, question types other than multiple choice, local
language generation, tournaments, mobile apps. These are backlog items PB-35 to PB-47.

The MVP is a web app that works in a phone browser.

## 3. Team

| Name | Main area of work |
|---|---|
|  | Backend: live rooms, WebSockets, scoring, deployment, code review |
|  | Backend: PDF extraction, AI question generation, gap report |
|  | Backend: database, login, questions API, challenge flags |
|  | Frontend: host login, dashboard, question review, reports |
|  | Frontend: participant join and answer screens, host big screen |
|  | Testing, test plan, user guide, final report |

## 4. Timeline, 6 weeks

Week 1 starts Monday 2026-10-12, taken from the start date on the Gantt sheet.

| Week | Dates | Focus | Result at the end of the week |
|---|---|---|---|
| 1 | 2026-10-12 to 10-18 | Setup and design | Repository, local setup running for all 6, database design, WebSocket message list, AI format, wireframes, test plan |
| 2 | 2026-10-19 to 10-25 | Build starts | Host login, PDF upload and page text, AI interface, room create and lobby, join and answer screens |
| 3 | 2026-10-26 to 11-01 | Core features | Validation and logging, questions API, CSV import, live question flow and server side scoring, big screen |
| 4 | 2026-11-02 to 11-08 | Trust features | Leaderboard, reconnect, flag and void, gap report, reports pages. Milestone MS1, MVP features complete |
| 5 | 2026-11-09 to 11-15 | System testing | Full game test, 30 device load test, log review, bug fixing. Milestone MS2, ready for trial |
| 6 | 2026-11-16 to 11-22 | Release | Deploy after cost approval, trial session, feedback, user guide, final report, demo. Milestone MS3, project complete |

The proposal estimated an 8 week build and a 4 week pilot. This plan fits the build into
5 weeks and replaces the full pilot with 1 trial session in week 6. That is a deliberate
reduction, not an oversight.

## 5. Milestones

| ID | Milestone | Due |
|---|---|---|
| MS1 | MVP features complete | End of week 4, 2026-11-08 |
| MS2 | Testing complete, ready for trial | End of week 5, 2026-11-15 |
| MS3 | Project complete, demo delivered | End of week 6, 2026-11-22 |

## 6. Definition of done

A story is done when all of these are true:

- All acceptance criteria in the backlog row are met.
- Code is reviewed and merged into `main`.
- Tests for the story pass.
- No secrets, API keys or real user data in the repository.
- Every network call in the change has a timeout, a retry limit and logs.
- It works in a phone browser if it has a participant screen.

## 7. Risks

Full list with mitigations in `docs/RISKS.md`. The 3 that can stop the MVP:

1. AI writes wrong questions. Mitigated by host review, the snippet check in validation,
   the challenge button and the void and refund path.
2. Weak school internet during the trial. Mitigated by small WebSocket messages and
   rejoining the same seat with the same name and code.
3. Hosting cost is not approved in time for week 6. Mitigated by keeping the local
   setup fully working so the trial can run on a laptop on the same network.

## 8. Cost

Development runs at close to 0: PostgreSQL and Redis run locally, Ollama runs on a
developer machine, and the Gemini free tier is used for demos only. Hosting, a domain
and any paid AI usage each need approval before they are added. Nothing is purchased
without written approval.

## 9. Open decisions

These are from section 14 of the proposal. An item stays open until it has a dated entry
in the decision log below.

| # | Decision | Needed by | Owner |
|---|---|---|---|
| D1 | Confirm the frontend framework. React with Vite is proposed | Week 1 |  |
| D2 | Choose the AI provider for the trial: Gemini free tier, paid Gemini, or Ollama on a server | Week 5 |  |
| D3 | Approve or reject paid hosting, domain and AI cost | Week 5 |  |
| D4 | Set the retention period for uploaded files and session results | Before the trial |  |
| D5 | Choose a product name and check it is not already in use | Week 5 | Team |
| D6 | Find trial teachers and 1 study group | Week 5 |  |
| D7 | Confirm quiz deletion behaviour when a quiz has sessions | Before quiz deletion is merged | Team |

## 10. Decision log

Every decision from a chat, a call or a meeting goes here on the same day, with the date,
who decided and why. A decision that is not written here is not decided. Decisions with a
lasting technical effect also get a file in `docs/decisions`.

| Date | Decision | Decided by | Why | Link |
|---|---|---|---|---|
| 2026-10-10 | Repository structure is 1 repository with `backend` and `frontend` folders, documentation in `docs`, plan at the root | Keshan | Matches the proposal and the week 1 work package 2.1 | ADR-0001 |
| 2026-10-10 | No AI attribution of any kind in commits, pull requests, documentation or code | Keshan | The work is recorded under the team member who submits it | `CLAUDE.md` section 1 |
| 2026-10-26 | Proposed: reject quiz deletion with 409 when any session exists; otherwise delete the quiz and its questions | Team confirmation pending | Prevent session results from being removed silently; proposed for SCRUM-87 | D7, proposed |
