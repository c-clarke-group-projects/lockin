import React from 'react';
import { Link } from 'react-router-dom';
import { useCountdown } from '../hooks/useCountdown';
import { Icon } from './Icon';

const OPTION_KEYS = ['A', 'B', 'C', 'D'];

/** Folds 1 game message from the server into the host's view of the game. */
export function applyGameMessage(game, msg) {
  const data = msg?.data ?? {};
  switch (msg?.type) {
    case 'question':
      return { phase: 'question', question: data, answered: 0, connected: null };
    case 'answer_count':
      return game ? { ...game, answered: data.answered, connected: data.connected } : game;
    case 'locked':
      return { ...game, phase: 'locked' };
    case 'reveal':
      return { ...game, phase: 'reveal', reveal: data };
    case 'leaderboard':
      return { ...game, phase: 'leaderboard', ranking: data };
    case 'ended':
      return { ...game, phase: 'ended', ranking: data };
    default:
      return game;
  }
}

function QuestionView({ game }) {
  const { question } = game;
  const left = useCountdown(game.phase === 'question' ? question.remaining_ms : 0, question.question_id);
  const answered = game.answered ?? 0;

  return (
    <>
      <div className="game__head">
        <p className="field__label">
          Question {question.number} of {question.total}
        </p>
        <p className="game__timer" role="timer" aria-label="Seconds left">
          {game.phase === 'question' ? Math.ceil(left / 1000) : 0}
        </p>
      </div>
      <h2 className="game__text">{question.text}</h2>
      <ol className="game__options">
        {question.options.map((option, index) => (
          <li key={index} className="game__option">
            <span className="answer__key" aria-hidden="true">
              {OPTION_KEYS[index]}
            </span>
            {option}
          </li>
        ))}
      </ol>
      <p className="game__status" role="status">
        {game.phase === 'locked'
          ? 'Answers are locked. Checking them now.'
          : `${answered} of ${game.connected ?? 'all'} answered`}
      </p>
    </>
  );
}

function RevealView({ game }) {
  const { reveal, question } = game;
  const options = question?.options ?? ['', '', '', ''];

  return (
    <>
      {question && (
        <p className="field__label">
          Question {question.number} of {question.total}
        </p>
      )}
      {question && <h2 className="game__text">{question.text}</h2>}
      <ol className="game__options">
        {options.map((option, index) => {
          const correct = index === reveal.correct_index;
          return (
            <li key={index} className={`game__option ${correct ? 'game__option--correct' : ''}`}>
              <span className="answer__key" aria-hidden="true">
                {OPTION_KEYS[index]}
              </span>
              <span className="game__option-text">
                {option}
                {correct && <span className="visually-hidden"> (correct)</span>}
              </span>
              <span className="game__votes">{reveal.distribution[index]}</span>
            </li>
          );
        })}
      </ol>
      <p className="game__status">
        {reveal.no_answer === 1 ? '1 player did not answer.' : `${reveal.no_answer} players did not answer.`}
      </p>
      {reveal.source?.snippet && (
        <p className="question__source">
          {reveal.source.page_number ? `Page ${reveal.source.page_number}: ` : ''}“{reveal.source.snippet}”
        </p>
      )}
    </>
  );
}

function RankingView({ ranking, title }) {
  return (
    <>
      <h2 className="game__text">{title}</h2>
      {ranking.top.length === 0 ? (
        <p className="empty">Nobody scored in this quiz.</p>
      ) : (
        <ol className="game__ranking">
          {ranking.top.map((row) => (
            <li key={row.rank} className="game__rank">
              <span className="game__rank-number">{row.rank}</span>
              <span className="game__rank-name">{row.display_name}</span>
              <span className="game__rank-score">{row.score}</span>
            </li>
          ))}
        </ol>
      )}
      <p className="game__status">
        {ranking.count === 1 ? '1 player' : `${ranking.count} players`} in this quiz.
      </p>
    </>
  );
}

function nextLabel(game) {
  if (game.phase === 'reveal') {
    return 'Show leaderboard';
  }
  const question = game.question;
  return question && question.number >= question.total ? 'Finish quiz' : 'Next question';
}

/** The host's controls while the quiz runs, driven by applyGameMessage. */
export function HostGamePanel({ game, onNext, onEnd }) {
  if (game.phase === 'ended') {
    return (
      <section className="sheet game" aria-labelledby="game-title">
        <h1 id="game-title" className="visually-hidden">
          Quiz ended
        </h1>
        <RankingView
          ranking={game.ranking}
          title={game.ranking.reason === 'ended_by_host' ? 'You ended the quiz' : 'Final leaderboard'}
        />
        <Link to="/host" className="pill pill--ink game__action">
          Back to your rooms
        </Link>
      </section>
    );
  }

  const canGoOn = game.phase === 'reveal' || game.phase === 'leaderboard';

  return (
    <section className="sheet game" aria-label="Quiz in progress" aria-live="polite">
      {(game.phase === 'question' || game.phase === 'locked') && game.question && <QuestionView game={game} />}
      {game.phase === 'reveal' && <RevealView game={game} />}
      {game.phase === 'leaderboard' && <RankingView ranking={game.ranking} title="Leaderboard" />}

      <div className="game__actions">
        {canGoOn && (
          <button type="button" className="pill pill--ink" onClick={onNext}>
            {nextLabel(game)}
            <Icon name="arrowRight" className="pill__icon" />
          </button>
        )}
        <button type="button" className="pill pill--quiet" onClick={onEnd}>
          End quiz
        </button>
      </div>
    </section>
  );
}
