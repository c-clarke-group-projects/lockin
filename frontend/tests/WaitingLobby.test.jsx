import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WaitingLobby } from '../src/components/WaitingLobby';

describe('WaitingLobby Component (Unit Tests)', () => {
  it('1. renders quiz title, room code, and player name', () => {
    render(
      <WaitingLobby
        quizTitle="Science Quiz"
        displayName="Tharindu"
        roomCode="012345"
        participants={[]}
        participantCount={1}
        onLeave={vi.fn()}
      />
    );

    expect(screen.getByText('Science Quiz')).toBeInTheDocument();
    expect(screen.getByText('012345')).toBeInTheDocument();
    expect(screen.getByText('Tharindu')).toBeInTheDocument();
    expect(screen.getByText(/Connected/i)).toBeInTheDocument();
    expect(screen.getByText(/Waiting for the host to start the quiz/i)).toBeInTheDocument();
  });

  it('2. renders default quiz title when not provided', () => {
    render(
      <WaitingLobby
        displayName="Amal"
        roomCode="123456"
        participants={[]}
        onLeave={vi.fn()}
      />
    );

    expect(screen.getByText('Quiz Lobby')).toBeInTheDocument();
  });

  it('3. renders participant list and highlights current player', () => {
    const participants = [
      { participant_id: 1, display_name: 'Tharindu' },
      { participant_id: 2, display_name: 'Kasun' },
      { participant_id: 3, display_name: 'Amal' },
    ];

    render(
      <WaitingLobby
        quizTitle="General Knowledge"
        displayName="Tharindu"
        roomCode="987654"
        participants={participants}
        participantCount={3}
        onLeave={vi.fn()}
      />
    );

    expect(screen.getByText(/Participants \(3\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Tharindu \(You\)/i)).toBeInTheDocument();
    expect(screen.getByText('Kasun')).toBeInTheDocument();
    expect(screen.getByText('Amal')).toBeInTheDocument();
  });

  it('4. case-insensitively identifies current player in participant tags', () => {
    const participants = [
      { participant_id: 1, display_name: 'tharindu' },
    ];

    render(
      <WaitingLobby
        quizTitle="Math Quiz"
        displayName="Tharindu"
        roomCode="112233"
        participants={participants}
        participantCount={1}
        onLeave={vi.fn()}
      />
    );

    expect(screen.getByText(/tharindu \(You\)/i)).toBeInTheDocument();
  });

  it('5. triggers onLeave callback when Leave Room button is clicked', () => {
    const handleLeave = vi.fn();
    render(
      <WaitingLobby
        quizTitle="History Quiz"
        displayName="Nimal"
        roomCode="554433"
        participants={[]}
        onLeave={handleLeave}
      />
    );

    const leaveButton = screen.getByRole('button', { name: /Leave Room/i });
    fireEvent.click(leaveButton);

    expect(handleLeave).toHaveBeenCalledTimes(1);
  });
});

