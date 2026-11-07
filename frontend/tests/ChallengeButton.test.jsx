import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ChallengeButton } from '../src/components/ChallengeButton';

// Mock WebSocket Client
class MockQuizWebSocketClient {
  constructor() {
    this.messageHandlers = new Set();
    this.sentMessages = [];
    this.isOpen = true;
  }

  onMessage(handler) {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  send(type, data, sessionId) {
    this.sentMessages.push({ type, data, sessionId });
  }

  emitMessage(msg) {
    this.messageHandlers.forEach((h) => h(msg));
  }
}

describe('ChallengeButton Component (PB-23)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.clear();
    }
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('Visibility & Phase Rules', () => {
    it('renders during reveal phase', () => {
      render(
        <ChallengeButton
          questionId={10}
          sessionId={1}
          participantId={5}
          isRevealPhase={true}
          phase="reveal"
        />
      );

      const button = screen.getByRole('button', { name: /challenge this question/i });
      expect(button).toBeInTheDocument();
      expect(button).toHaveTextContent('Challenge Question');
    });

    it('does not render when isRevealPhase is false', () => {
      const { container } = render(
        <ChallengeButton
          questionId={10}
          sessionId={1}
          participantId={5}
          isRevealPhase={false}
          phase="reveal"
        />
      );

      expect(container.firstChild).toBeNull();
    });

    it('does not render when phase is not reveal', () => {
      const { container } = render(
        <ChallengeButton
          questionId={10}
          sessionId={1}
          participantId={5}
          isRevealPhase={true}
          phase="question"
        />
      );

      expect(container.firstChild).toBeNull();
    });
  });

