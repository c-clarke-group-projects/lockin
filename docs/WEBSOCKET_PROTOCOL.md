# WebSocket protocol

Source: WBS 2.2.2. Week 1 deliverable. Owner Keshan, agreed with    and   .

Backend and frontend are built in parallel from week 2 against this list, so it is the
contract between them. Change it only by pull request, and tell both sides before merging.
A change here that is not announced will break someone else's branch.

## 1. Connection

- 1 WebSocket connection per device.
- 3 roles connect: the host control screen, the host big screen, and a participant phone.
- A participant connects with the 6 digit join code and a display name. No account and no
  token. A host connects with their login token.
- Every message carries a type and a session identifier. Messages are small, because the
  trial runs on school internet.
- If the connection drops, the device reconnects with the same code and name and takes the
  same seat with the same score. Questions missed while away score 0.

## 2. Messages from a device to the server

| Message | Sent by | Carries | Server does |
|---|---|---|---|
| join | Participant | Join code, display name | Checks the code, rejects a name already used in the room, adds the participant to the lobby, replies with the seat and tells everyone the lobby changed |
| rejoin | Participant | Join code, display name | Restores the same seat and score, sends the current state of the game |
| start | Host | Session id | Moves the session from waiting to running and sends the first question |
| answer | Participant | Question id, chosen option | Records the answer once only, measures the time on the server, ignores anything after the lock |
| next | Host | Session id | Moves to the next question, or ends the quiz after the last one |
| flag | Participant | Question id, optional short reason | Records 1 flag per person per question, during the reveal only |
| void | Host | Question id | Removes that question's points for everyone and recalculates the leaderboard |
| kick | Host | Participant id | Removes a participant from the lobby |
| leave | Participant or host | Session id | Marks the device as disconnected |

## 3. Messages from the server to devices

| Message | Sent to | Carries |
|---|---|---|
| joined | The joining participant | Their seat, their display name, the quiz title |
| lobby | Host screens and participants | The current list of display names and the count |
| question | Everyone | Question index and total, question text, the 4 options, the time limit, the server send time |
| locked | Everyone | The question is closed for answers |
| reveal | Everyone | The correct option, the answer distribution, the source page number and the snippet |
| leaderboard | Everyone | Top 10 for the big screen, plus the receiving participant's own rank and score |
| voided | Everyone | Which question was voided and the recalculated leaderboard |
| ended | Everyone | Final ranking, and for a participant their own final rank and score |
| error | 1 device | A short code and a message the user can read, for a wrong code, a duplicate name or a full room |

## 4. Rules the protocol must hold to

1. A question appears on all screens at the same time. The server sends it once to the
   whole room rather than per device on request.
2. The server records the send time for each question. Answer time is the difference
   between the server receive time and that send time. A device clock is never used.
3. 1 answer per participant per question. The first answer counts and later ones are
   ignored.
4. Answers lock when the timer ends or when everyone has answered, whichever comes first.
5. Flags are accepted during the reveal only, 1 per participant per question.
6. Only the host can send start, next, void and kick. The server checks the host token on
   every one of them rather than trusting the screen that sent it.
7. The correct option is never sent to a participant before the reveal.
8. Messages stay small. Do not send the full question list or the whole participant table
   when a count or a top 10 will do.

## 5. Open points to settle in week 1

- Exact field names and the message envelope shape. Agree them with the frontend before
  the first room branch is opened.
- Whether the timer counts down on the device from the server send time, or the server
  sends a tick. The device countdown with a server lock is the smaller message, so it is
  the proposal unless testing shows drift.
- What happens when the host disconnects mid game. Decide and record it in `PLAN.md`.
