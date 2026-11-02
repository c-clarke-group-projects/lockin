# Backend

FastAPI service. Serves the HTTP API and WebSocket rooms from 1 application.
PostgreSQL stores data, Redis holds live room state.

The quiz list API is implemented in `app/api/quizzes.py`. The authentication dependency
currently returns 401 until host login is integrated. Design is in
`docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`, `docs/WEBSOCKET_PROTOCOL.md`,
`docs/AI_PIPELINE.md` and `docs/SCORING.md`.

## What belongs where

| Folder | Holds | Does not hold |
|---|---|---|
| `app/api` | HTTP route handlers, request validation, response shaping | Business rules, database queries |
| `app/core` | Settings read from the environment, logging setup, password hashing, token helpers | Feature logic |
| `app/db` | Database connection, session handling, migrations | Table definitions |
| `app/models` | Database tables | Request and response shapes |
| `app/schemas` | Request and response shapes for the API and the WebSocket messages | Database tables |
| `app/services` | The real work: pdf extraction, ai generation and validation, scoring, csv import, reports | HTTP concerns |
| `app/ws` | Connection handling, room membership, broadcast, the live game loop | Scoring arithmetic, which lives in `app/services` so it can be unit tested without a socket |
| `tests/unit` | No database, no network, no clock | |
| `tests/api` | Endpoints against a test database | |
| `tests/integration` | A live session driven through the WebSocket | |

The rule that matters: a route handler reads like a short list of calls into
`app/services`. Anything worth testing lives in a service and is tested without HTTP.

## Who owns what in weeks 2 to 4

| Area | Owner |
|---|---|
| Database, login, questions API, challenge flags |  |
| PDF extraction, AI question generation, gap report |  |
| Rooms, WebSockets, scoring, deployment | Keshan |

## Rules

- No secrets in the repository. Settings come from environment variables, listed by name
  in `.env.example` at the repository root.
- Every network call has a timeout and a retry limit, and logs what was tried, what came
  back and what was skipped.
- Small readable functions, 1 clear responsibility each.
- Validate everything that arrives from a host, a participant or an AI response.
- Never send participant names, answers or results to the AI provider.

## Running it

From this folder, install the dependencies, initialise the local database, and start the
API:

```powershell
python -m pip install -r requirements.txt
python -m app.db.init_db
uvicorn app.main:app --reload
```

`DATABASE_URL` must be set before initialising the database or using a database-backed
route. The API test suite uses an in-memory SQLite database and does not use this URL:

```powershell
pytest tests/api/test_quizzes.py
```

See `docs/SETUP.md` for local environment setup.
