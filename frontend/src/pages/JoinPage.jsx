import React, { useState, useEffect, useRef } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { QuizWebSocketClient } from '../lib/websocket';
import { liveSocketUrl } from '../lib/config';
import { WaitingLobby } from '../components/WaitingLobby';
import { BackgroundTextEffect } from '../components/BackgroundTextEffect';
import { LockInLogo } from '../components/LockInLogo';
import { Icon } from '../components/Icon';

const ROOM_CODE_REGEX = /^\d{6}$/;
const MAX_NAME_LENGTH = 20;
const CONNECTION_TIMEOUT_MS = 10000;
const MAX_REJOIN_ATTEMPTS = 8;
const REJOIN_STEP_MS = 2000;
const MAX_REJOIN_DELAY_MS = 8000;

const JOIN_ERRORS = {
  room_closed: () => 'This quiz session has already ended.',
  room_full: () => 'This room is currently full.',
  name_invalid: () => 'Display name must be 1 to 20 characters.',
  wrong_phase: () => 'The quiz has already started. New participants cannot join.',
};

function joinErrorText(code, message, validated) {
  if (code === 'room_not_found') {
    return `Room ${validated.code} not found. Please verify the code.`;
  }
  if (code === 'name_taken') {
    return `The name "${validated.name}" is already taken in this room.`;
  }
  return JOIN_ERRORS[code]?.() || message || 'Unable to join the room. Please try again.';
}

