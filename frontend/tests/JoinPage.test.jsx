import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { JoinPage } from '../src/pages/JoinPage';

// Mock WebSocket Client
class MockQuizWebSocketClient {
  constructor() {
    this.messageHandlers = new Set();
    this.errorHandlers = new Set();
    this.closeHandlers = new Set();
    this.connectCalled = false;
    this.joinArgs = null;
    this.leaveCalled = false;
    this.disconnected = false;
  }

  connect() {
    this.connectCalled = true;
    return Promise.resolve();
  }

  join(joinCode, displayName) {
    this.joinArgs = { joinCode, displayName };
  }

  leave() {
    this.leaveCalled = true;
  }

  disconnect() {
    this.disconnected = true;
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

describe('Participant Join Page (SCRUM-58)', () => {
  let mockClient;

  beforeEach(() => {
    mockClient = new MockQuizWebSocketClient();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const renderJoinPage = (initialEntries = ['/join']) => {
    return render(
      <MemoryRouter
        initialEntries={initialEntries}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/join" element={<JoinPage clientOverride={mockClient} />} />
          <Route path="/join/:code" element={<JoinPage clientOverride={mockClient} />} />
        </Routes>
      </MemoryRouter>
    );
  };

  it('1. renders the form with room code and display name inputs', () => {
    renderJoinPage();
    expect(screen.getByLabelText(/6 Digit Room Code/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Display Name/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Join Room/i })).toBeInTheDocument();
  });

  it('2. validates empty room code', async () => {
    renderJoinPage();
    const joinButton = screen.getByRole('button', { name: /Join Room/i });
    fireEvent.click(joinButton);

    expect(screen.getByRole('alert')).toHaveTextContent(/Please enter a 6 digit room code/i);
    expect(mockClient.connectCalled).toBe(false);
  });

  it('3. validates room code length less than 6 digits', async () => {
    renderJoinPage();
    const codeInput = screen.getByLabelText(/6 Digit Room Code/i);
    fireEvent.change(codeInput, { target: { value: '123' } });

    const nameInput = screen.getByLabelText(/Display Name/i);
    fireEvent.change(nameInput, { target: { value: 'Amal' } });

    fireEvent.click(screen.getByRole('button', { name: /Join Room/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/Room code must be exactly 6 digits/i);
    expect(mockClient.connectCalled).toBe(false);
  });

  it('4. strictly preserves leading zeros in room codes', async () => {
    renderJoinPage();
    const codeInput = screen.getByLabelText(/6 Digit Room Code/i);
    fireEvent.change(codeInput, { target: { value: '001234' } });

    expect(codeInput.value).toBe('001234');

    const nameInput = screen.getByLabelText(/Display Name/i);
    fireEvent.change(nameInput, { target: { value: 'Tharindu' } });

    fireEvent.click(screen.getByRole('button', { name: /Join Room/i }));

    await waitFor(() => {
      expect(mockClient.connectCalled).toBe(true);
      expect(mockClient.joinArgs).toEqual({
        joinCode: '001234',
        displayName: 'Tharindu',
      });
    });
  });

  it('5. filters non-numeric characters from room code input', () => {
    renderJoinPage();
    const codeInput = screen.getByLabelText(/6 Digit Room Code/i);
    fireEvent.change(codeInput, { target: { value: '12a3b4' } });

    expect(codeInput.value).toBe('1234');
  });

  it('6. validates empty display name', async () => {
    renderJoinPage();
    const codeInput = screen.getByLabelText(/6 Digit Room Code/i);
    fireEvent.change(codeInput, { target: { value: '123456' } });

    const nameInput = screen.getByLabelText(/Display Name/i);
    fireEvent.change(nameInput, { target: { value: '   ' } });

    fireEvent.click(screen.getByRole('button', { name: /Join Room/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/Please enter a display name/i);
    expect(mockClient.connectCalled).toBe(false);
  });

  it('7. trims display name before submission', async () => {
    renderJoinPage();
    const codeInput = screen.getByLabelText(/6 Digit Room Code/i);
    fireEvent.change(codeInput, { target: { value: '987654' } });

    const nameInput = screen.getByLabelText(/Display Name/i);
    fireEvent.change(nameInput, { target: { value: '  Kamal Silva  ' } });

    fireEvent.click(screen.getByRole('button', { name: /Join Room/i }));

    await waitFor(() => {
      expect(mockClient.joinArgs.displayName).toBe('Kamal Silva');
    });
  });

  it('8. automatically pre-populates room code from QR link URL path (/join/:code)', () => {
    renderJoinPage(['/join/054321']);

    const codeInput = screen.getByLabelText(/6 Digit Room Code/i);
    expect(codeInput.value).toBe('054321');
    expect(screen.getByRole('status')).toHaveTextContent(/Room code 054321 detected from link/i);
  });

  it('9. automatically pre-populates room code from query parameter (/join?code=...)', () => {
    renderJoinPage(['/join?code=009988']);

    const codeInput = screen.getByLabelText(/6 Digit Room Code/i);
    expect(codeInput.value).toBe('009988');
  });

  it('10. handles invalid room code in QR link gracefully', () => {
    renderJoinPage(['/join/invalidCode']);

    expect(screen.getByRole('alert')).toHaveTextContent(/The room code in the link is invalid/i);
  });

  it('11. prevents duplicate submissions and disables fields while joining', async () => {
    renderJoinPage();
    const codeInput = screen.getByLabelText(/6 Digit Room Code/i);
    const nameInput = screen.getByLabelText(/Display Name/i);
    const joinButton = screen.getByRole('button', { name: /Join Room/i });

    fireEvent.change(codeInput, { target: { value: '112233' } });
    fireEvent.change(nameInput, { target: { value: 'Nimal' } });

    fireEvent.click(joinButton);

    expect(screen.getByText(/Joining.../i)).toBeInTheDocument();
    expect(codeInput).toBeDisabled();
    expect(nameInput).toBeDisabled();
    expect(joinButton).toBeDisabled();
  });

  it('12. renders waiting lobby upon receiving joined and lobby messages', async () => {
    renderJoinPage();
    fireEvent.change(screen.getByLabelText(/6 Digit Room Code/i), { target: { value: '654321' } });
    fireEvent.change(screen.getByLabelText(/Display Name/i), { target: { value: 'Tharindu' } });

    fireEvent.click(screen.getByRole('button', { name: /Join Room/i }));

    await waitFor(() => {
      expect(mockClient.connectCalled).toBe(true);
    });

    // Simulate joined message from backend
    mockClient.simulateMessage({
      type: 'joined',
      session_id: 101,
      data: {
        participant_id: 5,
        display_name: 'Tharindu',
        quiz_title: 'Software Engineering Quiz',
        score: 0,
        rejoined: false,
      },
    });

    // Simulate lobby message from backend
    mockClient.simulateMessage({
      type: 'lobby',
      session_id: 101,
      data: {
        participants: [
          { participant_id: 5, display_name: 'Tharindu' },
          { participant_id: 6, display_name: 'Amal' },
        ],
        count: 2,
      },
    });

    await waitFor(() => {
      expect(screen.getByText('Software Engineering Quiz')).toBeInTheDocument();
      expect(screen.getByText(/Playing as:/i)).toHaveTextContent('Tharindu');
      expect(screen.getByText(/Room code:/i)).toHaveTextContent('654321');
      expect(screen.getByText(/Participants \(2\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Tharindu \(You\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Amal/i)).toBeInTheDocument();
    });
  });

  it('13. handles backend room_not_found error response', async () => {
    renderJoinPage();
    fireEvent.change(screen.getByLabelText(/6 Digit Room Code/i), { target: { value: '999999' } });
    fireEvent.change(screen.getByLabelText(/Display Name/i), { target: { value: 'Sunil' } });
    fireEvent.click(screen.getByRole('button', { name: /Join Room/i }));

    await waitFor(() => {
      expect(mockClient.connectCalled).toBe(true);
    });

    mockClient.simulateMessage({
      type: 'error',
      session_id: null,
      data: {
        code: 'room_not_found',
        message: 'No session has that join code',
      },
    });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Room 999999 not found. Please verify the code./i);
      expect(screen.getByRole('button', { name: /Join Room/i })).toBeEnabled();
    });
  });

  it('14. handles backend name_taken error response', async () => {
    renderJoinPage();
    fireEvent.change(screen.getByLabelText(/6 Digit Room Code/i), { target: { value: '123456' } });
    fireEvent.change(screen.getByLabelText(/Display Name/i), { target: { value: 'Kasun' } });
    fireEvent.click(screen.getByRole('button', { name: /Join Room/i }));

    await waitFor(() => {
      expect(mockClient.connectCalled).toBe(true);
    });

    mockClient.simulateMessage({
      type: 'error',
      session_id: null,
      data: {
        code: 'name_taken',
        message: 'The display name is already used in the room',
      },
    });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/The name "Kasun" is already taken in this room/i);
    });
  });

  it('15. handles WebSocket connection error gracefully', async () => {
    renderJoinPage();
    fireEvent.change(screen.getByLabelText(/6 Digit Room Code/i), { target: { value: '123456' } });
    fireEvent.change(screen.getByLabelText(/Display Name/i), { target: { value: 'Kasun' } });
    fireEvent.click(screen.getByRole('button', { name: /Join Room/i }));

    await waitFor(() => {
      expect(mockClient.connectCalled).toBe(true);
    });

    mockClient.simulateError(new Error('Connection failed'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Unable to connect to the quiz server/i);
      expect(screen.getByRole('button', { name: /Join Room/i })).toBeEnabled();
    });
  });

  it('16. allows leaving the waiting room to return to the join form', async () => {
    renderJoinPage();
    fireEvent.change(screen.getByLabelText(/6 Digit Room Code/i), { target: { value: '123456' } });
    fireEvent.change(screen.getByLabelText(/Display Name/i), { target: { value: 'Saman' } });
    fireEvent.click(screen.getByRole('button', { name: /Join Room/i }));

    await waitFor(() => {
      expect(mockClient.connectCalled).toBe(true);
    });

    mockClient.simulateMessage({
      type: 'joined',
      session_id: 42,
      data: {
        participant_id: 1,
        display_name: 'Saman',
        quiz_title: 'History Quiz',
      },
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Leave Room/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Leave Room/i }));

    await waitFor(() => {
      expect(mockClient.leaveCalled).toBe(true);
      expect(screen.getByRole('button', { name: /Join Room/i })).toBeInTheDocument();
    });
  });

  it('17. handles backend room_closed error response', async () => {
    renderJoinPage();
    fireEvent.change(screen.getByLabelText(/6 Digit Room Code/i), { target: { value: '123456' } });
    fireEvent.change(screen.getByLabelText(/Display Name/i), { target: { value: 'Saman' } });
    fireEvent.click(screen.getByRole('button', { name: /Join Room/i }));

    await waitFor(() => {
      expect(mockClient.connectCalled).toBe(true);
    });

    mockClient.simulateMessage({
      type: 'error',
      session_id: null,
      data: {
        code: 'room_closed',
        message: 'The session has ended',
      },
    });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/This quiz session has already ended/i);
    });
  });

  it('18. handles backend room_full error response', async () => {
    renderJoinPage();
    fireEvent.change(screen.getByLabelText(/6 Digit Room Code/i), { target: { value: '123456' } });
    fireEvent.change(screen.getByLabelText(/Display Name/i), { target: { value: 'Saman' } });
    fireEvent.click(screen.getByRole('button', { name: /Join Room/i }));

    await waitFor(() => {
      expect(mockClient.connectCalled).toBe(true);
    });

    mockClient.simulateMessage({
      type: 'error',
      session_id: null,
      data: {
        code: 'room_full',
        message: 'The room is full',
      },
    });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/This room is currently full/i);
    });
  });

  it('19. handles backend wrong_phase error response', async () => {
    renderJoinPage();
    fireEvent.change(screen.getByLabelText(/6 Digit Room Code/i), { target: { value: '123456' } });
    fireEvent.change(screen.getByLabelText(/Display Name/i), { target: { value: 'Saman' } });
    fireEvent.click(screen.getByRole('button', { name: /Join Room/i }));

    await waitFor(() => {
      expect(mockClient.connectCalled).toBe(true);
    });

    mockClient.simulateMessage({
      type: 'error',
      session_id: null,
      data: {
        code: 'wrong_phase',
        message: 'Quiz already in progress',
      },
    });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/The quiz has already started/i);
    });
  });

  it('20. handles backend name_invalid error response', async () => {
    renderJoinPage();
    fireEvent.change(screen.getByLabelText(/6 Digit Room Code/i), { target: { value: '123456' } });
    fireEvent.change(screen.getByLabelText(/Display Name/i), { target: { value: 'Saman' } });
    fireEvent.click(screen.getByRole('button', { name: /Join Room/i }));

    await waitFor(() => {
      expect(mockClient.connectCalled).toBe(true);
    });

    mockClient.simulateMessage({
      type: 'error',
      session_id: null,
      data: {
        code: 'name_invalid',
        message: 'Display name is invalid',
      },
    });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Display name must be 1 to 20 characters/i);
    });
  });
});
