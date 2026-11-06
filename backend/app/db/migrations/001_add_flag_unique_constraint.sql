CREATE UNIQUE INDEX IF NOT EXISTS
uq_flags_participant_question
ON flags (participant_id, question_id);