import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { QuizWebSocketClient } from '../lib/websocket';
import { QRCodeDisplay } from '../components/QRCodeDisplay';

const ROOM_CODE_REGEX = /^\d{6}$/;

/**
 * Deduplicate participants by unique participant_id or normalized display_name.
 */
export function deduplicateParticipants(list) {
  if (!Array.isArray(list)) return [];
  const seenIds = new Set();
  const seenNames = new Set();
  const result = [];

  for (const item of list) {
    if (!item) continue;
    const id = item.participant_id;
    const name = item.display_name ? item.display_name.trim().toLowerCase() : null;

    if (id !== undefined && id !== null) {
      if (!seenIds.has(id)) {
        seenIds.add(id);
        if (name) seenNames.add(name);
        result.push(item);
      }
    } else if (name) {
      if (!seenNames.has(name)) {
        seenNames.add(name);
        result.push(item);
      }
    }
  }

  return result;
}

export function BigScreenLobby({
  clientOverride = null,
  initialRoomCode = null,
  initialQrCode = null,
  initialJoinUrl = null,
  initialSessionId = null,
  onQuizStart = null,
}) {
  const params = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  // Resolve room code from URL params, location state, or props (preserves leading zeros)
  const rawCode = initialRoomCode || params.code || location.state?.room_code || location.state?.roomCode || '';
  const roomCode = String(rawCode).trim();
  const isCodeValid = ROOM_CODE_REGEX.test(roomCode);

  // Resolve metadata
  const qrCode = initialQrCode || location.state?.qr_code || location.state?.qrCode || null;
  const sessionId = initialSessionId || location.state?.room_id || location.state?.sessionId || null;
  const token = location.state?.token || null;

  // Resolve join URL
  const defaultJoinUrl = typeof window !== 'undefined' && window.location
    ? `${window.location.origin}/join/${roomCode}`
    : `http://localhost:5173/join/${roomCode}`;
  const joinUrl = initialJoinUrl || location.state?.join_url || location.state?.joinUrl || defaultJoinUrl;

  // Component state
  const [participants, setParticipants] = useState([]);
  const [participantCount, setParticipantCount] = useState(0);
  const [quizTitle, setQuizTitle] = useState(location.state?.quiz_title || 'Quiz Session');
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(true);
  const [errorMessage, setErrorMessage] = useState(isCodeValid ? '' : 'Invalid 6 digit room code.');
  const [quizStarted, setQuizStarted] = useState(false);

  const clientRef = useRef(clientOverride);

  const connectToRoom = useCallback(async () => {
    if (!isCodeValid) {
      setIsConnecting(false);
      setErrorMessage('Invalid 6 digit room code.');
      return;
    }

    setIsConnecting(true);
    setErrorMessage('');

    try {
      const client = clientOverride || new QuizWebSocketClient();
      clientRef.current = client;

      client.onOpen(() => {
        setIsConnected(true);
        setIsConnecting(false);
      });

      client.onMessage((msg) => {
        if (!msg || !msg.type) return;

        if (msg.type === 'host_joined') {
          setIsConnected(true);
          setIsConnecting(false);
          if (msg.data?.quiz_title) {
            setQuizTitle(msg.data.quiz_title);
          }
        } else if (msg.type === 'lobby') {
          const rawParticipants = msg.data?.participants || [];
          const uniqueList = deduplicateParticipants(rawParticipants);
          setParticipants(uniqueList);
          const count = typeof msg.data?.count === 'number' ? msg.data.count : uniqueList.length;
          setParticipantCount(count);
        } else if (msg.type === 'question') {
          // Quiz has started
          setQuizStarted(true);
          if (typeof onQuizStart === 'function') {
            onQuizStart(msg.data);
          }
        } else if (msg.type === 'error') {
          const code = msg.data?.code;
          const text = msg.data?.message;
          if (code === 'room_not_found') {
            setErrorMessage(`Room ${roomCode} not found.`);
          } else if (code === 'room_closed') {
            setErrorMessage('This quiz room has already closed.');
          } else {
            setErrorMessage(text || 'A room error occurred.');
          }
        }
      });

      client.onError(() => {
        setIsConnected(false);
        setIsConnecting(false);
        setErrorMessage('Unable to connect to the quiz server.');
      });

      client.onClose(() => {
        setIsConnected(false);
        setIsConnecting(false);
      });

      await client.connect();
      client.hostJoin('big_screen', sessionId, token, roomCode);
    } catch (err) {
      setIsConnected(false);
      setIsConnecting(false);
      setErrorMessage('Failed to connect to the room.');
    }
  }, [clientOverride, isCodeValid, onQuizStart, roomCode, sessionId, token]);

  useEffect(() => {
    connectToRoom();

    return () => {
      if (clientRef.current) {
        clientRef.current.disconnect();
      }
    };
  }, [connectToRoom]);

  // Invalid room code state
  if (!isCodeValid) {
    return (
      <div className="big-screen-container">
        <div className="big-screen-card error-card">
          <h1 className="big-screen-title">Invalid Room Code</h1>
          <p className="big-screen-subtitle">
            The room code &ldquo;{roomCode || 'empty'}&rdquo; is not a valid 6 digit code.
          </p>
          <button
            type="button"
            className="btn-primary"
            onClick={() => navigate('/join')}
            style={{ marginTop: '20px' }}
          >
            Go to Join Page
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="big-screen-container">
      {/* Top Banner */}
      <header className="big-screen-header">
        <div className="big-screen-brand-box">
          <h1 className="big-screen-brand">Lockin</h1>
          <span className="big-screen-quiz-title">{quizTitle}</span>
        </div>
        <div className="big-screen-status-box">
          {isConnecting ? (
            <span className="status-badge status-loading">Connecting...</span>
          ) : isConnected ? (
            <span className="status-badge status-connected">Live Lobby</span>
          ) : (
            <span className="status-badge status-disconnected">Disconnected</span>
          )}
        </div>
      </header>

      {/* Main Content Layout */}
      <main className="big-screen-main">
        {/* Left Column: Room Code, QR, and Instructions */}
        <section className="big-screen-left" aria-label="Join Information">
          <div className="big-screen-panel">
            <h2 className="big-screen-section-title">Join the Quiz</h2>

            <div className="big-screen-code-box">
              <span className="big-screen-code-label">Room Code</span>
              <div className="big-screen-code" aria-label={`Room Code ${roomCode}`}>
                {roomCode}
              </div>
            </div>

            <QRCodeDisplay
              qrCode={qrCode}
              joinUrl={joinUrl}
              roomCode={roomCode}
            />

            <div className="big-screen-url-box">
              <span className="big-screen-url-label">Or visit in your browser:</span>
              <div className="big-screen-url">{joinUrl}</div>
            </div>

            <div className="big-screen-instruction">
              <p>1. Open your phone camera or visit the link.</p>
              <p>2. Enter your display name and get ready!</p>
            </div>
          </div>
        </section>

        {/* Right Column: Participant Roster and Waiting Status */}
        <section className="big-screen-right" aria-label="Joined Participants">
          <div className="big-screen-panel">
            <div className="big-screen-roster-header">
              <h2 className="big-screen-section-title">
                Joined Players ({participantCount})
              </h2>
              <div className="big-screen-waiting-pill">
                <span className="pulse-dot"></span>
                <span>Waiting for host to start</span>
              </div>
            </div>

            {errorMessage && (
              <div className="alert alert-danger" role="alert">
                <span>{errorMessage}</span>
                {!isConnected && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={connectToRoom}
                    style={{ marginTop: '8px', padding: '6px 12px' }}
                  >
                    Retry Connection
                  </button>
                )}
              </div>
            )}

            {quizStarted ? (
              <div className="big-screen-started-box">
                <h3 className="big-screen-started-title">Quiz is Starting!</h3>
                <p>Get ready on your devices.</p>
              </div>
            ) : participants.length === 0 ? (
              <div className="big-screen-empty-state">
                <div className="empty-state-graphic">
                  <span className="empty-state-spinner"></span>
                </div>
                <h3 className="empty-state-title">No players have joined yet</h3>
                <p className="empty-state-subtitle">
                  Scan the QR code or enter code <strong>{roomCode}</strong> on your phone to be the first in!
                </p>
              </div>
            ) : (
              <div className="big-screen-grid" role="list" aria-label="Participants List">
                {participants.map((p, idx) => (
                  <div
                    key={p.participant_id ?? `${p.display_name}-${idx}`}
                    className="big-screen-player-card"
                    role="listitem"
                  >
                    <div className="player-avatar">
                      {p.display_name ? p.display_name.charAt(0).toUpperCase() : '?'}
                    </div>
                    <span className="player-name">{p.display_name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

export default BigScreenLobby;

