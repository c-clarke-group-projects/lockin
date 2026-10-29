# WebSocket protocol

Source: WBS 2.2.2, Jira SCRUM-17. Week 1 deliverable. Owner Keshan.

Status: version 2, proposed. To be agreed in the weekly meeting on 2026-10-26 with the
frontend owners who build against it: 0071 (shared WebSocket client, 10.7, and answer
screen), Tharindu (join page, big screen lobby, leaderboard view) and Dulanjana (big screen
reveal, host live controls). Section 8 lists what changed from version 1 and the 3 points
that need a decision recorded in `PLAN.md`.

Backend and frontend are built in parallel from week 2 against this list, so it is the
contract between them. Change it only by pull request, and tell both sides before merging.
A change here that is not announced will break someone else's branch.

## 1. Connection

- 1 WebSocket connection per device, at the path `/ws` on the backend. The frontend reads
  the base address from `VITE_WS_BASE_URL`.
- 3 roles connect: the host control screen, the host big screen, and a participant phone.
- A participant connects with the 6 digit join code and a display name. No account and no
  token.
- A host screen connects with its login token. The token travels inside the message, never
  in the address, so it does not end up in server or proxy logs.
- The first message on a new connection must be `join`, `rejoin` or `host_join`. Anything
  else is answered with the error `not_joined`.
- If the connection drops, the device reconnects with the same code and name and takes the
  same seat with the same score. Questions missed while away score 0. See section 6.
- Dropped connections are found with protocol level ping frames from the server, set in
  uvicorn. There is no application ping message.

## 2. Message envelope

Every message in both directions is 1 JSON object with the same 3 or 4 top level fields.

```json
{
  "type": "answer",
  "session_id": 42,
  "data": { "question_id": 7, "option": 2 }
}
```

| Field | Type | Rule |
|---|---|---|
| type | string | Required. 1 of the message names in sections 3 and 4 |
| session_id | integer or null | Required. The `sessions.id` from `docs/DATA_MODEL.md`. Null only on `join` and `rejoin`, where the device does not know it yet, and on an `error` sent before a session was found |
| token | string | Host messages only: `host_join`, `start`, `next`, `end`, `void`, `kick`. Absent on every other message |
| data | object | Required. The fields listed for that message. `{}` when there are none |

Naming rules:

- Field names are `snake_case`, matching the backend and the database columns.
- Ids are integers, the database ids.
- `option`, `correct_index` and `chosen_index` are 0 to 3, the position in the `options`
  array.
- Times are integers in milliseconds. A point in time is milliseconds since 1970 UTC on the
  server clock.
- `number` is the question position counted from 1, for showing "Question 3 of 10".

Size and validation:

- The server refuses any incoming message larger than 2 KB, any message that is not valid
  JSON, any unknown `type`, and any field of the wrong type, with the error `bad_message`.
  The connection stays open.
- Unknown extra fields are ignored, so a newer frontend does not break an older backend.

## 3. Messages from a device to the server

| Message | Sent by | data fields | Server does |
|---|---|---|---|
| join | Participant | `join_code`, `display_name` | Checks the code, rejects a name already used in the room, adds the participant to the lobby, replies `joined` and sends `lobby` to everyone |
| rejoin | Participant | `join_code`, `display_name` | Restores the same seat and score if that seat is disconnected, replies `joined`, then sends the current state, see section 6 |
| host_join | Host | `screen`, either `control` or `big_screen` | Checks the token and that this host owns the session, replies `host_joined`, then sends the current state |
| start | Host | none | Moves the session from waiting to running and sends the first `question` |
| answer | Participant | `question_id`, `option` | Records the answer once only, measures the time on the server, replies `ack`, sends `answer_count` to host screens. Anything after the lock is ignored |
| next | Host | none | Moves 1 step forward, see section 5: reveal to leaderboard, leaderboard to the next question, or to `ended` after the last question |
| end | Host | none | Ends the quiz early from any phase and sends `ended` |
| flag | Participant | `question_id`, `reason`, optional, up to 200 characters | Records 1 flag per person per question, during the reveal only. Replies `ack`, sends `flag_count` to host screens |
| void | Host | `question_id` | Removes that question's points for everyone, recalculates the leaderboard, sends `voided` |
| kick | Host | `participant_id` | Removes a participant from the lobby, in the waiting phase only. The removed phone gets the error `removed_by_host` and its connection is closed. Everyone gets `lobby` |
| leave | Participant or host | none | Marks the device as disconnected. The same happens without a message when the connection drops |

