# Repository rules

Applies to every person and every AI agent working in this repository.
Read this file, then `PLAN.md`, then `docs/TASKS.md` before making any change.

## 1. No AI attribution anywhere

This is a hard rule and it has no exceptions.

Do not add any of the following to anything in this repository:

- `Co-Authored-By` lines naming an AI, an assistant or a model
- "Generated with", "Created by", "Written with" or any similar credit line
- Any mention of Claude, Claude Code, Copilot, ChatGPT, Gemini, an LLM or an AI assistant
- AI badges, footers, banners or links in the README, the docs or the user interface
- Comments such as "AI generated", "added by assistant" or "as suggested by the model"

This covers commit messages, pull request titles and bodies, issue text, code comments,
documentation, config files, test names and release notes.

The work is the team's work. It is recorded under the name of the team member who
submits it. If a tool tries to append attribution automatically, remove it before
committing.

Separate point, do not confuse the two: question records in the database have an
`origin` field with the value `ai` or `manual`. That field is a product feature from
the proposal and it stays. The ban above is about crediting tools in our own work.

## 2. Product facts an agent must not invent

- The MVP is the 8 features listed in `PLAN.md`. Nothing else ships in 6 weeks.
- The scoring formula lives in `docs/SCORING.md`. Do not restate it from memory.
- The database tables live in `docs/DATA_MODEL.md`.
- The WebSocket messages live in `docs/WEBSOCKET_PROTOCOL.md`. Backend and frontend
  are built in parallel against that file, so change it by pull request, never in place.
- Never invent a figure, a source, a competitor or a quote. If something is unverified,
  write that it is unverified.

## 3. Stack

- Backend is Python with FastAPI. PostgreSQL for stored data, Redis for live room state.
- Frontend is React with Vite.
- 1 repository for the product, with `backend` and `frontend` folders.
- Do not add a dependency to solve something the standard library or an existing
  dependency already solves. Ask before adding any paid service, API or trial.

## 4. Code rules

- Small readable functions, 1 clear responsibility each.
- No secrets, keys, tokens, passwords or real user data in the repository. Everything
  sensitive is read from environment variables and listed by name in `.env.example`.
- Every network call has a timeout and a retry limit. Log what was tried, what came
  back and what was skipped.
- Validate all input that comes from a host, a participant or an AI response.
- Participant names, answers and results are never sent to the AI provider. Only the
  text of the host's uploaded material is sent, and only while a quiz is being created.
- Match the patterns already in the folder you are editing. Do not reformat or refactor
  unrelated code in the same change.

## 5. Writing style in this repository

- No em dashes and no en dashes. Use a comma, a full stop or a colon.
- Numerals, not words: write 6 digit code, 4 options, 30 devices.
- Plain language. No marketing tone, no filler, no emoji.
- British or international spelling, kept consistent with the file you are editing.

## 6. Process

- Every change belongs to a backlog item. Branch names and pull requests carry the
  backlog ID. See `CONTRIBUTING.md`.
- Decisions made in a chat or a call go into the decision log in `PLAN.md` the same day,
  with the date, who decided and why. A decision that is not in `PLAN.md` is not decided.
- Record weekly progress in `docs/WORKLOG.md`.
- Never claim that a test, a build or a check passed unless it was actually run. Report
  the real result.
