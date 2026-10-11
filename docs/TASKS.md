# Tasks

Every piece of work for the 6 weeks, in build order. Built from the WBS sheet, the Gantt
sheet and the product backlog, with the owners from the team sheet.

How to read a row:

- WBS is the code from the work breakdown structure.
- Story is the backlog ID, so the backlog spreadsheet and the repository stay in step.
- Done check is what someone else can look at to agree it is finished. The full definition
  of done is in `PLAN.md` section 6.

Update the Status column in the backlog spreadsheet, not here. This file is the list of
work and the explanation of each step, not the live tracker.

Week 1 starts Monday 2026-10-12.

---

## 1 Project management, weeks 1 to 6

### 1.1 Progress tracking, weeks 1 to 6, Keshan

Deliverable: weekly progress notes and an up to date Gantt chart.

| WBS | Task | Why it matters | Done check |
|---|---|---|---|
| 1.1.1 | Weekly team meeting and progress check | 6 people in 2 stacks go out of step within days. 1 fixed meeting catches it | A dated entry in `docs/WORKLOG.md` every week |
| 1.1.2 | Update the Gantt chart and Workload sheet | Moving work between weeks is only useful if the sheet shows it | The Gantt sheet matches reality at the end of each week |
| 1.1.3 | Track risks and blocked work, agree fixes | A blocked member loses days quietly unless it is written down | `docs/RISKS.md` reviewed weekly, blockers appear in the worklog |

### 1.2 Quality and approvals, weeks 2 to 5, Keshan

Deliverable: reviewed code in `main` and approved costs.

| WBS | Task | Why it matters | Done check |
|---|---|---|---|
| 1.2.1 | Review and merge pull requests | `main` must always run, because everyone branches from it | Every merge into `main` came through a reviewed pull request |
| 1.2.2 | Get approval for hosting or domain cost before deployment, week 5 | Nothing is purchased without written approval. Week 6 deployment depends on it | Decision D3 has a dated entry in the `PLAN.md` log |

---

## 2 Setup and design, week 1

Everybody works in week 1. Nothing in week 2 can start cleanly without this.

### 2.1 Project setup, week 1

Story PB-01. Deliverable: shared repository and a working local setup for all 6 members.

| WBS | Task | Owner | Why it matters | Done check |
|---|---|---|---|---|
| 2.1.1 | Create the repository with `backend` and `frontend` folders | Keshan | 1 repository per product. Parallel work needs the boundaries to exist first | Repository has both folders and the documented layout |
| 2.1.2 | Add `.gitignore`, `.env.example` and the coding rules | Keshan | Stops a secret or a virtualenv reaching the history on day 1, which is painful to undo | `.env.example` lists every variable name with no real values, rules are in `README.md` and `CLAUDE.md` |
| 2.1.3 | Install PostgreSQL and Redis on every member's machine | All | A member who cannot run the stack loses days in week 2 | All 6 confirm the steps in `docs/SETUP.md` work on their machine |
| 2.1.4 | Create the React project with Vite and basic page routing |  | Both frontend members build different screens in the same app from week 2 | The app starts and routes between placeholder host, join and big screen pages |

### 2.2 Technical and screen design, week 1

Deliverable: database design, message list, AI format, wireframes and test plan.

| WBS | Task | Owner | Why it matters | Done check |
|---|---|---|---|---|
| 2.2.1 | Database tables for hosts, materials, pages, quizzes, questions, sessions, participants, answers and flags |  | 3 backend members write against these tables at the same time | `docs/DATA_MODEL.md` agreed by the team |
| 2.2.2 | WebSocket message list: join, start, question, answer, reveal, leaderboard |  | It is the contract between backend and frontend, who build in parallel | `docs/WEBSOCKET_PROTOCOL.md` agreed by both sides |
| 2.2.3 | AI prompt and JSON output format, tested on 3 sample PDFs with Ollama |    | Validation rules depend on the exact shape. Testing on real PDFs first avoids rewriting the parser in week 3 | Format recorded in `docs/AI_PIPELINE.md`, 3 sample runs reviewed |
| 2.2.4 | Wireframes: host login, dashboard, upload and question review |    | Prevents rebuilding host screens in week 3 | Wireframes shared with the team and linked from the worklog |
| 2.2.5 | Wireframes: join page, answer screen and host big screen |    | The phone screen is the one that must work on a weak connection and a small display | Wireframes shared with the team and linked from the worklog |
| 2.2.6 | Test plan: test cases for each of the 8 MVP features |    | Writing the cases before the features exist is what makes week 5 possible | `docs/TEST_STRATEGY.md` plus the case list, reviewed by the team |