Display name rules, checked on `join`:

- Spaces at the start and end are removed. The result must be 1 to 20 characters.
- Names are compared without case, so `Amal` and `amal` cannot both join the same room.

## 4. Messages from the server to devices

| Message | Sent to | data fields |
|---|---|---|
| joined | The joining participant | `participant_id`, `display_name`, `quiz_title`, `score`, `rejoined` true or false |
| host_joined | The joining host screen | `screen`, `quiz_title`, `join_code`, `status` |
| lobby | Host screens and participants | `participants`, a list of `{participant_id, display_name}` in join order, and `count` |
| question | Everyone | `question_id`, `number`, `total`, `text`, `options` (4 strings), `time_limit_ms`, `remaining_ms`, `sent_at` |
| ack | 1 participant | `for`, either `answer` or `flag`, and `question_id` |
| answer_count | Host screens | `question_id`, `answered`, `connected` |
| locked | Everyone | `question_id`, `reason`, either `timer` or `all_answered` |
| reveal | Everyone | `question_id`, `correct_index`, `distribution` (4 counts, 1 per option), `no_answer` count, `source`. A participant also gets `you`: `{chosen_index, is_correct, points}` |
| flag_count | Host screens | `question_id`, `flags` |
| leaderboard | Everyone | `top`, a list of up to 10 `{rank, display_name, score}`, and `count`. A participant also gets `you`: `{rank, score}` |
| voided | Everyone | `question_id`, and the recalculated leaderboard in the same shape as `leaderboard` |
| ended | Everyone | `top` and `count` as in `leaderboard`, `reason`, either `finished` or `ended_by_host`. A participant also gets `you`: `{rank, score}` |
| error | 1 device | `code` from the list below, and `message`, a short sentence the user can read |

Field notes:

- `question` never carries the correct option. Rule 7 in section 7.
- `remaining_ms` equals `time_limit_ms` on the first broadcast. It is smaller only when the
  question is resent to a device that rejoined during the question.
- `source` is `{page_number, snippet}`. For a manual question `page_number` is null and
  `snippet` is the host's source note, or `source` is null when there is no note.
- Ranking and the tie break follow `docs/SCORING.md`. This file does not restate them.
- The full final ranking for every participant comes from the HTTP results API (8.4), not
  from `ended`, so the message stays small.

Error codes:

| code | When |
|---|---|
| room_not_found | No session has that join code |
| room_closed | The session has ended |
| room_full | The room is at its participant limit. The limit is a setting, its value is not yet agreed |
| name_invalid | The display name is empty or longer than 20 characters after trimming |
| name_taken | The display name is already used in the room, compared without case |
| seat_in_use | `rejoin` for a seat that is still connected |
| seat_not_found | `rejoin` with a name that never joined this room |
| unauthorised | A host message with a missing or invalid token, or a token for another host |
| not_joined | A message other than `join`, `rejoin` or `host_join` before joining |
| wrong_phase | A message that is not allowed in the current phase, see section 5 |
| no_participants | `start` with nobody in the lobby |
| removed_by_host | Sent to a participant just before the server closes their connection after `kick` |
| bad_message | Invalid JSON, unknown type, missing or wrong typed field, or larger than 2 KB |

A second answer or a second flag for the same question gets no reply. The first one already
got its `ack`. This keeps rule 3 silent for a phone that resends on a weak connection.

## 5. Phases

The session moves through these phases. The server holds the phase, never the device.

```
waiting -> question -> locked -> reveal -> leaderboard -> question ... -> ended
```

| Phase | Entered by | Accepted from participants | Accepted from the host |
|---|---|---|---|
| waiting | Room created | join, rejoin, leave | host_join, start, kick, end, leave |
| question | start, or next from leaderboard | rejoin, answer, leave | host_join, end, leave |
| locked | Timer ends or everyone connected has answered | rejoin, leave | host_join, end, leave |
| reveal | Sent by the server straight after `locked` | rejoin, flag, leave | host_join, next, void, end, leave |
| leaderboard | next from reveal | rejoin, leave | host_join, next, void, end, leave |
| ended | next after the last leaderboard, or end | none, every message gets `room_closed` | none |

