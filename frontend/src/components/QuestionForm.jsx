import React, { useState } from 'react';
import { addQuestion } from '../lib/api';
import { Icon } from './Icon';

const OPTION_COUNT = 4;
const TIME_OPTIONS = [10, 20, 30, 45, 60];
const DEFAULT_TIME = 20;

const emptyQuestion = () => ({
  text: '',
  options: Array(OPTION_COUNT).fill(''),
  correct: null,
  timeLimit: DEFAULT_TIME,
  note: '',
});

function questionProblem(draft) {
  if (!draft.text.trim()) {
    return 'Write the question.';
  }
  if (draft.options.some((option) => !option.trim())) {
    return 'Fill in all 4 options.';
  }
  if (draft.correct === null) {
    return 'Choose which option is correct.';
  }
  return '';
}

/** Form for writing 1 multiple choice question with 4 options. */
export function QuestionForm({ quizId, onAdded, describeError }) {
  const [draft, setDraft] = useState(emptyQuestion);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const update = (changes) => setDraft((current) => ({ ...current, ...changes }));

  const setOption = (index, value) => {
    const options = [...draft.options];
    options[index] = value;
    update({ options });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const problem = questionProblem(draft);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError('');
    try {
      await addQuestion(quizId, {
        text: draft.text.trim(),
        options: draft.options.map((option) => option.trim()),
        correct_index: draft.correct,
        time_limit: draft.timeLimit,
        source_note: draft.note.trim() || null,
      });
      setDraft(emptyQuestion());
      onAdded();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="form" onSubmit={handleSubmit} noValidate>
      <div className="field">
        <label htmlFor="question-text" className="field__label">
          Question
        </label>
        <textarea
          id="question-text"
          className="input"
          value={draft.text}
          onChange={(e) => update({ text: e.target.value })}
          placeholder="Which organelle releases energy from glucose?"
          disabled={busy}
        />
      </div>

      <fieldset className="options">
        <legend className="field__label" style={{ marginBottom: 6 }}>
          Options, mark the correct one
        </legend>
        {draft.options.map((option, index) => (
          <div className="option-row" key={index}>
            <input
              type="radio"
              name="correct-option"
              checked={draft.correct === index}
              onChange={() => update({ correct: index })}
              aria-label={`Option ${index + 1} is correct`}
              disabled={busy}
            />
            <input
              className="input"
              value={option}
              onChange={(e) => setOption(index, e.target.value)}
              placeholder={`Option ${index + 1}`}
              aria-label={`Option ${index + 1}`}
              disabled={busy}
            />
          </div>
        ))}
      </fieldset>

      <div className="row">
        <div className="field">
          <label htmlFor="time-limit" className="field__label">
            Time to answer
          </label>
          <select
            id="time-limit"
            className="input"
            value={draft.timeLimit}
            onChange={(e) => update({ timeLimit: Number(e.target.value) })}
            disabled={busy}
          >
            {TIME_OPTIONS.map((seconds) => (
              <option key={seconds} value={seconds}>
                {seconds} seconds
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="source-note" className="field__label">
            Source note, optional
          </label>
          <input
            id="source-note"
            className="input"
            value={draft.note}
            onChange={(e) => update({ note: e.target.value })}
            placeholder="Textbook chapter 4"
            disabled={busy}
          />
        </div>
      </div>

      {error && (
        <div className="notice notice--error" role="alert">
          <Icon name="alert" />
          <span>{error}</span>
        </div>
      )}

      <button type="submit" className="pill pill--solid pill--block" disabled={busy}>
        {busy ? <span className="spinner" aria-hidden="true" /> : <Icon name="plus" className="pill__icon" />}
        Add question
      </button>
    </form>
  );
}
