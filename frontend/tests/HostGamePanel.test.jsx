import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HostGamePanel, applyGameMessage } from '../src/components/HostGamePanel';
import { AnswerScreen } from '../src/components/AnswerScreen';

const question = {
  question_id: 7,
  number: 2,
  total: 2,
  text: 'Capital of France?',
  options: ['Paris', 'Rome', 'Oslo', 'Bern'],
  time_limit_ms: 20000,
  remaining_ms: 20000,
  sent_at: 1,
};

function play(...messages) {
  return messages.reduce(applyGameMessage, null);
}

describe('Host game panel', () => {
  it('1. counts answers during a question and offers End only', () => {
    const game = play(
      { type: 'question', data: question },
      { type: 'answer_count', data: { question_id: 7, answered: 1, connected: 3 } }
    );
    render(<HostGamePanel game={game} onNext={vi.fn()} onEnd={vi.fn()} />);

    expect(screen.getByText('Capital of France?')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('1 of 3 answered');
    expect(screen.queryByRole('button', { name: /Show leaderboard/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'End quiz' })).toBeInTheDocument();
  });

  it('2. shows the votes and the correct option at the reveal, then Next', () => {
    const onNext = vi.fn();
    const game = play(
      { type: 'question', data: question },
      { type: 'locked', data: { question_id: 7, reason: 'timer' } },
      {
        type: 'reveal',
        data: { question_id: 7, correct_index: 0, distribution: [2, 1, 0, 0], no_answer: 1, source: null },
      }
    );
    render(<HostGamePanel game={game} onNext={onNext} onEnd={vi.fn()} />);

    expect(screen.getByText('(correct)').closest('li')).toHaveTextContent('Paris');
    expect(screen.getByText('1 player did not answer.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Show leaderboard/ }));
    expect(onNext).toHaveBeenCalled();
  });

  it('3. labels Next as Finish quiz on the last leaderboard and shows the final ranking', () => {
    const ranking = { top: [{ rank: 1, display_name: 'Ana', score: 950 }], count: 1 };
    const { rerender } = render(
      <MemoryRouter>
        <HostGamePanel
          game={play({ type: 'question', data: question }, { type: 'leaderboard', data: ranking })}
          onNext={vi.fn()}
          onEnd={vi.fn()}
        />
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: /Finish quiz/ })).toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <HostGamePanel
          game={play({ type: 'ended', data: { ...ranking, reason: 'finished' } })}
          onNext={vi.fn()}
          onEnd={vi.fn()}
        />
      </MemoryRouter>
    );
    expect(screen.getByText('Final leaderboard')).toBeInTheDocument();
    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to your rooms' })).toBeInTheDocument();
  });
});

describe('Answer screen', () => {
  it('4. turns the buttons off once the answers are locked', () => {
    render(<AnswerScreen question={question} chosen={null} locked onAnswer={vi.fn()} />);

    expect(screen.getByRole('button', { name: /Paris/ })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Time is up.');
  });
});