---

## 3 Backend, weeks 2 to 4

### 3.1 Host accounts, week 2,  

Stories PB-02, PB-03. Deliverable: working register and login API.

| WBS | Task | Why it matters | Done check |
|---|---|---|---|
| 3.1.1 | Register and login API with hashed passwords | Everything a host owns hangs off this. Passwords are never stored as plain text | Email is unique, password is stored hashed, invalid input gives a clear error |
| 3.1.2 | Token check on all host only routes | Without it any person could read or change another host's quizzes | A host route with no valid token is refused, and logout ends the session |

### 3.2 PDF upload and text extraction, week 2,   

Stories PB-04, PB-05. Deliverable: uploaded PDFs stored as text per page.

| WBS | Task | Why it matters | Done check |
|---|---|---|---|
| 3.2.1 | Upload API with file type and size check | An unchecked upload endpoint is the easiest thing in the product to abuse | Only PDFs are accepted, oversized files are refused with a message |
| 3.2.2 | Extract text per page with pdfplumber and save it with page numbers | The page number is the whole basis of source linking | Each page is stored with its number and its text |
| 3.2.3 | Detect pages with no text and log them as skipped | A host must know if half their material was unreadable | Skipped pages are listed to the host and written to the log |

### 3.3 AI question generation, weeks 2 to 3,   

Stories PB-06 to PB-09. Deliverable: validated questions with source page and snippet.

| WBS | Task | Why it matters | Done check |
|---|---|---|---|
| 3.3.1 | AI interface with Gemini and Ollama, chosen by an environment variable, week 2 | Development runs free on Ollama, demos run on Gemini, and neither choice is baked into the code | Both providers return the same question shape, the key is read from the environment |
| 3.3.2 | Timeout, retry limit and backoff on rate limit errors, week 3 | A hanging call during a class is a failed demo. This is a repository rule, not a preference | Every call has a timeout, rate limit errors back off up to a set limit |
| 3.3.3 | Validate output: 4 options, 1 correct answer, snippet found in the page text, week 3 | The snippet check is what stops an invented answer reaching a classroom | Every rejection rule in `docs/AI_PIPELINE.md` is enforced |
| 3.3.4 | Log what was sent, what came back and what was rejected, week 3 | Without it nobody can explain why a question is missing | Log holds file and page range, the response, and each rejection reason |

### 3.4 Questions API, week 3,  

Stories PB-10 to PB-13. Deliverable: save, edit and import questions.

| WBS | Task | Why it matters | Done check |
|---|---|---|---|
| 3.4.1 | Save, edit, delete and regenerate questions | The host review step is the main defence against a bad question | Regenerate replaces 1 question only, the source page stays visible |
| 3.4.2 | Add a question manually | Hosts already have question sets and will not retype them | A manual question needs 4 options and 1 correct answer, the source note is optional |
| 3.4.3 | CSV import with a fixed template and a list of rejected rows | Bulk import without a clear rejection list produces silent data loss | Valid rows import, invalid rows are listed with the reason |

### 3.5 Rooms and live play, weeks 2 to 4, Keshan

Stories PB-14 to PB-21. Deliverable: a live game with timer, scoring and leaderboard.

