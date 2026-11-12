import React from 'react';
import { useCountdown } from '../hooks/useCountdown';

const OPTION_KEYS = ['A', 'B', 'C', 'D'];

function statusText(chosen, closed) {
  if (chosen !== null) {
    return 'Answer sent. Wait for the reveal.';
  }
  return closed ? 'Time is up.' : 'Pick 1 answer.';
}

/** The phone screen for 1 question: the text, 4 answer buttons and the time left. */
export function AnswerScreen({ question, chosen, locked, onAnswer }) {
  const left = useCountdown(question.remaining_ms, question.question_id);
  const closed = locked || left === 0;

  return (
    <section className="sheet answer" aria-labelledby="answer-text">
      <div className="answer__head">
        <p className="field__label">
          Question {question.number} of {question.total}
        </p>
        <p className="answer__timer" role="timer" aria-label="Seconds left">
          {Math.ceil(left / 1000)}
        </p>
      </div>
      <h1 id="answer-text" className="answer__text">
        {question.text}
      </h1>

      <div className="answer__options">
        {question.options.map((option, index) => (
          <button
            key={index}
            type="button"
            className={`answer__option answer__option--${index} ${chosen === index ? 'answer__option--chosen' : ''}`}
            onClick={() => onAnswer(index)}
            disabled={closed || chosen !== null}
            aria-pressed={chosen === index}
          >
            <span className="answer__key" aria-hidden="true">
              {OPTION_KEYS[index]}
            </span>
            <span>{option}</span>
          </button>
        ))}
      </div>

      <p className="field__hint" role="status">
        {statusText(chosen, closed)}
      </p>
    </section>
  );
}