`join` during a running game is refused with `wrong_phase`. A new name cannot join once
the quiz has started. A name that was already in the lobby uses `rejoin`.

`locked` and `reveal` are 2 messages so the phone can stop the timer straight away, even
if the reveal takes a moment to score. The reveal lasts until the host presses next, which
is the window for flags.

## 6. Reconnect and current state

On `rejoin` or `host_join` the server replies with `joined` or `host_joined`, then sends
the 1 message that describes the current phase, so the device can draw the right screen:

| Phase | Message sent |
|---|---|
| waiting | lobby |
| question | question, with `remaining_ms` set to the time left |
| locked | locked |
| reveal | reveal, with `you` for a participant |
| leaderboard | leaderboard, with `you` for a participant |
| ended | ended |

A question that was sent while the participant was away scores 0 for them. A participant
who rejoins during a question can still answer it, and the answer time is still measured
from the original `sent_at`, as `docs/SCORING.md` section 2 requires.

`rejoin` only takes a seat that is currently disconnected. This stops a second phone from
taking over a seat that is still in use. It does not stop someone who knows the code and a
disconnected player's name from taking that seat. That is accepted for the MVP, see section
8.

## 7. Rules the protocol must hold to

1. A question appears on all screens at the same time. The server sends it once to the
   whole room rather than per device on request.
2. The server records the send time for each question. Answer time is the difference
   between the server receive time and that send time. A device clock is never used.
3. 1 answer per participant per question. The first answer counts and later ones are
   ignored.
4. Answers lock when the timer ends or when everyone has answered, whichever comes first.
5. Flags are accepted during the reveal only, 1 per participant per question.
6. Only the host can send start, next, end, void and kick. The server checks the host token
   on every one of them rather than trusting the screen that sent it.
7. The correct option is never sent to a participant before the reveal.
8. Messages stay small. Do not send the full question list or the whole participant table
   when a count or a top 10 will do.
9. The phone counts the timer down itself from the moment it receives `question`, using
   `remaining_ms`. It compares durations only, never its own clock with `sent_at`. The
   server decides the lock, so drift on the phone cannot extend the time.
10. Participant names, answers and results are never sent to the AI provider. Nothing in
    this protocol reaches it.

## 8. Changes from version 1 and points to decide

### Added in version 2

- Section 2, the envelope, field names and size limit. This was open point 1.
- `host_join`, because the host screens had no message to identify themselves and their
  token.
- `end`, from the test plan case "Host ends quiz", which version 1 had no message for.
- `ack`, so a phone on a weak connection knows its answer or flag arrived.
- `answer_count` and `flag_count` for host screens, from the test plan case "Flag is
  recorded on server and incremented on host screen".
- The error code list, sections 5 and 6, and rules 9 and 10.
- `next` now moves 1 step at a time, reveal then leaderboard then question, so the host
  controls how long the flag window stays open.

### Decisions needed, to record in the `PLAN.md` decision log

| # | Point | Proposal in this file |
|---|---|---|
| 1 | Envelope shape and field names | Section 2 as written |
| 2 | Timer: device countdown or server tick | Device countdown from `remaining_ms` with the lock decided on the server. 1 message per question instead of 1 per second. Revisit only if the week 5 load test shows drift |
| 3 | Host disconnects mid game | Nothing is lost. The current question still locks on the server timer and the reveal is sent, then the room waits, because only the host moves it on. The host reconnects with `host_join` and gets the current state. There is no automatic end in the MVP |

Also to note in the meeting, not blocking:

- Rejoin by code and name lets someone take a disconnected player's seat if they know the
  name. Accepted for the MVP because the plan requires rejoin with the same name and code.
  A seat key kept on the phone is the version 2 fix.
- The `room_full` limit needs a number before the 30 device load test in week 5.
- A new name cannot join after `start`. Proposed so the leaderboard is fair, but a late
  arrival in a class then has no way in. Confirm or change.
- The early lock counts connected participants only, so 1 dropped phone does not hold the
  whole room until the timer ends.
