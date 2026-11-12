import React from 'react';
import { Icon } from './Icon';

/** 1 saved question with its correct option, where it came from, and a remove button. */
export function QuestionCard({ question, number, onRemove, removing }) {
  const fromPdf = question.origin === 'ai';

  return (
    <li className="question">
      <div className="question__head">
        <div>
          <p className="question__number">Question {number}</p>
          <p className="question__text">{question.text}</p>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={() => onRemove(question)}
          disabled={removing}
          aria-label={`Remove question ${number}`}
        >
          {removing ? <span className="spinner" aria-hidden="true" /> : <Icon name="trash" />}
        </button>
      </div>

      <ul className="question__options">
        {question.options.map((option, index) => {
          const correct = index === question.correct_index;
          return (
            <li key={index} className={`question__option ${correct ? 'question__option--correct' : ''}`}>
              <span>{option}</span>
              {correct && (
                <span>
                  <Icon name="check" className="pill__icon" /> Correct
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <div className="question__meta">
        <span className={`tag ${fromPdf ? 'tag--ai' : ''}`}>{fromPdf ? 'From PDF' : 'Written'}</span>
        {question.source_page_number && <span className="tag">Page {question.source_page_number}</span>}
        <span className="tag">{question.time_limit} seconds</span>
      </div>

      {question.source_snippet && <p className="question__source">“{question.source_snippet}”</p>}
    </li>
  );
}
