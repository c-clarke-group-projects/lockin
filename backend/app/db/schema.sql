
CREATE TABLE hosts (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE materials (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    host_id BIGINT NOT NULL REFERENCES hosts(id),
    file_name TEXT NOT NULL,
    page_count INTEGER NOT NULL DEFAULT 0 CHECK (page_count >= 0),
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE material_pages (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    material_id BIGINT NOT NULL REFERENCES materials(id),
    page_number INTEGER NOT NULL CHECK (page_number >= 1),
    text TEXT NOT NULL DEFAULT '',
    UNIQUE (material_id, page_number)
);

CREATE TABLE quizzes (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    host_id BIGINT NOT NULL REFERENCES hosts(id),
    title TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE questions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    quiz_id BIGINT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    options JSONB NOT NULL CHECK (
        jsonb_typeof(options) = 'array'
        AND jsonb_array_length(options) = 4
    ),
    correct_index SMALLINT NOT NULL CHECK (correct_index BETWEEN 0 AND 3),
    time_limit INTEGER NOT NULL DEFAULT 30 CHECK (time_limit > 0),
    source_page_id BIGINT REFERENCES material_pages(id),
    source_snippet TEXT,
    origin VARCHAR(10) NOT NULL CHECK (origin IN ('ai', 'manual')),
    CHECK (
        origin = 'manual'
        OR (
            source_page_id IS NOT NULL
            AND source_snippet IS NOT NULL
            AND source_snippet <> ''
        )
    )
);

CREATE TABLE sessions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    quiz_id BIGINT NOT NULL REFERENCES quizzes(id),
    join_code CHAR(6) NOT NULL CHECK (join_code ~ '^[0-9]{6}$'),
    status VARCHAR(10) NOT NULL DEFAULT 'waiting'
        CHECK (status IN ('waiting', 'running', 'ended')),
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX unique_active_session_join_code
ON sessions (join_code)
WHERE status IN ('waiting', 'running');

CREATE TABLE participants (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    session_id BIGINT NOT NULL REFERENCES sessions(id),
    display_name VARCHAR(100) NOT NULL,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (session_id, display_name)
);

CREATE TABLE answers (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    session_id BIGINT NOT NULL REFERENCES sessions(id),
    question_id BIGINT NOT NULL REFERENCES questions(id),
    participant_id BIGINT NOT NULL REFERENCES participants(id),
    chosen_index SMALLINT CHECK (chosen_index BETWEEN 0 AND 3),
    is_correct BOOLEAN,
    answer_ms INTEGER CHECK (answer_ms >= 0),
    points INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0),
    UNIQUE (participant_id, question_id)
);

CREATE TABLE flags (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    session_id BIGINT NOT NULL REFERENCES sessions(id),
    question_id BIGINT NOT NULL REFERENCES questions(id),
    participant_id BIGINT NOT NULL REFERENCES participants(id),
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