  describe('One-Tap Submission & Duplicate Prevention', () => {
    it('submits flag on a single tap without confirmation dialog', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 201,
        json: async () => ({
          message: 'Question flagged successfully',
          flag_id: 101,
          question_id: 10,
        }),
      });
      global.fetch = mockFetch;

      const onSuccess = vi.fn();

      render(
        <ChallengeButton
          questionId={10}
          sessionId={1}
          participantId={5}
          onFlagSuccess={onSuccess}
          apiBaseUrl="http://localhost:8000"
        />
      );

      const button = screen.getByRole('button', { name: /challenge this question/i });
      fireEvent.click(button);

      // Immediately disables button on click
      expect(button).toBeDisabled();

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8000/api/flags/',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: 1,
            question_id: 10,
            participant_id: 5,
            reason: 'Participant challenge',
          }),
        })
      );

      // Success message and state
      await waitFor(() => {
        expect(screen.getByText(/Question challenged! Host will review/i)).toBeInTheDocument();
        expect(screen.getByText('Flagged')).toBeInTheDocument();
      });

      expect(onSuccess).toHaveBeenCalledWith(
        expect.objectContaining({ flag_id: 101, question_id: 10 })
      );

      // Session storage is saved to prevent refresh duplicate
      expect(window.sessionStorage.getItem('lockin_flag_1_10_5')).toBe('true');
    });

    it('prevents multiple clicks while submission is in progress', async () => {
      let resolveFetch;
      const slowFetch = vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveFetch = resolve;
          })
      );
      global.fetch = slowFetch;

      render(
        <ChallengeButton
          questionId={10}
          sessionId={1}
          participantId={5}
          apiBaseUrl="http://localhost:8000"
        />
      );

      const button = screen.getByRole('button', { name: /challenge this question/i });
      fireEvent.click(button);
      fireEvent.click(button); // Duplicate second tap
      fireEvent.click(button); // Duplicate third tap

      expect(button).toBeDisabled();
      expect(screen.getByText('Submitting...')).toBeInTheDocument();
      expect(slowFetch).toHaveBeenCalledTimes(1);

      // Resolve slow network
      await act(async () => {
        resolveFetch({
          status: 201,
          json: async () => ({ message: 'Question flagged successfully' }),
        });
      });

      await waitFor(() => {
        expect(screen.getByText('Flagged')).toBeInTheDocument();
      });
      expect(slowFetch).toHaveBeenCalledTimes(1);
    });

    it('handles server 409 Conflict (already flagged) properly', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 409,
        json: async () => ({
          detail: 'You have already flagged this question',
        }),
      });
      global.fetch = mockFetch;

      const onError = vi.fn();

      render(
        <ChallengeButton
          questionId={10}
          sessionId={1}
          participantId={5}
          onFlagError={onError}
          apiBaseUrl="http://localhost:8000"
        />
      );

      const button = screen.getByRole('button', { name: /challenge this question/i });
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText(/You have already flagged this question/i)).toBeInTheDocument();
        expect(screen.getByText('Flagged')).toBeInTheDocument();
      });

      expect(button).toBeDisabled();
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ detail: 'You have already flagged this question' })
      );
    });

    it('handles network failure with clear error feedback', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network disconnected'));
      global.fetch = mockFetch;

      render(
        <ChallengeButton
          questionId={10}
          sessionId={1}
          participantId={5}
          apiBaseUrl="http://localhost:8000"
        />
      );

      const button = screen.getByRole('button', { name: /challenge this question/i });
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText(/Network error. Could not reach server/i)).toBeInTheDocument();
      });

      // After a network error, user can retry
      expect(button).not.toBeDisabled();
    });
  });

  describe('WebSocket Integration & Reconnection', () => {
    it('dispatches WebSocket flag message when submissionMethod is websocket', async () => {
      const mockClient = new MockQuizWebSocketClient();
      const mockFetch = vi.fn();
      global.fetch = mockFetch;

      render(
        <ChallengeButton
          questionId={22}
          sessionId={2}
          participantId={9}
          wsClient={mockClient}
          submissionMethod="websocket"
          apiBaseUrl="http://localhost:8000"
        />
      );

      const button = screen.getByRole('button', { name: /challenge this question/i });
      fireEvent.click(button);

      // Verify WebSocket flag message was sent with proper contract
      expect(mockClient.sentMessages).toHaveLength(1);
      expect(mockClient.sentMessages[0]).toEqual({
        type: 'flag',
        data: {
          question_id: 22,
          reason: 'Participant challenge',
        },
        sessionId: 2,
      });

      // Verify HTTP was NOT called (no duplicate submission!)
      expect(mockFetch).not.toHaveBeenCalled();

      // Simulate server ack
      act(() => {
        mockClient.emitMessage({
          type: 'ack',
          data: {
            for: 'flag',
            question_id: 22,
          },
        });
      });

      await waitFor(() => {
        expect(screen.getByText('Flagged')).toBeInTheDocument();
      });
    });

    it('ensures single submission: does NOT send websocket flag when HTTP submission method is used', async () => {
      const mockClient = new MockQuizWebSocketClient();
      const mockFetch = vi.fn().mockResolvedValue({
        status: 201,
        json: async () => ({ message: 'ok', flag_id: 1, question_id: 22 }),
      });
      global.fetch = mockFetch;

      render(
        <ChallengeButton
          questionId={22}
          sessionId={2}
          participantId={9}
          wsClient={mockClient}
          submissionMethod="http"
          apiBaseUrl="http://localhost:8000"
        />
      );

      const button = screen.getByRole('button', { name: /challenge this question/i });
      await act(async () => {
        fireEvent.click(button);
      });

      // Verify HTTP was called exactly once
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Verify WebSocket was NOT sent (strictly preventing dual submissions)
      expect(mockClient.sentMessages).toHaveLength(0);

      await waitFor(() => {
        expect(screen.getByText('Flagged')).toBeInTheDocument();
      });
    });

    it('restores flagged state from sessionStorage on reload / reconnection', () => {
      window.sessionStorage.setItem('lockin_flag_5_30_8', 'true');

      render(
        <ChallengeButton
          questionId={30}
          sessionId={5}
          participantId={8}
          apiBaseUrl="http://localhost:8000"
        />
      );

      const button = screen.getByRole('button', { name: /question flagged/i });
      expect(button).toBeDisabled();
      expect(button).toHaveTextContent('Flagged');
      expect(screen.getByText(/You have already challenged this question/i)).toBeInTheDocument();
    });
  });
});

