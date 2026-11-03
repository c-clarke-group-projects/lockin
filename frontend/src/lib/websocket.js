/**
 * WebSocket client for Lockin quiz sessions.
 * Implements docs/WEBSOCKET_PROTOCOL.md.
 */

export function getWebSocketUrl() {
  const envUrl = import.meta.env?.VITE_WS_BASE_URL;
  if (envUrl) {
    const base = envUrl.replace(/\/+$/, '');
    return `${base}/ws`;
  }
  if (typeof window !== 'undefined' && window.location) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname || 'localhost';
    const port = '8000';
    return `${protocol}//${host}:${port}/ws`;
  }
  return 'ws://localhost:8000/ws';
}

export class QuizWebSocketClient {
  constructor(url = getWebSocketUrl()) {
    this.url = url;
    this.socket = null;
    this.messageHandlers = new Set();
    this.errorHandlers = new Set();
    this.closeHandlers = new Set();
    this.openHandlers = new Set();
    this.isOpen = false;
  }

  connect() {
    return new Promise((resolve, reject) => {
      try {
        this.socket = new WebSocket(this.url);

        this.socket.onopen = (event) => {
          this.isOpen = true;
          this.openHandlers.forEach((handler) => handler(event));
          resolve(event);
        };

        this.socket.onmessage = (event) => {
          try {
            const parsed = JSON.parse(event.data);
            this.messageHandlers.forEach((handler) => handler(parsed));
          } catch (err) {
            this.errorHandlers.forEach((handler) =>
              handler(new Error('Invalid message format received from server'))
            );
          }
        };

        this.socket.onerror = (event) => {
          this.errorHandlers.forEach((handler) => handler(event));
          reject(event);
        };

        this.socket.onclose = (event) => {
          this.isOpen = false;
          this.closeHandlers.forEach((handler) => handler(event));
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  send(type, data = {}, sessionId = null, token = null) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }
    const message = {
      type,
      session_id: sessionId,
      data,
    };
    if (token) {
      message.token = token;
    }
    this.socket.send(JSON.stringify(message));
  }

  join(joinCode, displayName) {
    this.send('join', {
      join_code: joinCode,
      display_name: displayName,
    }, null);
  }

  rejoin(joinCode, displayName) {
    this.send('rejoin', {
      join_code: joinCode,
      display_name: displayName,
    }, null);
  }

  hostJoin(screen = 'big_screen', sessionId = null, token = null, joinCode = null) {
    const data = { screen };
    if (joinCode) {
      data.join_code = joinCode;
    }
    this.send('host_join', data, sessionId, token);
  }

  leave(sessionId = null) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.send('leave', {}, sessionId);
    }
    this.disconnect();
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

  onOpen(handler) {
    this.openHandlers.add(handler);
    return () => this.openHandlers.delete(handler);
  }

  disconnect() {
    if (this.socket) {
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onerror = null;
      this.socket.onclose = null;
      if (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING) {
        this.socket.close();
      }
      this.socket = null;
    }
    this.isOpen = false;
    this.messageHandlers.clear();
    this.errorHandlers.clear();
    this.closeHandlers.clear();
    this.openHandlers.clear();
  }
}

