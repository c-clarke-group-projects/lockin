# Frontend

React application built with Vite. 3 surfaces in 1 app: the host dashboard, the host big
screen, and the participant phone view.

No application code yet. The Vite project is generated in week 1, WBS 2.1.4. The folders
exist so that both frontend members can work in parallel from week 2.

## What belongs where

| Folder | Holds |
|---|---|
| `src/pages` | 1 file per screen: login, register, dashboard, upload, review, reports, join, play, big screen |
| `src/components` | Pieces used by more than 1 page |
| `src/hooks` | Shared behaviour, including the WebSocket connection and the countdown timer |
| `src/lib` | API client, WebSocket client, formatting helpers |
| `src/styles` | Shared styling |
| `tests` | Component and page tests |

## Who owns what in weeks 2 to 4

| Area | Owner |
|---|---|
| Host login, dashboard, question review, reports |    |
| Participant join and answer screens, host big screen |    |

## Rules

- The participant view is a phone browser first. Design for a small screen on a weak
  connection, then let it grow for a laptop.
- Build against `docs/WEBSOCKET_PROTOCOL.md`. If a field you need is missing, raise it and
  change the document by pull request. Do not invent a message.
- The correct answer is never shown before the reveal, and never relied on from anything
  the browser already holds.
- Only values that are safe in a browser go in `VITE_` environment variables. No API key,
  no secret, ever.
- Errors shown to a user are readable: a wrong code, a duplicate name and a failed upload
  each say what to do next.
- Tested on Chrome for Android and Safari for iPhone before the week 4 merge.

## Running it

See `docs/SETUP.md`. The exact commands are added there once the Vite project exists.
