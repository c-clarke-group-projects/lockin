import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { FinalResult } from '../src/components/FinalResult';
import { JoinPage } from '../src/pages/JoinPage';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// Mock WebSocket Client
class MockQuizWebSocketClient {
  constructor() {
    this.messageHandlers = new Set();
    this.openHandlers = new Set();
    this.closeHandlers = new Set();
    this.errorHandlers = new Set();
    this.connectCalled = false;
    this.sentMessages = [];
    this.isOpen = false;
  }

  connect() {
    this.connectCalled = true;
    this.isOpen = true;
    setTimeout(() => {
      this.openHandlers.forEach((h) => h());
    }, 0);
    return Promise.resolve();
  }

  disconnect() {
    this.isOpen = false;
  }

  join(roomCode, displayName) {
    this.sentMessages.push({ type: 'join', roomCode, displayName });
  }

  leave(sessionId) {
    this.sentMessages.push({ type: 'leave', sessionId });
  }

  onMessage(handler) {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onOpen(handler) {
    this.openHandlers.add(handler);
    return () => this.openHandlers.delete(handler);
  }

  onClose(handler) {
    this.closeHandlers.add(handler);
    return () => this.closeHandlers.delete(handler);
  }

  onError(handler) {
    this.errorHandlers.add(handler);
    return () => this.errorHandlers.delete(handler);
  }

  simulateMessage(msg) {
    act(() => {
      this.messageHandlers.forEach((h) => h(msg));
    });
  }
}

describe('FinalResult Component (PB-28 / SCRUM-92)', () => {
  describe('Unit Rendering Tests', () => {
    it('1. renders the result screen with heading and quiz title', () => {
      render(
        <FinalResult
          displayName="Nimal"
          rank={2}
          score={850}
          quizTitle="Physics 101"
        />
      );

      expect(screen.getByRole('heading', { level: 1, name: /quiz completed!/i })).toBeInTheDocument();
      expect(screen.getByText('Physics 101')).toBeInTheDocument();
      expect(screen.getByTestId('participant-name')).toHaveTextContent('Nimal');
    });

    it('2. displays the correct final rank (e.g. #2)', () => {
      render(<FinalResult rank={2} score={500} />);

      const rankElement = screen.getByTestId('final-rank-display');
      expect(rankElement).toHaveTextContent('#2');
    });

    it('3. displays the correct final score', () => {
      render(<FinalResult rank={4} score={1250} />);

      const scoreElement = screen.getByTestId('final-score-display');
      expect(scoreElement).toHaveTextContent('1,250');
    });

    it('4. displays zero score cleanly without errors', () => {
      render(<FinalResult rank={10} score={0} />);

      const scoreElement = screen.getByTestId('final-score-display');
      expect(scoreElement).toHaveTextContent('0');
      expect(screen.getByText('pts')).toBeInTheDocument();
    });

    it('5. celebrates first-place champion with 1st place badge and trophy', () => {
      render(<FinalResult rank={1} score={2000} displayName="Champion" />);

      expect(screen.getByTestId('final-rank-display')).toHaveTextContent('#1');
      expect(screen.getByTestId('congrats-message')).toHaveTextContent(/Outstanding! You took 1st place!/i);
    });

    it('6. displays total participant count when provided by server', () => {
      render(<FinalResult rank={5} score={400} participantCount={30} />);

      const countElement = screen.getByTestId('participant-count-display');
      expect(countElement).toHaveTextContent('out of 30 players');
    });

    it('10. handles missing authoritative rank and score gracefully with unavailable state', () => {
      render(<FinalResult rank={null} score={null} />);

      expect(screen.getByTestId('final-rank-display')).toHaveTextContent('-');
      expect(screen.getByTestId('final-score-display')).toHaveTextContent('-');
      expect(screen.getByTestId('congrats-message')).toHaveTextContent(/Final results unavailable/i);
    });

    it('11. triggers onBackToHome callback when clicking Back to Home button', () => {
      const onBack = vi.fn();
      render(<FinalResult rank={3} score={700} onBackToHome={onBack} />);

      const backBtn = screen.getByTestId('back-to-home-btn');
      fireEvent.click(backBtn);

      expect(onBack).toHaveBeenCalledTimes(1);
    });

    it('14. displays disconnected/offline status badge when connection is lost', () => {
      render(<FinalResult rank={2} score={900} isDisconnected={true} />);

      expect(screen.getByText(/Offline • Final result cached/i)).toBeInTheDocument();
    });
  });

  describe('Participant Flow Integration with JoinPage', () => {
    let mockClient;

    beforeEach(() => {
      mockClient = new MockQuizWebSocketClient();
    });

    const setupJoinedUser = async () => {
      render(
        <MemoryRouter initialEntries={['/join']}>
          <Routes>
            <Route path="/join" element={<JoinPage clientOverride={mockClient} />} />
          </Routes>
        </MemoryRouter>
      );

      fireEvent.change(screen.getByLabelText(/6 Digit Room Code/i), { target: { value: '112233' } });
      fireEvent.change(screen.getByLabelText(/Display Name/i), { target: { value: 'Saman' } });
      fireEvent.click(screen.getByRole('button', { name: /Join Room/i }));

      await waitFor(() => {
        expect(mockClient.connectCalled).toBe(true);
      });

      // Simulate successful join
      mockClient.simulateMessage({
        type: 'joined',
        session_id: 1,
        data: {
          participant_id: 101,
          display_name: 'Saman',
          quiz_title: 'Math Quiz',
          score: 100,
        },
      });

      await waitFor(() => {
        expect(screen.getByText(/Math Quiz/i)).toBeInTheDocument();
      });
    };

    it('7. ended event opens final results screen automatically', async () => {
      await setupJoinedUser();

      // Simulate backend 'ended' event
      mockClient.simulateMessage({
        type: 'ended',
        session_id: 1,
        data: {
          reason: 'finished',
          count: 15,
          you: {
            rank: 3,
            score: 1450,
          },
          top: [
            { rank: 1, display_name: 'Leader', score: 2000 },
            { rank: 2, display_name: 'Second', score: 1800 },
            { rank: 3, display_name: 'Saman', score: 1450 },
          ],
        },
      });

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1, name: /quiz completed!/i })).toBeInTheDocument();
        expect(screen.getByTestId('final-rank-display')).toHaveTextContent('#3');
        expect(screen.getByTestId('final-score-display')).toHaveTextContent('1,450');
        expect(screen.getByTestId('participant-count-display')).toHaveTextContent('out of 15 players');
        expect(screen.getByTestId('participant-name')).toHaveTextContent('Saman');
      });
    });

    it('8. normal leaderboard event during game does NOT open final results screen', async () => {
      await setupJoinedUser();

      // Simulate mid-game leaderboard event
      mockClient.simulateMessage({
        type: 'leaderboard',
        session_id: 1,
        data: {
          top: [{ rank: 1, display_name: 'Leader', score: 500 }],
          count: 15,
          you: { rank: 2, score: 300 },
        },
      });

      await waitFor(() => {
        // Leaderboard renders
        expect(screen.getByRole('region', { name: /your ranking summary/i })).toBeInTheDocument();
        // Final result heading must NOT be present
        expect(screen.queryByRole('heading', { level: 1, name: /quiz completed!/i })).not.toBeInTheDocument();
      });
    });

    it('9. handles duplicate ended events idempotently without crashing', async () => {
      await setupJoinedUser();

      const endedPayload = {
        type: 'ended',
        session_id: 1,
        data: {
          reason: 'finished',
          count: 20,
          you: { rank: 2, score: 900 },
        },
      };

      // Emit first ended event
      mockClient.simulateMessage(endedPayload);

      await waitFor(() => {
        expect(screen.getByTestId('final-rank-display')).toHaveTextContent('#2');
      });

      // Emit duplicate ended event
      mockClient.simulateMessage(endedPayload);

      expect(screen.getByRole('heading', { level: 1, name: /quiz completed!/i })).toBeInTheDocument();
      expect(screen.getByTestId('final-rank-display')).toHaveTextContent('#2');
    });

    it('12. preserves Back to Home flow returning to Join Page form', async () => {
      await setupJoinedUser();

      mockClient.simulateMessage({
        type: 'ended',
        session_id: 1,
        data: {
          reason: 'finished',
          count: 10,
          you: { rank: 1, score: 1000 },
        },
      });

      await waitFor(() => {
        expect(screen.getByTestId('back-to-home-btn')).toBeInTheDocument();
      });

      // Click Back to Home
      fireEvent.click(screen.getByTestId('back-to-home-btn'));

      // Verify returned to original join page form
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Join Room/i })).toBeInTheDocument();
        expect(screen.getByLabelText(/6 Digit Room Code/i)).toBeInTheDocument();
      });
    });

    it('13. late leaderboard events after completion do not kick user out of final results', async () => {
      await setupJoinedUser();

      // End quiz
      mockClient.simulateMessage({
        type: 'ended',
        session_id: 1,
        data: {
          reason: 'finished',
          count: 8,
          you: { rank: 1, score: 1100 },
        },
      });

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1, name: /quiz completed!/i })).toBeInTheDocument();
      });

      // Late leaderboard event arriving
      mockClient.simulateMessage({
        type: 'leaderboard',
        session_id: 1,
        data: {
          top: [{ rank: 1, display_name: 'Saman', score: 1100 }],
          count: 8,
          you: { rank: 1, score: 1100 },
        },
      });

      // Still on FinalResult screen!
      expect(screen.getByRole('heading', { level: 1, name: /quiz completed!/i })).toBeInTheDocument();
      expect(screen.getByTestId('final-rank-display')).toHaveTextContent('#1');
    });

    it('15. prefers stable participant_id over duplicated display_name in ended results', async () => {
      await setupJoinedUser(); // Saman with participant_id: 101

      // Server ended event with duplicate names but distinct IDs
      mockClient.simulateMessage({
        type: 'ended',
        session_id: 1,
        data: {
          reason: 'finished',
          count: 2,
          top: [
            { rank: 1, participant_id: 999, display_name: 'Saman', score: 3000 },
            { rank: 2, participant_id: 101, display_name: 'Saman', score: 1500 },
          ],
        },
      });

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1, name: /quiz completed!/i })).toBeInTheDocument();
        // Correctly matches participant_id 101 (rank 2, score 1500), NOT rank 1
        expect(screen.getByTestId('final-rank-display')).toHaveTextContent('#2');
        expect(screen.getByTestId('final-score-display')).toHaveTextContent('1,500');
      });
    });

    it('16. does not fall back to stale joinedSession.score when server ended event has no score', async () => {
      await setupJoinedUser(); // Saman joined with initial score 100

      // Server ended event with NO you and participant not in top
      mockClient.simulateMessage({
        type: 'ended',
        session_id: 1,
        data: {
          reason: 'finished',
          count: 20,
          top: [
            { rank: 1, participant_id: 1, display_name: 'Alice', score: 2000 },
          ],
        },
      });

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1, name: /quiz completed!/i })).toBeInTheDocument();
        // Rank and score must display unavailable '-', NOT stale 100
        expect(screen.getByTestId('final-rank-display')).toHaveTextContent('-');
        expect(screen.getByTestId('final-score-display')).toHaveTextContent('-');
      });
    });
  });
});

