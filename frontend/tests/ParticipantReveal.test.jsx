import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ParticipantReveal from '../src/views/participentReveal';

describe('ParticipantReveal Component with ChallengeButton (SCRUM-62)', () => {
  const sampleQuestion = {
    id: 101,
    question_id: 101,
    options: ['Option A', 'Option B', 'Option C', 'Option D'],
    correct_index: 1,
    source_page: 12,
    source_snippet: 'This statement is proven by the textbook on page 12.',
  };

  it('renders correct state when user answered correctly', () => {
    render(<ParticipantReveal questionData={sampleQuestion} selectedOption={1} />);

    expect(screen.getByText(/Correct! 🎉/i)).toBeInTheDocument();
    expect(screen.getByText('Option B')).toBeInTheDocument();
    expect(screen.getByText(/Source \(Page 12\)/i)).toBeInTheDocument();
    expect(
      screen.getByText(/"This statement is proven by the textbook on page 12."/i)
    ).toBeInTheDocument();
  });

  it('renders incorrect state when user chose wrong answer', () => {
    render(<ParticipantReveal questionData={sampleQuestion} selectedOption={0} />);

    expect(screen.getByText(/Incorrect ❌/i)).toBeInTheDocument();
    expect(screen.getByText('Option A')).toBeInTheDocument();
  });

  it('renders ChallengeButton when questionId is present and in reveal phase', () => {
    render(
      <ParticipantReveal
        questionData={sampleQuestion}
        selectedOption={0}
        sessionId={1}
        participantId={5}
        isRevealPhase={true}
      />
    );

    expect(
      screen.getByRole('button', { name: /challenge this question/i })
    ).toBeInTheDocument();
  });

  it('does not render ChallengeButton when isRevealPhase is false', () => {
    render(
      <ParticipantReveal
        questionData={sampleQuestion}
        selectedOption={0}
        sessionId={1}
        participantId={5}
        isRevealPhase={false}
      />
    );

    expect(
      screen.queryByRole('button', { name: /challenge this question/i })
    ).not.toBeInTheDocument();
  });
});