| WBS | Task | Why it matters | Done check |
|---|---|---|---|
| 3.5.1 | Create a room with a 6 digit code, join link and QR code, week 2 | Joining in seconds is the expected standard. The QR is generated locally, with no external service | Code is unique, link and QR work from a phone |
| 3.5.2 | Lobby: participants join with a display name only, week 2 | No account is the reason a class of 30 can join in under a minute | A duplicate name is rejected, a wrong code gives an error |
| 3.5.3 | Send each question and timer to all devices over WebSockets, week 3 | Every screen must show the question at the same moment or the speed score is unfair | 1 broadcast per question, the host controls the pace |
| 3.5.4 | Server side answer timing and scoring, week 3 | Timing on the device can be changed by the participant | Time is measured on the server, the formula matches `docs/SCORING.md` |
| 3.5.5 | Leaderboard after each question, tie broken by average answer time, week 4 | The leaderboard is what keeps the room in the game | Big screen shows the top 10, each phone shows its own rank |
| 3.5.6 | Reconnect: rejoin the same seat with the same name and code, week 4 | School internet drops. Losing a score mid game ends the session for that person | Rejoining keeps the score, missed questions score 0 |

### 3.6 Challenge button and gap report, week 4,   and   

Stories PB-23 to PB-25, PB-27. Deliverable: flag and void working, gap report data.

| WBS | Task | Owner | Why it matters | Done check |
|---|---|---|---|---|
| 3.6.1 | Flag API, void a question and remove its points for everyone |   | This is the trust feature. It is what makes AI questions acceptable in a classroom | 1 flag per person per question, voiding removes the points and recalculates the leaderboard |
| 3.6.2 | Gap report: wrong answers grouped by source page |    | The main reason a teacher comes back a second time | Percent wrong per source page, sorted worst first, no source grouped separately |
| 3.6.3 | List of flagged questions for the host after the game |   | The host fixes the question for next time instead of hitting it again | Each flagged question is listed with its flag count and opens in edit mode |

---

## 4 Frontend, weeks 2 to 4

### 4.1 Host screens, weeks 2 to 4,   

Stories PB-02, PB-03, PB-04, PB-10 to PB-13, PB-25 to PB-27.
Deliverable: all host pages working against the backend.

| WBS | Task | Why it matters | Done check |
|---|---|---|---|
| 4.1.1 | Login and register pages, week 2 | First screen a teacher sees | Errors are readable, the token is stored and used |
| 4.1.2 | Dashboard and PDF upload page with progress, week 2 | A long upload with no progress looks broken and gets cancelled | Upload shows progress, the dashboard lists title, question count and date |
| 4.1.3 | Question review page: edit, delete, regenerate, show the source page, week 3 | The host review step only works if checking a question is fast | The source page and snippet are visible while editing |
| 4.1.4 | Manual add and CSV import page, week 3 | Covers hosts who already have questions | Rejected CSV rows are shown with the reason |
| 4.1.5 | Gap report, flagged questions and final results page, week 4 | The output the teacher actually keeps | Gap report sorted worst first, flagged list opens a question for editing |

### 4.2 Participant and big screen, weeks 2 to 4,   

Stories PB-15, PB-18, PB-20, PB-22, PB-28, PB-30.
Deliverable: phone view and big screen working in a live game.

| WBS | Task | Why it matters | Done check |
|---|---|---|---|
| 4.2.1 | Join page: enter a code or open the link from the QR, week 2 | If joining is slow, the lesson time is gone before the quiz starts | Both routes work on a phone, errors are clear |
| 4.2.2 | Answer screen with 4 buttons and a timer, week 2 | The screen that 30 people use at once on small displays | 1 answer only, the answer locks on tap, buttons disable when time ends |
| 4.2.3 | Big screen lobby showing the code, QR and joined names, week 3 | The room needs 1 shared surface to gather around | Names appear live as people join |
| 4.2.4 | Big screen question, timer and reveal with the source snippet, week 3 | Showing the snippet is the product. Participants learn why the answer is right | Correct option highlighted, distribution and snippet shown |
| 4.2.5 | Leaderboard view and challenge button, week 4 | Flagging has to be 1 tap during the reveal or nobody uses it | Flag is available during the reveal only, 1 per person per question |
| 4.2.6 | Test on phone browsers and a slow network, week 4 | The MVP is a web app for phone browsers, so this is a feature, not a nicety | Tested on Chrome for Android and Safari for iPhone, and on a slowed connection |

