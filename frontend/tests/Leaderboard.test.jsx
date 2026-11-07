import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { Leaderboard, deduplicateLeaderboard } from '../src/components/Leaderboard';

// Mock WebSocket client for Leaderboard
class MockQuizWebSocketClient {
  constructor() {
    this.messageHandlers = new Set();
    this.openHandlers = new Set();
    this.closeHandlers = new Set();
    this.errorHandlers = new Set();
    this.isOpen = true;
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

  emitMessage(msg) {
    this.messageHandlers.forEach((h) => h(msg));
  }

  emitClose() {
    this.isOpen = false;
    this.closeHandlers.forEach((h) => h());
  }

  emitError(err) {
    this.errorHandlers.forEach((h) => h(err));
  }
}

describe('Leaderboard Component (PB-20)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Deduplication Utility', () => {
    it('removes duplicate entries by participant_id', () => {
      const list = [
        { participant_id: 1, display_name: 'Alice', score: 100 },
        { participant_id: 1, display_name: 'Alice Duplicate', score: 100 },
        { participant_id: 2, display_name: 'Bob', score: 80 },
      ];
      const result = deduplicateLeaderboard(list);
      expect(result).toHaveLength(2);
      expect(result[0].display_name).toBe('Alice');
      expect(result[1].display_name).toBe('Bob');
    });

    it('removes duplicate entries by case-insensitive display_name when ids are missing', () => {
      const list = [
        { display_name: 'Charlie', score: 90 },
        { display_name: 'charlie', score: 90 },
        { display_name: 'Dave', score: 70 },
      ];
      const result = deduplicateLeaderboard(list);
      expect(result).toHaveLength(2);
      expect(result[0].display_name).toBe('Charlie');
      expect(result[1].display_name).toBe('Dave');
    });

    it('returns empty array when input is invalid or empty', () => {
      expect(deduplicateLeaderboard(null)).toEqual([]);
      expect(deduplicateLeaderboard([])).toEqual([]);
    });
  });

