import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { LeaderboardPage } from '../src/pages/LeaderboardPage';

class MockQuizWebSocketClient {
  constructor() {
    this.messageHandlers = new Set();
    this.openHandlers = new Set();
    this.closeHandlers = new Set();
    this.errorHandlers = new Set();
    this.isOpen = false;
  }

  connect() {
    this.isOpen = true;
    setTimeout(() => {
      this.openHandlers.forEach((h) => h());
    }, 0);
    return Promise.resolve();
  }

  disconnect() {
    this.isOpen = false;
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
}

describe('LeaderboardPage', () => {
  beforeEach(() => {
    window.localStorage.removeItem('access_token');
  });

  it('renders page and validates room code from route', async () => {
    const mockClient = new MockQuizWebSocketClient();

    render(
      <MemoryRouter initialEntries={['/leaderboard/123456']}>
        <Routes>
          <Route
            path="/leaderboard/:code"
            element={<LeaderboardPage clientOverride={mockClient} />}
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText(/Leaderboard \(Room 123456\)/i)).toBeInTheDocument();
  });

  it('allows toggling between Big Screen and Mobile views', async () => {
    const mockClient = new MockQuizWebSocketClient();

    render(
      <MemoryRouter initialEntries={['/leaderboard/123456']}>
        <Routes>
          <Route
            path="/leaderboard/:code"
            element={<LeaderboardPage clientOverride={mockClient} />}
          />
        </Routes>
      </MemoryRouter>
    );

    const mobileBtn = screen.getByRole('button', { name: /mobile view/i });
    const bigScreenBtn = screen.getByRole('button', { name: /big screen/i });

    fireEvent.click(mobileBtn);
    expect(mobileBtn).toHaveStyle({ backgroundColor: '#2563eb' });

    fireEvent.click(bigScreenBtn);
    expect(bigScreenBtn).toHaveStyle({ backgroundColor: '#2563eb' });
  });

  it('updates rankings when leaderboard message is received over WebSocket', async () => {
    const mockClient = new MockQuizWebSocketClient();

    render(
      <MemoryRouter initialEntries={['/leaderboard/654321']}>
        <Routes>
          <Route
            path="/leaderboard/:code"
            element={<LeaderboardPage clientOverride={mockClient} />}
          />
        </Routes>
      </MemoryRouter>
    );

    act(() => {
      mockClient.emitMessage({
        type: 'leaderboard',
        data: {
          top: [
            { rank: 1, participant_id: 1, display_name: 'Superstar', score: 990 },
          ],
          count: 1,
        },
      });
    });

    expect(screen.getByText('Superstar')).toBeInTheDocument();
    expect(screen.getByText('990')).toBeInTheDocument();
  });

  it('offers the host a flagged-question review after the game ends', () => {
    window.localStorage.setItem('access_token', 'host-token');
    const mockClient = new MockQuizWebSocketClient();

    render(
      <MemoryRouter initialEntries={['/leaderboard/654321']}>
        <Routes>
          <Route
            path="/leaderboard/:code"
            element={(
              <LeaderboardPage
                clientOverride={mockClient}
                initialSessionId={42}
              />
            )}
          />
        </Routes>
      </MemoryRouter>
    );

    act(() => {
      mockClient.emitMessage({
        type: 'ended',
        session_id: 42,
        data: { top: [], count: 0 },
      });
    });

    expect(
      screen.getByRole('button', { name: 'Review flagged questions' })
    ).toBeInTheDocument();
    window.localStorage.removeItem('access_token');
  });
});
