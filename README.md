# lockin

Live quiz platform that turns PDFs into source linked questions, with real time rooms,
scoring and a gap report. FastAPI, PostgreSQL, Redis, React.

A host uploads their own study material, the platform generates multiple choice questions
from it and stores the page and snippet each question came from. Participants join a live
room with a 6 digit code, a link or a QR and a display name only. After the quiz the host
gets a gap report showing which pages the room got wrong most often.

## Status

Week 1 of 6, setup and design. No application code yet. The folder structure, the plan and
the design documents are in place so that 6 people can start building in parallel.

## Repository layout

```
backend/         FastAPI service
  app/api/       HTTP route handlers
  app/core/      config, settings, logging, security helpers
  app/db/        database session and migrations
  app/models/    database tables
  app/schemas/   request and response shapes
  app/services/  business logic: pdf, ai, scoring, reports
  app/ws/        WebSocket rooms and live play
  tests/         unit, api and integration tests
frontend/        React application built with Vite
  src/pages/     host dashboard, big screen, participant view
  src/components/, src/hooks/, src/lib/, src/styles/
  tests/
docs/            plan documents, design documents and the source spreadsheets
.github/         pull request and issue templates
```

## Documents

| File | What it is for |
|---|---|
| `PLAN.md` | Scope, timeline, milestones, open decisions and the decision log |
| `CLAUDE.md` | Rules for everyone working in this repository, people and tools |
| `CONTRIBUTING.md` | Branching, commit messages, pull requests and review |
| `docs/TASKS.md` | Every task for the 6 weeks, with owner, week and done check |
| `docs/ARCHITECTURE.md` | Components and why each one was chosen |
| `docs/DATA_MODEL.md` | The 9 database tables |
| `docs/WEBSOCKET_PROTOCOL.md` | The live play message list |
| `docs/AI_PIPELINE.md` | How questions are generated and validated |
| `docs/SCORING.md` | The scoring formula, tie break and void rules |
| `docs/TEST_STRATEGY.md` | What is tested, where the tests live and what blocks a merge |
| `docs/SETUP.md` | Local setup for PostgreSQL, Redis, the backend and the frontend |
| `docs/WORKLOG.md` | Weekly progress notes |
| `docs/RISKS.md` | Risks and mitigations with an owner |
| `docs/decisions/` | 1 file per architecture decision |
| `docs/USER_GUIDE.md` | Guide for teachers and students, written in week 6 |

## Getting started

Read `docs/SETUP.md`. In short: install Python 3.11 or newer, Node 20 or newer,
PostgreSQL and Redis, copy `.env.example` to `.env` and fill it in, then start the
backend and the frontend.

## Rules that apply to every change

- No secrets, API keys or real user data in the repository. Everything sensitive comes
  from environment variables and is listed by name in `.env.example`.
- Every network call has a timeout and a retry limit, and logs what was tried, what came
  back and what was skipped.
- Small readable functions.
- No AI attribution in commits, pull requests, documentation or code. See `CLAUDE.md`.
- Writing style: no em dashes or en dashes, numerals rather than words, plain language.

## Privacy

Participants join with a display name only. No email or phone number is collected from
participants in the MVP. Participant names, answers and results are never sent to the AI
provider. Only the text of the host's uploaded material is sent, and only while a quiz is
being created.
