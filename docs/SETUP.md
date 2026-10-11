# Local setup

WBS 2.1.3, week 1. Every member must get to the end of this file on their own machine
before week 2 starts. If a step does not work on yours, raise it in the team chat the same
day rather than working around it quietly, because the next person will hit it too.

There is no application code yet, so the last 2 sections cannot be completed until the
week 2 branches land. Finish sections 1 to 4 now.

## 1. What you need installed

| Tool | Version | Why |
|---|---|---|
| Python | 3.11 or newer | Backend |
| Node | 20 or newer | Frontend |
| PostgreSQL | 15 or newer | Stored data |
| Redis | 7 or newer | Live room state |
| Git | Any current version | |
| Ollama | Current | Local AI model for daily development, so nothing costs money |

On Windows, Redis runs through the Windows Subsystem for Linux or a container. Agree 1
approach in the team chat in week 1 so everyone debugs the same setup.

## 2. Get the repository

Clone the repository, then copy `.env.example` to `.env`. Fill in the database password,
the Redis URL and a value for `JWT_SECRET`. Leave `GEMINI_API_KEY` empty for now and keep
`AI_PROVIDER` set to `ollama`, because development runs on the local model.

`.env` is ignored by git. It must never be committed, and a real key must never be pasted
into `.env.example`, a chat message, an issue or a pull request.

## 3. PostgreSQL

Create an empty database for the project and a user that owns it. Put the connection
string into `DATABASE_URL` in your `.env`. Confirm you can connect with `psql` before
moving on. Each member runs their own local database, so nobody shares data and nobody can
break someone else's.

## 4. Redis

Start Redis and confirm it answers a `ping`. Put the address into `REDIS_URL`. A live
session cannot start without Redis, so if this step is skipped it surfaces later as a
confusing failure in week 3.

## 5. Ollama

Install Ollama, pull the model the team agreed in week 1, and confirm it answers a short
prompt. Put the model name into `OLLAMA_MODEL` and the address into `OLLAMA_BASE_URL`.

Gemini is for demos only. If you need it, ask first. The key goes in your own `.env` and
nowhere else.

## 6. Backend, from week 2

Create a virtual environment inside `backend`, install the dependencies from
`backend/requirements.txt`, run the database migrations, then start the development server.
The exact commands are added to this section with the first backend pull request, PB-01.

## 7. Frontend, from week 2

Install the dependencies in `frontend` and start the Vite development server. The exact
commands are added to this section with PB-01, once the Vite project exists.

## 8. Check it worked

When the week 2 code exists, you should be able to open the frontend in a browser, see the
host login page, and see the backend respond. Until then, finishing sections 1 to 5 and
reporting that you got there is the deliverable.

## 9. Common problems

| Problem | Likely cause |
|---|---|
| The backend cannot reach the database | `DATABASE_URL` points at the wrong port, or PostgreSQL is not running |
| A live session will not start | Redis is not running, or `REDIS_URL` is wrong |
| AI calls hang | Ollama is not running, or `OLLAMA_MODEL` names a model you have not pulled |
| A setting is ignored | The value is in `.env.example` instead of your own `.env` |
| Git wants to commit `.env` | Your `.gitignore` is out of date. Pull `main` |