---

## 5 Testing, weeks 2 to 6,   

Testing runs alongside the build, not after it. Details in `docs/TEST_STRATEGY.md`.

### 5.1 Unit and API tests, weeks 2 to 4

Story PB-29. Deliverable: automated tests for scoring, validation and the APIs.

| WBS | Task | Why it matters | Done check |
|---|---|---|---|
| 5.1.1 | Unit tests for the scoring formula, week 2 | Scoring is pure arithmetic and the one thing a player will dispute | Every case in `docs/SCORING.md` section 6 passes |
| 5.1.2 | Unit tests for AI question validation, week 3 | Validation is the safety net for AI errors, so it needs its own net | Every rejection rule has a failing example and a passing one |
| 5.1.3 | API tests for login, upload, questions and CSV import, week 4 | These 4 carry the data a host cares about | Success and failure paths both tested, including an unauthorised request |

### 5.2 System tests and bug fixing, weeks 5 to 6

Stories PB-30, PB-31. Deliverable: a tested MVP with known bugs fixed.

| WBS | Task | Why it matters | Done check |
|---|---|---|---|
| 5.2.1 | Full game test: upload, generate, play, reveal, gap report, week 5 | The features pass separately and still fail together | 1 run end to end with real material and several devices, written up |
| 5.2.2 | Load test with 30 or more devices in 1 room, week 5 | A class is 30 people. A room that lags at 30 is not usable | 30 or more devices in 1 room, no dropped players |
| 5.2.3 | Review logs: attempted, returned and skipped, week 5 | The logs are the only evidence of what the AI did | Logs reviewed and gaps raised as bugs |
| 5.2.4 | Fix bugs found in testing, weeks 5 to 6 | Week 6 has a trial with real people in it | Every bug is fixed, or deferred with a reason in the worklog |

---

## 6 Release, week 6

### 6.1 Deployment and trial, week 6, Keshan

Stories PB-31, PB-33. Deliverable: a live MVP and trial feedback.

| WBS | Task | Why it matters | Done check |
|---|---|---|---|
| 6.1.1 | Deploy to hosting, only after the cost is approved | Nothing is purchased without approval. Decision D3 | Deployed with all secrets from environment variables |
| 6.1.2 | Trial session with 1 class and 1 study group | Both user types from the proposal, tested with real people | 1 session each, run and observed |
| 6.1.3 | Collect feedback from the trial | Decides what goes into version 2 | Written feedback from both sessions |

### 6.2 Documentation and closing, week 6,   

Story PB-32, and the version 2 list.

| WBS | Task | Why it matters | Done check |
|---|---|---|---|
| 6.2.1 | User guide for teachers and students | A teacher must run their first quiz without us in the room | `docs/USER_GUIDE.md` covers upload, review, room, live play and gap report |
| 6.2.2 | Final report and version 2 plan | Closes the project and carries the backlog forward | Report written, version 2 items confirmed in the backlog |
| 6.2.3 | Final demo and presentation | The project is assessed on it | Demo delivered |

---

## Deferred

PB-34, automatic deletion of old uploads and results, is a Could and is not scheduled in
the 6 weeks. The retention period itself is decision D4 and must still be agreed before
the trial. Until the automatic deletion exists, somebody owns deleting trial data by hand.

PB-35 to PB-47 are version 2: follow up packs, self paced mode, history across quizzes,
study group uploads, confidence wager, streaks, team mode, participant written questions,
OCR and other file types, shuffled options, more question types, local languages and
tournaments. Do not start any of them during the 6 weeks.
