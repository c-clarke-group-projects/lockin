# Data model

Source: section 7.1 of the MVP proposal, WBS 2.2.1. Week 1 deliverable, owner .

9 tables. This file is the agreed design. The real migration is written in week 2 under
PB-01 and PB-02. Change this file by pull request, and tell anyone already building
against a table before you change it.

## 1. Tables

### hosts

Teachers and study group organisers. The only accounts in the MVP.

| Field | Notes |
|---|---|
| id | Primary key |
| email | Unique, required |
| password_hash | Hashed, never plain text |
| created_at | |

### materials

1 row per uploaded file.

| Field | Notes |
|---|---|
| id | Primary key |
| host_id | Owner, required |
| file_name | Original name as uploaded |
| page_count | Pages found in the file |
| uploaded_at | |

### material_pages

The extracted text, 1 row per page. Source linking depends on this table, so the page
number is kept with the text from the moment of extraction.

| Field | Notes |
|---|---|
| id | Primary key |
| material_id | Required |
| page_number | 1 based, as printed by the extractor |
| text | Extracted text. Empty or near empty means the page was skipped as likely scanned |

### quizzes

A saved set of questions a host can run more than once.

| Field | Notes |
|---|---|
| id | Primary key |
| host_id | Owner, required |
| title | |
| created_at | |

### questions

| Field | Notes |
|---|---|
| id | Primary key |
| quiz_id | Required |
| text | The question |
| options | Exactly 4 |
| correct_index | Which of the 4 is correct |
| time_limit | Seconds for this question |
| source_page_id | Points at a material_pages row. Optional, because a manual question may have no source |
| source_snippet | Short quote from that page. Required for an AI question, optional for a manual one |
| origin | `ai` or `manual`. This is a product field from the proposal, not a tool credit |

### sessions

1 live game.

| Field | Notes |
|---|---|
| id | Primary key |
| quiz_id | Required |
| join_code | 6 digits, unique among active sessions |
| status | Waiting, running or ended |
| started_at | |
| ended_at | |

### participants

A person in 1 session. No account, no email, no phone number.

| Field | Notes |
|---|---|
| id | Primary key |
| session_id | Required |
| display_name | Unique within the session |
| joined_at | |

### answers

1 row per participant per question.

| Field | Notes |
|---|---|
| id | Primary key |
| session_id | Required |
| question_id | Required |
| participant_id | Required |
| chosen_index | Which option was tapped. Empty if time ran out |
| is_correct | |
| answer_ms | Milliseconds from when the server sent the question. Measured on the server |
| points | Awarded by the server. Set to 0 when the question is voided |

### flags

A participant marking a question as wrong or unclear during the reveal.

| Field | Notes |
|---|---|
| id | Primary key |
| session_id | Required |
| question_id | Required |
| participant_id | Required |
| reason | Short text, optional |
| created_at | |

## 2. Relationships

- A host has many materials and many quizzes.
- A material has many material_pages.
- A quiz has many questions. A question may point at 1 material page as its source.
- A quiz has many sessions. A session has many participants, answers and flags.
- An answer belongs to 1 session, 1 question and 1 participant.

## 3. Rules the database should enforce

- `hosts.email` is unique.
- `participants.display_name` is unique within a session. A repeat name is rejected at
  join time with a clear message.
- 1 answer per participant per question.
- 1 flag per participant per question.
- A question has exactly 4 options and exactly 1 correct index.
- Deleting a quiz does not silently delete finished session results. Decide the exact
  behaviour before the delete endpoint is built, and record it in the `PLAN.md` log.

## 4. Things the gap report needs

The report groups wrong answers by `questions.source_page_id` and shows the percent wrong
per source page, worst first. Questions with no source page are grouped as No source.
Voided questions are excluded from the score totals and marked in the report. Nothing else
is needed for it, which is why the page number is stored on the question rather than
recomputed later.

## 5. Retention

Uploaded files and session results have a retention period. It is open decision D4 in
`PLAN.md` and must be agreed before the trial. Backlog item PB-34 covers the automatic
deletion and is marked Could, so it may not ship in the 6 weeks. Until it does, deletion
is manual and someone must own it.
