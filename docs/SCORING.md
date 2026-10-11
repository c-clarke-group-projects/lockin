# Scoring

Source: section 6 of the MVP proposal, backlog PB-19 and PB-20. Owner Keshan.

This is the only place the scoring rules are written down. Backend, frontend and the test
plan all read this file. Do not restate the formula anywhere else, and do not change it
without a decision recorded in `PLAN.md`.

## 1. Formula

A correct answer earns a base of 500 points plus up to 500 more for speed.

```
correct:            points = 500 + round(500 x time_left / time_limit)
wrong or no answer: points = 0
```

`time_left` is the time limit minus the answer time. Both are measured on the server.

The 500 floor keeps a slow but correct player competitive, which matters because the
product is about what the room learned, not only who was fastest.

## 2. Timing

Answer time is measured on the server, from the moment the question was sent to the moment
the answer arrived. The device clock is never used, so a participant cannot change their
own clock to gain points.

Answers lock when the timer ends or when every participant has answered, whichever comes
first. Anything that arrives after the lock scores 0.

## 3. Ranking

- Rank is by total points, highest first.
- A tie on total points is broken by the earlier average answer time.
- The big screen shows the top 10. Each participant sees their own rank on their phone.

## 4. Voided questions

When the host voids a flagged question, all points from that question are removed for
everyone, the leaderboard is recalculated, and the question is marked as voided in the
report. A voided question is excluded from the final per question results and from the
gap report totals.

## 5. Reconnect

A participant who rejoins with the same code and display name keeps their score. Questions
that passed while they were away score 0 for them. There is no catch up and no replay.

## 6. What must be tested

Unit tests only, no HTTP and no WebSocket. This is WBS 5.1.1, due week 2, owner   .

| Case | Expected |
|---|---|
| Correct answer with 0 time used | 1000 |
| Correct answer at the exact time limit | 500 |
| Correct answer at half the time limit | 750 |
| Wrong answer at any time | 0 |
| No answer | 0 |
| Answer arriving after the lock | 0 |
| Tie on points, different average answer times | Earlier average ranks higher |
| A voided question | Its points removed for every participant, leaderboard recalculated |
| Rounding at an awkward fraction | Matches the formula, no off by 1 |
