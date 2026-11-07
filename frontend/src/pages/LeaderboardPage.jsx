import React, { useState, useEffect, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { QuizWebSocketClient } from '../lib/websocket';
import { Leaderboard } from '../components/Leaderboard';

const ROOM_CODE_REGEX = /^\d{6}$/;

/**
 * Leaderboard Page (PB-20).
 * Standalone page for viewing the live leaderboard on big screen or mobile.
 */
export function LeaderboardPage({
  clientOverride = null,
  initialRoomCode = null,
  initialSessionId = null,
}) {
  const params = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  // Extract room code from props, URL path param or location state
  const rawCode = initialRoomCode || params.code || location.state?.room_code || location.state?.roomCode || '';
  const roomCode = String(rawCode).trim();
  const isCodeValid = roomCode ? ROOM_CODE_REGEX.test(roomCode) : true;

  const sessionId = initialSessionId || location.state?.session_id || location.state?.sessionId || null;
  const initialVariant = location.state?.variant || (window.innerWidth < 768 ? 'mobile' : 'big-screen');

  const [variant, setVariant] = useState(initialVariant);
  const [top, setTop] = useState([]);
  const [count, setCount] = useState(0);
  const [you, setYou] = useState(location.state?.you || null);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(Boolean(activeClientNeedsConnect(clientOverride, roomCode)));
  const [errorMessage, setErrorMessage] = useState(!isCodeValid ? 'Invalid 6 digit room code.' : '');

  const clientRef = useRef(clientOverride);

  function activeClientNeedsConnect(client, code) {
    if (client) return false;
    return Boolean(code && ROOM_CODE_REGEX.test(code));
  }

  useEffect(() => {
    if (!roomCode || !ROOM_CODE_REGEX.test(roomCode)) {
      if (roomCode && !ROOM_CODE_REGEX.test(roomCode)) {
        setErrorMessage('Room code must be exactly 6 digits.');
      }
      return;
    }

    const client = clientOverride || new QuizWebSocketClient();
    clientRef.current = client;

    const unregOpen = client.onOpen(() => {
      setIsConnected(true);
      setIsLoading(false);
      setErrorMessage('');
    });

    const unregClose = client.onClose(() => {
      setIsConnected(false);
    });

    const unregError = client.onError(() => {
      setIsConnected(false);
      setIsLoading(false);
      setErrorMessage('Failed to connect to the quiz leaderboard.');
    });

    const unregMessage = client.onMessage((msg) => {
      if (!msg) return;
      if (msg.type === 'leaderboard' || msg.type === 'voided' || msg.type === 'ended') {
        if (msg.data?.top) setTop(msg.data.top);
        if (msg.data?.count !== undefined) setCount(msg.data.count);
        if (msg.data?.you) setYou(msg.data.you);
      }
      if (msg.type === 'error') {
        setErrorMessage(msg.data?.message || 'Error received from server.');
      }
    });

    if (!client.isOpen) {
      client.connect().catch(() => {
        setIsConnected(false);
        setIsLoading(false);
        setErrorMessage('Could not establish WebSocket connection.');
      });
    } else {
      setIsConnected(true);
      setIsLoading(false);
    }

    return () => {
      if (typeof unregOpen === 'function') unregOpen();
      if (typeof unregClose === 'function') unregClose();
      if (typeof unregError === 'function') unregError();
      if (typeof unregMessage === 'function') unregMessage();
      if (!clientOverride && clientRef.current) {
        clientRef.current.disconnect();
      }
    };
  }, [roomCode, clientOverride]);

  return (
    <div
      className="leaderboard-page-container"
      style={{
        minHeight: '100vh',
        backgroundColor: '#f8fafc',
        padding: '24px 16px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      {/* Top Bar Navigation */}
      <div
        style={{
          width: '100%',
          maxWidth: variant === 'mobile' ? '480px' : '900px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px',
        }}
      >
        <button
          type="button"
          onClick={() => navigate(-1)}
          style={{
            padding: '8px 14px',
            fontSize: '13px',
            fontWeight: '600',
            borderRadius: '6px',
            border: '1px solid #cbd5e1',
            backgroundColor: '#ffffff',
            color: '#334155',
            cursor: 'pointer',
          }}
        >
          ← Back
        </button>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={() => setVariant('big-screen')}
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: '600',
              borderRadius: '6px',
              border: variant === 'big-screen' ? '1px solid #2563eb' : '1px solid #cbd5e1',
              backgroundColor: variant === 'big-screen' ? '#2563eb' : '#ffffff',
              color: variant === 'big-screen' ? '#ffffff' : '#64748b',
              cursor: 'pointer',
            }}
          >
            Big Screen
          </button>
          <button
            type="button"
            onClick={() => setVariant('mobile')}
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: '600',
              borderRadius: '6px',
              border: variant === 'mobile' ? '1px solid #2563eb' : '1px solid #cbd5e1',
              backgroundColor: variant === 'mobile' ? '#2563eb' : '#ffffff',
              color: variant === 'mobile' ? '#ffffff' : '#64748b',
              cursor: 'pointer',
            }}
          >
            Mobile View
          </button>
        </div>
      </div>

      {/* Main Leaderboard View */}
      <main style={{ width: '100%' }}>
        <Leaderboard
          top={top}
          count={count}
          you={you}
          variant={variant}
          clientOverride={clientRef.current}
          isLoading={isLoading}
          isDisconnected={roomCode ? !isConnected && !isLoading : false}
          error={errorMessage}
          title={roomCode ? `Leaderboard (Room ${roomCode})` : 'Live Leaderboard'}
        />
      </main>
    </div>
  );
}

export default LeaderboardPage;

