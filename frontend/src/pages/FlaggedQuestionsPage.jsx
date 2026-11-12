import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiRequest, getAccessToken } from '../lib/api';

function createDraft(question) {
  return {
    text: question.question_text,
    options: [...question.options],
    correct_index: question.correct_index,
    time_limit: question.time_limit,
  };
}

export function FlaggedQuestionsPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [questions, setQuestions] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    const token = getAccessToken();
    if (!token) {
      setError('Sign in as the host to review flagged questions.');
      setIsLoading(false);
      return () => {
        active = false;
      };
    }

    apiRequest(`/api/flags/sessions/${sessionId}/flags`, { token })
      .then((response) => {
        if (!Array.isArray(response?.flagged_questions)) {
          throw new Error('The server returned an invalid flagged-question list.');
        }
        if (active) setQuestions(response.flagged_questions);
      })
      .catch((requestError) => {
        if (active) setError(requestError.message || 'Could not load flagged questions.');
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [sessionId]);

  function openEditor(question) {
    setEditingId(question.question_id);
    setDraft(createDraft(question));
    setError('');
    setNotice('');
  }

  function closeEditor() {
    setEditingId(null);
    setDraft(null);
    setError('');
  }

  function updateOption(index, value) {
    setDraft((current) => ({
      ...current,
      options: current.options.map((option, optionIndex) => (
        optionIndex === index ? value : option
      )),
    }));
  }

  async function saveQuestion(questionId) {
    setSavingId(questionId);
    setError('');
    setNotice('');
    try {
      const updatedQuestion = await apiRequest(`/api/questions/${questionId}`, {
        method: 'PUT',
        token: getAccessToken(),
        body: JSON.stringify(draft),
      });
      setQuestions((current) => current.map((question) => (
        question.question_id === questionId
          ? {
              ...question,
              question_text: updatedQuestion.text,
              options: updatedQuestion.options,
              correct_index: updatedQuestion.correct_index,
              time_limit: updatedQuestion.time_limit,
              source_page_id: updatedQuestion.source_page_id,
              source_snippet: updatedQuestion.source_snippet,
              origin: updatedQuestion.origin,
            }
          : question
      )));
      closeEditor();
      setNotice('Question updated.');
    } catch (requestError) {
      setError(requestError.message || 'Could not update this question.');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <main className="flagged-questions-page">
      <header className="flagged-questions-header">
        <button type="button" className="secondary-button" onClick={() => navigate(-1)}>
          Back
        </button>
        <div>
          <h1>Flagged questions</h1>
          <p>Review questions reported during this game.</p>
        </div>
      </header>

      {error && <p className="flagged-message error-message" role="alert">{error}</p>}
      {notice && <p className="flagged-message success-message" role="status">{notice}</p>}
      {isLoading && <p role="status">Loading flagged questions...</p>}
      {!isLoading && !error && questions.length === 0 && (
        <p>No questions were flagged in this game.</p>
      )}

      <section className="flagged-question-list" aria-label="Flagged questions">
        {questions.map((question) => (
          <article className="flagged-question-card" key={question.question_id}>
            <div className="flagged-question-summary">
              <div>
                <p className="flag-count">
                  Flagged {question.flag_count} {question.flag_count === 1 ? 'time' : 'times'}
                </p>
                <h2>{question.question_text}</h2>
                {question.source_snippet && (
                  <p className="question-source">
                    Source{question.source_page_id ? `, page ${question.source_page_id}` : ''}: {question.source_snippet}
                  </p>
                )}
              </div>
              <button
                type="button"
                className="primary-button"
                aria-label={`Edit question: ${question.question_text}`}
                onClick={() => openEditor(question)}
              >
                Edit question
              </button>
            </div>

            {editingId === question.question_id && draft && (
              <form
                className="question-edit-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  saveQuestion(question.question_id);
                }}
              >
                <label>
                  Question
                  <textarea
                    required
                    value={draft.text}
                    onChange={(event) => setDraft({ ...draft, text: event.target.value })}
                  />
                </label>
                <fieldset>
                  <legend>Options, select the correct answer</legend>
                  {draft.options.map((option, index) => (
                    <div className="edit-option-row" key={index}>
                      <input
                        type="radio"
                        name={`correct-option-${question.question_id}`}
                        aria-label={`Option ${index + 1} is correct`}
                        checked={draft.correct_index === index}
                        onChange={() => setDraft({ ...draft, correct_index: index })}
                      />
                      <input
                        aria-label={`Option ${index + 1}`}
                        required
                        value={option}
                        onChange={(event) => updateOption(index, event.target.value)}
                      />
                    </div>
                  ))}
                </fieldset>
                <label>
                  Time limit in seconds
                  <input
                    type="number"
                    min="1"
                    required
                    value={draft.time_limit}
                    onChange={(event) => setDraft({
                      ...draft,
                      time_limit: Number(event.target.value),
                    })}
                  />
                </label>
                <div className="question-edit-actions">
                  <button
                    type="submit"
                    className="primary-button"
                    disabled={savingId === question.question_id}
                  >
                    {savingId === question.question_id ? 'Saving...' : 'Save question'}
                  </button>
                  <button type="button" className="secondary-button" onClick={closeEditor}>
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </article>
        ))}
      </section>
    </main>
  );
}

export default FlaggedQuestionsPage;