export function JoinPage({ clientOverride = null }) {
  const { code: routeCode } = useParams();
  const [searchParams] = useSearchParams();

  const [roomCode, setRoomCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [infoMessage, setInfoMessage] = useState('');

  // Joined state
  const [joinedSession, setJoinedSession] = useState(null);
  const [lobbyParticipants, setLobbyParticipants] = useState([]);
  const [participantCount, setParticipantCount] = useState(0);
  const [reconnecting, setReconnecting] = useState(false);

  const nameInputRef = useRef(null);
  const codeInputRef = useRef(null);
  const clientRef = useRef(clientOverride);
  const timeoutTimerRef = useRef(null);
  const rejoinTimerRef = useRef(null);
  const joiningRef = useRef(false);
  const joinedRef = useRef(null);
  const leavingRef = useRef(false);

  // Initialize room code from URL (path parameter or query param)
  useEffect(() => {
    const rawCode = routeCode || searchParams.get('code');
    if (rawCode) {
      const trimmed = rawCode.trim();
      if (ROOM_CODE_REGEX.test(trimmed)) {
        setRoomCode(trimmed);
        setInfoMessage(`Room code ${trimmed} detected from link.`);
        if (nameInputRef.current) {
          nameInputRef.current.focus();
        }
      } else {
        setErrorMessage('The room code in the link is invalid. It must be a 6 digit number.');
      }
    }
  }, [routeCode, searchParams]);

  // Cleanup WebSocket and timers on unmount
  useEffect(() => {
    return () => {
      leavingRef.current = true;
      clearTimeout(timeoutTimerRef.current);
      clearTimeout(rejoinTimerRef.current);
      if (clientRef.current) {
        clientRef.current.disconnect();
      }
    };
  }, []);

  const handleRoomCodeChange = (e) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 6);
    setRoomCode(val);
    if (errorMessage) {
      setErrorMessage('');
    }
  };

  const handleDisplayNameChange = (e) => {
    setDisplayName(e.target.value.slice(0, MAX_NAME_LENGTH));
    if (errorMessage) {
      setErrorMessage('');
    }
  };

  const validateInputs = () => {
    const trimmedCode = roomCode.trim();
    if (!trimmedCode) {
      setErrorMessage('Please enter a 6 digit room code.');
      codeInputRef.current?.focus();
      return null;
    }

    if (!ROOM_CODE_REGEX.test(trimmedCode)) {
      setErrorMessage('Room code must be exactly 6 digits.');
      codeInputRef.current?.focus();
      return null;
    }

    const trimmedName = displayName.trim();
    if (!trimmedName) {
      setErrorMessage('Please enter a display name.');
      nameInputRef.current?.focus();
      return null;
    }

    if (trimmedName.length > MAX_NAME_LENGTH) {
      setErrorMessage(`Display name must be ${MAX_NAME_LENGTH} characters or fewer.`);
      nameInputRef.current?.focus();
      return null;
    }

    return { code: trimmedCode, name: trimmedName };
  };

  const resetToForm = (message) => {
    clearTimeout(rejoinTimerRef.current);
    joinedRef.current = null;
    setJoinedSession(null);
    setLobbyParticipants([]);
    setParticipantCount(0);
    setReconnecting(false);
    setIsJoining(false);
    if (message) {
      setErrorMessage(message);
    }
  };

  const applyLobby = (msg) => {
    if (msg.data?.participants) {
      setLobbyParticipants(msg.data.participants);
    }
    if (typeof msg.data?.count === 'number') {
      setParticipantCount(msg.data.count);
    }
  };

  const scheduleRejoin = (attempt) => {
    const seat = joinedRef.current;
    if (!seat || leavingRef.current) {
      return;
    }
    if (attempt > MAX_REJOIN_ATTEMPTS) {
      console.warn(`Rejoin gave up after ${MAX_REJOIN_ATTEMPTS} attempts`);
      resetToForm('The connection to the room was lost. Join again with the same name.');
      return;
    }
    setReconnecting(true);
    const delay = Math.min(REJOIN_STEP_MS * attempt, MAX_REJOIN_DELAY_MS);
    rejoinTimerRef.current = setTimeout(() => rejoin(seat, attempt), delay);
  };

  const rejoin = async (seat, attempt) => {
    const client = new QuizWebSocketClient(liveSocketUrl());
    clientRef.current = client;
    watchJoinedConnection(client, attempt);
    client.onMessage((msg) => {
      if (msg?.type === 'joined') {
        setReconnecting(false);
      } else if (msg?.type === 'error' && msg.data?.code !== 'seat_in_use') {
        console.warn(`Rejoin refused: ${msg.data?.code}`);
        leavingRef.current = true;
        client.disconnect();
        resetToForm('You are no longer in this room. Join again to continue.');
      }
    });
    try {
      await client.connect();
      client.rejoin(seat.roomCode, seat.displayName);
    } catch {
      console.warn(`Rejoin attempt ${attempt} could not connect`);
    }
  };

  const watchJoinedConnection = (client, attempt = 0) => {
    client.onMessage((msg) => {
      if (msg?.type === 'lobby') {
        applyLobby(msg);
      } else if (msg?.type === 'error' && msg.data?.code === 'removed_by_host') {
        leavingRef.current = true;
        resetToForm('The host removed you from this room.');
      } else if (msg?.type === 'error' && msg.data?.code === 'seat_in_use') {
        client.disconnect();
        scheduleRejoin(attempt + 1);
      }
    });
    client.onClose(() => {
      if (joinedRef.current && !leavingRef.current) {
        scheduleRejoin(attempt + 1);
      }
    });
  };

  const handleJoin = async (e) => {
    if (e) {
      e.preventDefault();
    }

    if (isJoining) {
      return;
    }

    setErrorMessage('');
    setInfoMessage('');
    const validated = validateInputs();
    if (!validated) {
      return;
    }

    setIsJoining(true);
    joiningRef.current = true;
    leavingRef.current = false;

    const stopJoining = () => {
      clearTimeout(timeoutTimerRef.current);
      joiningRef.current = false;
      setIsJoining(false);
    };

    try {
      const client = clientOverride || new QuizWebSocketClient(liveSocketUrl());
      clientRef.current = client;

      client.onMessage((msg) => {
        if (!msg || !msg.type || !joiningRef.current) return;

        if (msg.type === 'joined') {
          stopJoining();
          const seat = {
            sessionId: msg.session_id,
            participantId: msg.data?.participant_id,
            displayName: msg.data?.display_name || validated.name,
            quizTitle: msg.data?.quiz_title || 'LockIn Quiz',
            score: msg.data?.score ?? 0,
            roomCode: validated.code,
          };
          joinedRef.current = seat;
          setJoinedSession(seat);
          if (!clientOverride) {
            watchJoinedConnection(client);
          }
        } else if (msg.type === 'error') {
          stopJoining();
          client.disconnect();
          setErrorMessage(joinErrorText(msg.data?.code, msg.data?.message, validated));
        }
      });

      // Lobby updates arrive right after joined, before watchJoinedConnection runs.
      client.onMessage((msg) => {
        if (msg?.type === 'lobby') {
          applyLobby(msg);
        }
      });

      client.onError(() => {
        if (!joiningRef.current) return;
        stopJoining();
        setErrorMessage('Unable to connect to the quiz server. Please check your network or try again.');
      });

      client.onClose(() => {
        if (joiningRef.current) {
          stopJoining();
        }
      });

      await client.connect();
      client.join(validated.code, validated.name);

      timeoutTimerRef.current = setTimeout(() => {
        if (joiningRef.current) {
          stopJoining();
          client.disconnect();
          setErrorMessage('Connection timed out. Please try again.');
        }
      }, CONNECTION_TIMEOUT_MS);
    } catch (err) {
      if (joiningRef.current) {
        stopJoining();
        setErrorMessage('Unable to connect to the quiz server. Please check your network or try again.');
      }
    }
  };

  const handleLeave = () => {
    leavingRef.current = true;
    if (clientRef.current && joinedSession) {
      clientRef.current.leave(joinedSession.sessionId);
    }
    resetToForm();
  };

  if (joinedSession) {
    return (
      <div className="stage">
        <BackgroundTextEffect text={joinedSession.roomCode} />
        <header className="topbar">
          <LockInLogo to={null} />
        </header>
        <div className="dock">
          <WaitingLobby
            quizTitle={joinedSession.quizTitle}
            displayName={joinedSession.displayName}
            roomCode={joinedSession.roomCode}
            participants={lobbyParticipants}
            participantCount={participantCount}
            reconnecting={reconnecting}
            onLeave={handleLeave}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="stage">
      <BackgroundTextEffect text={roomCode ? roomCode.padEnd(6, '·') : 'JOIN'} />
      <header className="topbar">
        <LockInLogo to="/join" />
        <Link to="/host/login" className="pill pill--white pill--small">
          Host a quiz
        </Link>
      </header>

      <main className="dock">
        <section className="sheet" aria-labelledby="join-title">
          <h1 id="join-title" className="sheet__title">
            Join a live quiz
          </h1>
          <p className="sheet__lead">Type the code on the host screen, or scan its QR code.</p>

          {infoMessage && (
            <div className="notice notice--ok" role="status">
              <Icon name="check" />
              <span>{infoMessage}</span>
            </div>
          )}

          {errorMessage && (
            <div className="notice notice--error" role="alert">
              <Icon name="alert" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form className="form" onSubmit={handleJoin} noValidate>
            <div className="field">
              <label htmlFor="room-code-input" className="field__label">
                6 Digit Room Code
              </label>
              <input
                id="room-code-input"
                ref={codeInputRef}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                className="input input--code"
                placeholder="000000"
                value={roomCode}
                onChange={handleRoomCodeChange}
                disabled={isJoining}
                autoComplete="off"
                aria-required="true"
              />
            </div>

            <div className="field">
              <label htmlFor="display-name-input" className="field__label">
                Display Name
              </label>
              <input
                id="display-name-input"
                ref={nameInputRef}
                type="text"
                maxLength={MAX_NAME_LENGTH}
                className="input"
                placeholder="Your name or nickname"
                value={displayName}
                onChange={handleDisplayNameChange}
                disabled={isJoining}
                autoComplete="nickname"
                enterKeyHint="go"
                aria-required="true"
                aria-describedby="display-name-hint"
              />
              <p id="display-name-hint" className="field__hint">
                1 to 20 characters. Everyone in the room sees it.
              </p>
            </div>

            <button
              type="submit"
              className="pill pill--solid pill--block"
              disabled={isJoining}
              aria-busy={isJoining}
            >
              {isJoining ? (
                <>
                  <span className="spinner" aria-hidden="true"></span>
                  <span>Joining...</span>
                </>
              ) : (
                'Join Room'
              )}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
