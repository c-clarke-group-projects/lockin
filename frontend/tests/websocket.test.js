import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QuizWebSocketClient, getWebSocketUrl } from '../src/lib/websocket';

describe('QuizWebSocketClient', () => {
  let mockSocket;
  let originalWebSocket;

  beforeEach(() => {
    originalWebSocket = global.WebSocket;

    mockSocket = {
      readyState: 1, // OPEN
      send: vi.fn(),
      close: vi.fn(),
    };

    global.WebSocket = vi.fn().mockImplementation(() => {
      setTimeout(() => {
        if (mockSocket.onopen) mockSocket.onopen({ type: 'open' });
      }, 0);
      return mockSocket;
    });
    global.WebSocket.OPEN = 1;
    global.WebSocket.CONNECTING = 0;
  });

  afterEach(() => {
    global.WebSocket = originalWebSocket;
    vi.clearAllMocks();
  });

  it('resolves the correct default websocket URL', () => {
    const url = getWebSocketUrl();
    expect(url).toMatch(/^wss?:\/\/.*\/ws$/);
  });

  it('connects and triggers onOpen', async () => {
    const client = new QuizWebSocketClient('ws://localhost:8000/ws');
    const openSpy = vi.fn();
    client.onOpen(openSpy);

    await client.connect();
    expect(global.WebSocket).toHaveBeenCalledWith('ws://localhost:8000/ws');
    expect(openSpy).toHaveBeenCalled();
  });

  it('sends join message matching WEBSOCKET_PROTOCOL.md envelope', async () => {
    const client = new QuizWebSocketClient();
    await client.connect();

    client.join('012345', 'Tharindu');

    expect(mockSocket.send).toHaveBeenCalledTimes(1);
    const sentData = JSON.parse(mockSocket.send.mock.calls[0][0]);
    expect(sentData).toEqual({
      type: 'join',
      session_id: null,
      data: {
        join_code: '012345',
        display_name: 'Tharindu',
      },
    });
  });

  it('sends rejoin message correctly', async () => {
    const client = new QuizWebSocketClient();
    await client.connect();

    client.rejoin('012345', 'Tharindu');

    expect(mockSocket.send).toHaveBeenCalledTimes(1);
    const sentData = JSON.parse(mockSocket.send.mock.calls[0][0]);
    expect(sentData).toEqual({
      type: 'rejoin',
      session_id: null,
      data: {
        join_code: '012345',
        display_name: 'Tharindu',
      },
    });
  });

  it('sends leave message and disconnects', async () => {
    const client = new QuizWebSocketClient();
    await client.connect();

    client.leave(42);

    expect(mockSocket.send).toHaveBeenCalledWith(
      JSON.stringify({
        type: 'leave',
        session_id: 42,
        data: {},
      })
    );
    expect(mockSocket.close).toHaveBeenCalled();
  });

  it('handles received messages and notifies subscribers', async () => {
    const client = new QuizWebSocketClient();
    await client.connect();

    const messageSpy = vi.fn();
    client.onMessage(messageSpy);

    const testMsg = { type: 'joined', session_id: 1, data: { participant_id: 10 } };
    mockSocket.onmessage({ data: JSON.stringify(testMsg) });

    expect(messageSpy).toHaveBeenCalledWith(testMsg);
  });

  it('notifies error subscribers on malformed json', async () => {
    const client = new QuizWebSocketClient();
    await client.connect();

    const errorSpy = vi.fn();
    client.onError(errorSpy);

    mockSocket.onmessage({ data: 'not-json' });

    expect(errorSpy).toHaveBeenCalled();
  });

  it('sends host_join message with screen and token', async () => {
    const client = new QuizWebSocketClient();
    await client.connect();

    client.hostJoin('big_screen', 42, 'secret-token', '012345');

    expect(mockSocket.send).toHaveBeenCalledTimes(1);
    const sentData = JSON.parse(mockSocket.send.mock.calls[0][0]);
    expect(sentData).toEqual({
      type: 'host_join',
      session_id: 42,
      token: 'secret-token',
      data: {
        screen: 'big_screen',
        join_code: '012345',
      },
    });
  });

  it('disconnects socket and clears callbacks', async () => {
    const client = new QuizWebSocketClient();
    await client.connect();

    client.disconnect();

    expect(mockSocket.close).toHaveBeenCalled();
    expect(client.isOpen).toBe(false);
  });
});