  describe('Rendering Rankings & Scores', () => {
    it('displays ranks, player names, and scores correctly', () => {
      const top = [
        { rank: 1, participant_id: 1, display_name: 'Alice', score: 1200 },
        { rank: 2, participant_id: 2, display_name: 'Bob', score: 950 },
        { rank: 3, participant_id: 3, display_name: 'Charlie', score: 800 },
      ];

      render(<Leaderboard top={top} count={3} />);

      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('Bob')).toBeInTheDocument();
      expect(screen.getByText('Charlie')).toBeInTheDocument();
      expect(screen.getByText('1200')).toBeInTheDocument();
      expect(screen.getByText('950')).toBeInTheDocument();
      expect(screen.getByText('800')).toBeInTheDocument();
      expect(screen.getByText(/3 participants/i)).toBeInTheDocument();
    });

    it('preserves backend-defined tie-breaking ranks without reordering', () => {
      // Backend tie-breaking ranks: Player B is rank 1 due to lower avg time, Player A is rank 2 with same score
      const tieBoard = [
        { rank: 1, participant_id: 2, display_name: 'Player B', score: 1000, average_time_ms: 3000 },
        { rank: 2, participant_id: 1, display_name: 'Player A', score: 1000, average_time_ms: 5000 },
      ];

      render(<Leaderboard top={tieBoard} count={2} />);

      const row0 = screen.getByTestId('leaderboard-row-0');
      const row1 = screen.getByTestId('leaderboard-row-1');

      expect(row0).toHaveTextContent('Player B');
      expect(row1).toHaveTextContent('Player A');
    });

    it('renders empty state when no participants are present', () => {
      render(<Leaderboard top={[]} count={0} />);

      expect(screen.getByText(/No players on the leaderboard yet/i)).toBeInTheDocument();
      expect(screen.getByText(/Scores will appear here as soon as questions are answered/i)).toBeInTheDocument();
    });

    it('renders loading state when isLoading is true', () => {
      render(<Leaderboard top={[]} isLoading={true} />);

      expect(screen.getByText(/Loading leaderboard.../i)).toBeInTheDocument();
    });

    it('renders error state when error prop is provided', () => {
      render(<Leaderboard top={[]} error="Failed to fetch live scores" />);

      expect(screen.getByText(/Failed to fetch live scores/i)).toBeInTheDocument();
    });

    it('renders disconnected banner when isDisconnected is true', () => {
      render(<Leaderboard top={[]} isDisconnected={true} />);

      expect(screen.getByText(/Connection lost. Reconnecting to live scores.../i)).toBeInTheDocument();
    });
  });

  describe('Personal Display & Variants', () => {
    it('highlights personal ranking when you prop is provided', () => {
      const top = [
        { rank: 1, participant_id: 1, display_name: 'Alice', score: 1000 },
        { rank: 2, participant_id: 2, display_name: 'Bob', score: 800 },
      ];
      const you = { rank: 1, participant_id: 1, display_name: 'Alice', score: 1000 };

      render(<Leaderboard top={top} count={2} you={you} variant="mobile" />);

      // Should show "You" badge in Alice's row
      expect(screen.getByText('You')).toBeInTheDocument();

      // Should show personal rank banner
      expect(screen.getByRole('region', { name: /your ranking summary/i })).toBeInTheDocument();
      expect(screen.getByText('#1')).toBeInTheDocument();
      expect(screen.getByText(/1000 pts/i)).toBeInTheDocument();
    });
  });

  describe('Real-Time WebSocket Updates', () => {
    it('updates rankings dynamically on leaderboard WebSocket event', () => {
      const mockClient = new MockQuizWebSocketClient();
      render(<Leaderboard clientOverride={mockClient} top={[]} count={0} />);

      expect(screen.getByText(/No players on the leaderboard yet/i)).toBeInTheDocument();

      act(() => {
        mockClient.emitMessage({
          type: 'leaderboard',
          data: {
            top: [
              { rank: 1, participant_id: 10, display_name: 'Live Champion', score: 1500 },
            ],
            count: 1,
          },
        });
      });

      expect(screen.getByText('Live Champion')).toBeInTheDocument();
      expect(screen.getByText('1500')).toBeInTheDocument();
    });

    it('handles voided question events and updates leaderboard with notification', () => {
      const mockClient = new MockQuizWebSocketClient();
      render(<Leaderboard clientOverride={mockClient} top={[]} count={0} />);

      act(() => {
        mockClient.emitMessage({
          type: 'voided',
          data: {
            question_id: 42,
            top: [
              { rank: 1, participant_id: 5, display_name: 'Recalculated Leader', score: 900 },
            ],
            count: 1,
          },
        });
      });

      expect(screen.getByText(/Question 42 was voided. Leaderboard updated!/i)).toBeInTheDocument();
      expect(screen.getByText('Recalculated Leader')).toBeInTheDocument();
      expect(screen.getByText('900')).toBeInTheDocument();
    });

    it('handles ended quiz event with final standings', () => {
      const mockClient = new MockQuizWebSocketClient();
      render(<Leaderboard clientOverride={mockClient} top={[]} count={0} />);

      act(() => {
        mockClient.emitMessage({
          type: 'ended',
          data: {
            reason: 'finished',
            top: [
              { rank: 1, participant_id: 1, display_name: 'Winner', score: 2000 },
            ],
            count: 1,
          },
        });
      });

      expect(screen.getByText('Winner')).toBeInTheDocument();
      expect(screen.getByText('2000')).toBeInTheDocument();
    });

    it('shows disconnected state when WebSocket closes', () => {
      const mockClient = new MockQuizWebSocketClient();
      render(<Leaderboard clientOverride={mockClient} top={[{ rank: 1, display_name: 'Player', score: 100 }]} />);

      act(() => {
        mockClient.emitClose();
      });

      expect(screen.getByText(/Connection lost. Reconnecting to live scores.../i)).toBeInTheDocument();
    });
  });
});

