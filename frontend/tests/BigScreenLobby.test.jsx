import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { BigScreenLobby, deduplicateParticipants } from '../src/pages/BigScreenLobby';

// Mock WebSocket Client
class MockQuizWebSocketClient {
  constructor() {
    this.messageHandlers = new Set();
    this.errorHandlers = new Set();
    this.closeHandlers = new Set();
    this.openHandlers = new Set();
    this.connectCalled = false;
    this.hostJoinArgs = null;
    this.disconnected = false;
  }

  connect() {
    this.connectCalled = true;
    setTimeout(() => {
      this.openHandlers.forEach((h) => h());
    }, 0);
    return Promise.resolve();
  }

  hostJoin(screen, sessionId, token, joinCode) {
    this.hostJoinArgs = { screen, sessionId, token, joinCode };
  }

  onOpen(handler) {
    this.openHandlers.add(handler);
    return () => this.openHandlers.delete(handler);
  }

  onMessage(handler) {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onError(handler) {
    this.errorHandlers.add(handler);
    return () => this.errorHandlers.delete(handler);
  }

  onClose(handler) {
    this.closeHandlers.add(handler);
    return () => this.closeHandlers.delete(handler);
  }

  disconnect() {
    this.disconnected = true;
  }

  simulateMessage(msg) {
    act(() => {
      this.messageHandlers.forEach((handler) => handler(msg));
    });
  }

  simulateError(err) {
    act(() => {
      this.errorHandlers.forEach((handler) => handler(err));
    });
  }

  simulateClose() {
    act(() => {
      this.closeHandlers.forEach((handler) => handler());
    });
  }
}

describe('Big Screen Lobby Component (SCRUM-60)', () => {
  let mockClient;

  beforeEach(() => {
    mockClient = new MockQuizWebSocketClient();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const renderLobby = (props = {}, initialEntries = ['/big-screen/012345']) => {
    return render(
      <MemoryRouter
        initialEntries={initialEntries}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route
            path="/big-screen/:code"
            element={<BigScreenLobby clientOverride={mockClient} {...props} />}
          />
          <Route
            path="/big-screen"
            element={<BigScreenLobby clientOverride={mockClient} {...props} />}
          />
          <Route path="/join" element={<div>Join Page Placeholder</div>} />
        </Routes>
      </MemoryRouter>
    );
  };

  it('1. renders the big screen lobby with room code and join instructions', async () => {
    renderLobby();

    expect(screen.getByText('Lockin')).toBeInTheDocument();
    expect(screen.getByLabelText('Room Code 012345')).toBeInTheDocument();
    expect(screen.getByText(/Join the Quiz/i)).toBeInTheDocument();
    expect(screen.getByText(/Scan with your phone camera to join/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(mockClient.connectCalled).toBe(true);
      expect(mockClient.hostJoinArgs.joinCode).toBe('012345');
      expect(mockClient.hostJoinArgs.screen).toBe('big_screen');
    });
  });

  it('2. strictly preserves leading zeros in room codes (e.g. 000123)', () => {
    renderLobby({}, ['/big-screen/000123']);

    const codeElement = screen.getByLabelText('Room Code 000123');
    expect(codeElement).toBeInTheDocument();
    expect(codeElement).toHaveTextContent('000123');
  });

  it('3. displays QR code image when supplied via props or state', () => {
    const fakeQrCode = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

    renderLobby({ initialQrCode: fakeQrCode });

    const qrImage = screen.getByRole('img', { name: /Scan QR code to join room 012345/i });
    expect(qrImage).toBeInTheDocument();
    expect(qrImage).toHaveAttribute('src', fakeQrCode);
  });

  it('4. displays participant join URL clearly', () => {
    renderLobby({ initialJoinUrl: 'http://localhost:5173/join/012345' });

    expect(screen.getByText('http://localhost:5173/join/012345')).toBeInTheDocument();
  });

  it('5. renders a real scannable SVG QR code fallback containing the exact join URL when no image is provided', () => {
    renderLobby({ initialJoinUrl: 'http://localhost:5173/join/012345' });

    const qrSvg = screen.getByRole('img', { name: /Real QR code for http:\/\/localhost:5173\/join\/012345/i });
    expect(qrSvg).toBeInTheDocument();
  });

  it('5. shows empty lobby state when no players have joined yet', () => {
    renderLobby();

    expect(screen.getByText(/No players have joined yet/i)).toBeInTheDocument();
    expect(screen.getByText(/Joined Players \(0\)/i)).toBeInTheDocument();
  });

  it('6. updates participant list dynamically when lobby message arrives', async () => {
    renderLobby();

    await waitFor(() => {
      expect(mockClient.connectCalled).toBe(true);
    });

    // Simulate lobby broadcast from server with 2 participants
    mockClient.simulateMessage({
      type: 'lobby',
      session_id: 10,
      data: {
        participants: [
          { participant_id: 1, display_name: 'Tharindu' },
          { participant_id: 2, display_name: 'Amal' },
        ],
        count: 2,
      },
    });

    await waitFor(() => {
      expect(screen.getByText(/Joined Players \(2\)/i)).toBeInTheDocument();
      expect(screen.getByText('Tharindu')).toBeInTheDocument();
      expect(screen.getByText('Amal')).toBeInTheDocument();
    });
  });

  it('7. updates participant list when someone leaves the room', async () => {
    renderLobby();

    await waitFor(() => {
      expect(mockClient.connectCalled).toBe(true);
    });

    // Initial 2 participants
    mockClient.simulateMessage({
      type: 'lobby',
      session_id: 10,
      data: {
        participants: [
          { participant_id: 1, display_name: 'Tharindu' },
          { participant_id: 2, display_name: 'Amal' },
        ],
        count: 2,
      },
    });

    await waitFor(() => {
      expect(screen.getByText('Amal')).toBeInTheDocument();
    });

    // Amal leaves
    mockClient.simulateMessage({
      type: 'lobby',
      session_id: 10,
      data: {
        participants: [
          { participant_id: 1, display_name: 'Tharindu' },
        ],
        count: 1,
      },
    });

    await waitFor(() => {
      expect(screen.getByText(/Joined Players \(1\)/i)).toBeInTheDocument();
      expect(screen.getByText('Tharindu')).toBeInTheDocument();
      expect(screen.queryByText('Amal')).not.toBeInTheDocument();
    });
  });

  it('8. deduplicates participant entries correctly', () => {
    const raw = [
      { participant_id: 1, display_name: 'Kasun' },
      { participant_id: 1, display_name: 'Kasun' },
      { participant_id: 2, display_name: 'Nimal' },
      { participant_id: null, display_name: 'Sunil' },
      { participant_id: null, display_name: 'sunil' },
    ];

    const unique = deduplicateParticipants(raw);
    expect(unique).toHaveLength(3);
    expect(unique.map((p) => p.display_name)).toEqual(['Kasun', 'Nimal', 'Sunil']);
  });

  it('9. updates quiz title when host_joined message is received', async () => {
    renderLobby();

    await waitFor(() => {
      expect(mockClient.connectCalled).toBe(true);
    });

    mockClient.simulateMessage({
      type: 'host_joined',
      session_id: 42,
      data: {
        screen: 'big_screen',
        quiz_title: 'Biology Semester Final',
        join_code: '012345',
        status: 'waiting',
      },
    });

    await waitFor(() => {
      expect(screen.getByText('Biology Semester Final')).toBeInTheDocument();
    });
  });

  it('10. handles invalid room code and allows navigation to join page', () => {
    renderLobby({}, ['/big-screen/invalid']);

    expect(screen.getByText(/Invalid Room Code/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Go to Join Page/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Go to Join Page/i }));
    expect(screen.getByText('Join Page Placeholder')).toBeInTheDocument();
  });

  it('11. displays error alert and retry button on server connection failure', async () => {
    renderLobby();

    await waitFor(() => {
      expect(mockClient.connectCalled).toBe(true);
    });

    mockClient.simulateError(new Error('Connection dropped'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Unable to connect to the quiz server/i);
      expect(screen.getByRole('button', { name: /Retry Connection/i })).toBeInTheDocument();
    });
  });

  it('12. handles server room_not_found error response', async () => {
    renderLobby();

    await waitFor(() => {
      expect(mockClient.connectCalled).toBe(true);
    });

    mockClient.simulateMessage({
      type: 'error',
      session_id: null,
      data: {
        code: 'room_not_found',
        message: 'No session found for this join code',
      },
    });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Room 012345 not found/i);
    });
  });

  it('13. handles question start event and triggers onQuizStart callback', async () => {
    const quizStartSpy = vi.fn();
    renderLobby({ onQuizStart: quizStartSpy });

    await waitFor(() => {
      expect(mockClient.connectCalled).toBe(true);
    });

    mockClient.simulateMessage({
      type: 'question',
      session_id: 10,
      data: {
        question_id: 1,
        number: 1,
        total: 5,
        text: 'What is photosynthesis?',
      },
    });

    await waitFor(() => {
      expect(screen.getByText(/Quiz is Starting!/i)).toBeInTheDocument();
      expect(quizStartSpy).toHaveBeenCalledWith(
        expect.objectContaining({ question_id: 1, number: 1 })
      );
    });
  });

  it('14. cleans up websocket connection when unmounted', () => {
    const { unmount } = renderLobby();
    unmount();

    expect(mockClient.disconnected).toBe(true);
  });

  it('15. transitions to leaderboard view upon receiving leaderboard message (SCRUM-62)', async () => {
    renderLobby({ initialRoomCode: '654321' });

    await waitFor(() => {
      expect(mockClient.connectCalled).toBe(true);
    });

    mockClient.simulateMessage({
      type: 'leaderboard',
      session_id: 1,
      data: {
        top: [
          { rank: 1, participant_id: 1, display_name: 'Big Screen Leader', score: 1800 },
        ],
        count: 1,
      },
    });

    await waitFor(() => {
      expect(screen.getByText('Big Screen Leader')).toBeInTheDocument();
      expect(screen.getByText('1800')).toBeInTheDocument();
    });
  });
});
