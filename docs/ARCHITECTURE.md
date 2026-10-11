# Architecture

Source: section 7 of the MVP proposal. Update this file by pull request when a choice
changes, and record the reason in `docs/decisions`.

## 1. Shape of the system

3 user facing surfaces, 1 backend, 2 data stores, 1 AI provider behind 1 interface.

- Host dashboard, in the browser. Login, upload, question review, reports.
- Host big screen, in the browser. Join code and QR, current question, reveal, leaderboard.
- Participant view, in a phone browser. Join, 4 answer buttons, timer, own rank, flag button.
- Backend, 1 FastAPI application serving both the HTTP API and the WebSocket rooms.
- PostgreSQL for everything that must survive the session.
- Redis for live room state while a session is running.
- AI provider, either Gemini or a local Ollama model, selected by an environment variable.

The browser talks to the backend over HTTP for everything outside a live game, and over a
WebSocket for everything inside one.

## 2. Component choices

| Part | Choice | Reason |
|---|---|---|
| Backend API | Python with FastAPI | Team standard is Python. 1 application serves async HTTP and WebSockets together |
| Live rooms | FastAPI WebSockets | Push the question, the timer state and the leaderboard to every device at the same time |
| Live room state | Redis | Fast shared state for who joined, the current question and answers received. Lets the backend run more than 1 process later |
| Stored data | PostgreSQL | Hosts, materials, quizzes, questions, sessions, answers and flags |
| PDF text | pdfplumber | Extracts text with page numbers, which source linking depends on |
| QR codes | qrcode, a Python library | Generates the join QR from the join link with no external service and no data leaving the server |
| AI provider | Gemini or Ollama | Both behind 1 interface, selected by an environment variable. See `AI_PIPELINE.md` |
| Frontend | React with Vite | 3 screens, fast local rebuilds. Confirmation is open decision D1 in `PLAN.md` |

## 3. Backend folder layout and what belongs where

| Folder | Holds | Does not hold |
|---|---|---|
| `app/api` | HTTP route handlers, request validation, response shaping | Business rules, database queries |
| `app/core` | Settings read from the environment, logging setup, password hashing and token helpers | Feature logic |
| `app/db` | Database connection, session handling, migrations | Table definitions |
| `app/models` | Database tables | Request shapes |
| `app/schemas` | Request and response shapes for the API and the WebSocket messages | Database tables |
| `app/services` | The real work: pdf extraction, ai generation and validation, scoring, reports, csv import | HTTP concerns |
| `app/ws` | Connection handling, room membership, broadcast, the live game loop | Scoring arithmetic, which lives in services so it can be unit tested without a socket |

The rule that matters: a route handler should read like a short list of calls into
`app/services`. Anything worth testing lives in a service and is tested without HTTP.

## 4. Frontend folder layout

| Folder | Holds |
|---|---|
| `src/pages` | 1 file per screen: login, register, dashboard, upload, review, reports, join, play, big screen |
| `src/components` | Reusable pieces shared by more than 1 page |
| `src/hooks` | Shared behaviour, including the WebSocket connection and the countdown timer |
| `src/lib` | API client, WebSocket client, formatting helpers |
| `src/styles` | Shared styling |

## 5. Where state lives during a live game

| State | Store | Why |
|---|---|---|
| Hosts, quizzes, questions, material pages | PostgreSQL | Must survive and be reused |
| Who is in the room right now, current question index, question start time, answers received so far, connection to seat mapping | Redis | Read and written on every answer from every device. Expires when the session ends |
| Final answers, points, flags, session result | PostgreSQL, written as the session progresses | The gap report and the final results are built from these |

Answer timing is measured on the server from the moment the question was sent. A device
clock is never trusted. See `SCORING.md`.

## 6. Request paths

### Creating a quiz

The host uploads a PDF over HTTP. The backend checks the file type and size, extracts text
page by page, stores each page with its number, and marks pages with almost no text as
skipped. The host then asks for a number of questions between 5 and 30. The AI service
chunks the pages, calls the provider in batches, validates every returned question against
`AI_PIPELINE.md`, and stores the ones that pass with their page number and snippet.
Rejected ones are logged with the reason and never shown. The host reviews, edits, deletes
or regenerates, then saves the quiz.

### Running a session

The host creates a session from a saved quiz. The backend generates a 6 digit join code,
a join link and a QR image, and opens the room in Redis. Participants connect over the
WebSocket with the code and a display name and appear in the lobby. The host starts the
quiz. For each question the backend records the send time, broadcasts the question and the
time limit, accepts 1 answer per participant, locks when the timer ends or everyone has
answered, scores on the server, broadcasts the reveal with the correct option, the answer
distribution and the source snippet, accepts flags during the reveal, then broadcasts the
leaderboard. The host moves to the next question.

### After a session

Final rankings and per question results come from the stored answers. The gap report groups
wrong answers by the source page of the question and sorts worst first. Questions with no
source are grouped as No source. Voided questions are excluded from scores and marked in
the report.

## 7. Failure behaviour

| Failure | What the system does |
|---|---|
| AI call times out or is rate limited | Retry up to the configured limit with backoff, then return the questions that did succeed and tell the host how many failed |
| A PDF page has almost no text | Mark the page as skipped, log it, and show the host the list of skipped pages |
| A participant loses connection | They rejoin with the same code and name, take the same seat and keep their score. Questions missed while away score 0 |
| Redis is unavailable | A live session cannot start. Fail loudly at session creation rather than mid game |
| A question is voided | Its points are removed for everyone and the leaderboard is recalculated |

## 8. Deployment

Local for all of weeks 1 to 5: PostgreSQL, Redis and Ollama on the developer machine,
Gemini free tier for demos only. Hosting in week 6 happens only after the cost is approved,
which is open decision D3 in `PLAN.md`. All secrets come from environment variables in
every environment.

## 9. Not in the MVP

No OCR, no slide or Word uploads, no background job queue, no multi process scaling, no
mobile apps, no question types other than multiple choice. Redis was chosen partly so that
running more than 1 backend process later does not need a rewrite.
