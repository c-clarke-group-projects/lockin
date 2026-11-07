import React, { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { QuizWebSocketClient } from '../lib/websocket';
import { WaitingLobby } from '../components/WaitingLobby';
import ParticipantReveal from '../views/participentReveal';
import { Leaderboard } from '../components/Leaderboard';

const ROOM_CODE_REGEX = /^\d{6}$/;
const MAX_NAME_LENGTH = 20;
const CONNECTION_TIMEOUT_MS = 10000;

export function JoinPage({ clientOverride = null }) {
  const { code: routeCode } = useParams();
  const [searchParams] = useSearchParams();

  const [roomCode, setRoomCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [infoMessage, setInfoMessage] = useState('');

  // Joined state & Live game phases
  const [joinedSession, setJoinedSession] = useState(null);
  const [lobbyParticipants, setLobbyParticipants] = useState([]);
  const [participantCount, setParticipantCount] = useState(0);
  const [currentPhase, setCurrentPhase] = useState('lobby'); // 'lobby' | 'reveal' | 'leaderboard'
  const [revealData, setRevealData] = useState(null);
  const [leaderboardData, setLeaderboardData] = useState(null);

  const nameInputRef = useRef(null);
  const codeInputRef = useRef(null);
  const clientRef = useRef(clientOverride);
  const timeoutTimerRef = useRef(null);

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

  // Cleanup WebSocket and timer on unmount
  useEffect(() => {
    return () => {
      if (timeoutTimerRef.current) {
        clearTimeout(timeoutTimerRef.current);
      }
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

  const handleJoin = async (e) => {
    if (e) {
      e.preventDefault();
    }

    if (isJoining) {
      return;
    }

    setErrorMessage('');
    const validated = validateInputs();
    if (!validated) {
      return;
    }

    setIsJoining(true);

    try {
      const client = clientOverride || new QuizWebSocketClient();
      clientRef.current = client;

      // Register message listener
      client.onMessage((msg) => {
        if (!msg || !msg.type) return;

        if (msg.type === 'joined') {
          if (timeoutTimerRef.current) {
            clearTimeout(timeoutTimerRef.current);
          }
          setIsJoining(false);
          setJoinedSession({
            sessionId: msg.session_id,
            participantId: msg.data?.participant_id,
            displayName: msg.data?.display_name || validated.name,
            quizTitle: msg.data?.quiz_title || 'Lockin Quiz',
            score: msg.data?.score ?? 0,
            roomCode: validated.code,
          });
        } else if (msg.type === 'lobby') {
          setCurrentPhase('lobby');
          if (msg.data?.participants) {
            setLobbyParticipants(msg.data.participants);
          }
          if (typeof msg.data?.count === 'number') {
            setParticipantCount(msg.data.count);
          }
        } else if (msg.type === 'reveal') {
          setCurrentPhase('reveal');
          setRevealData(msg.data);
        } else if (msg.type === 'leaderboard' || msg.type === 'ended') {
          setCurrentPhase('leaderboard');
          setLeaderboardData(msg.data);
        } else if (msg.type === 'error') {
          if (timeoutTimerRef.current) {
            clearTimeout(timeoutTimerRef.current);
          }
          setIsJoining(false);
          client.disconnect();

          const code = msg.data?.code;
          const msgText = msg.data?.message;

          if (code === 'room_not_found') {
            setErrorMessage(`Room ${validated.code} not found. Please verify the code.`);
          } else if (code === 'room_closed') {
            setErrorMessage('This quiz session has already ended.');
          } else if (code === 'room_full') {
            setErrorMessage('This room is currently full.');
          } else if (code === 'name_taken') {
            setErrorMessage(`The name "${validated.name}" is already taken in this room.`);
          } else if (code === 'name_invalid') {
            setErrorMessage('Display name must be 1 to 20 characters.');
          } else if (code === 'wrong_phase') {
            setErrorMessage('The quiz has already started. New participants cannot join.');
          } else {
            setErrorMessage(msgText || 'Unable to join the room. Please try again.');
          }
        }
      });

      // Register error and close listeners
      client.onError(() => {
        if (timeoutTimerRef.current) {
          clearTimeout(timeoutTimerRef.current);
        }
        setIsJoining(false);
        setErrorMessage('Unable to connect to the quiz server. Please check your network or try again.');
      });

      client.onClose(() => {
        if (!joinedSession) {
          setIsJoining(false);
        }
      });

      await client.connect();
      client.join(validated.code, validated.name);

      // Set connection timeout
      timeoutTimerRef.current = setTimeout(() => {
        if (isJoining) {
          setIsJoining(false);
          client.disconnect();
          setErrorMessage('Connection timed out. Please try again.');
        }
      }, CONNECTION_TIMEOUT_MS);
    } catch (err) {
      setIsJoining(false);
      setErrorMessage('Failed to establish connection. Please check your network or try again.');
    }
  };

  const handleLeave = () => {
    if (clientRef.current && joinedSession) {
      clientRef.current.leave(joinedSession.sessionId);
    }
    setJoinedSession(null);
    setLobbyParticipants([]);
    setParticipantCount(0);
    setCurrentPhase('lobby');
    setRevealData(null);
    setLeaderboardData(null);
    setIsJoining(false);
  };

  if (joinedSession) {
    if (currentPhase === 'reveal' && revealData) {
      return (
        <div className="join-page-container">
          <ParticipantReveal
            questionData={revealData}
            selectedOption={revealData.you?.chosen_index ?? null}
            sessionId={joinedSession.sessionId}
            participantId={joinedSession.participantId}
            isRevealPhase={true}
            wsClient={clientRef.current}
          />
        </div>
      );
    }

    if (currentPhase === 'leaderboard' && leaderboardData) {
      return (
        <div className="join-page-container">
          <Leaderboard
            top={leaderboardData.top}
            count={leaderboardData.count}
            you={
              leaderboardData.you || {
                rank: null,
                score: joinedSession.score,
                display_name: joinedSession.displayName,
              }
            }
            variant="mobile"
            client={clientRef.current}
          />
        </div>
      );
    }

    return (
      <div className="join-page-container">
        <WaitingLobby
          quizTitle={joinedSession.quizTitle}
          displayName={joinedSession.displayName}
          roomCode={joinedSession.roomCode}
          participants={lobbyParticipants}
          participantCount={participantCount}
          onLeave={handleLeave}
        />
      </div>
    );
  }

  return (
    <div className="join-page-container">
      <div className="join-card">
        <header className="join-header">
          <h1 className="join-brand">Lockin</h1>
          <p className="join-subtitle">Enter room code or open from QR link to participate</p>
        </header>

        {infoMessage && (
          <div className="alert alert-info" role="status">
            <span>{infoMessage}</span>
          </div>
        )}

        {errorMessage && (
          <div className="alert alert-danger" role="alert">
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleJoin} noValidate>
          <div className="form-group">
            <label htmlFor="room-code-input" className="form-label">
              6 Digit Room Code
            </label>
            <input
              id="room-code-input"
              ref={codeInputRef}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              className="form-input code-input"
              placeholder="000000"
              value={roomCode}
              onChange={handleRoomCodeChange}
              disabled={isJoining}
              autoComplete="off"
              aria-required="true"
            />
            <p className="form-hint">Enter the 6 digit code shown on the host screen</p>
          </div>

          <div className="form-group">
            <label htmlFor="display-name-input" className="form-label">
              Display Name
            </label>
            <input
              id="display-name-input"
              ref={nameInputRef}
              type="text"
              maxLength={MAX_NAME_LENGTH}
              className="form-input"
              placeholder="Your name or nickname"
              value={displayName}
              onChange={handleDisplayNameChange}
              disabled={isJoining}
              autoComplete="nickname"
              aria-required="true"
            />
            <p className="form-hint">Between 1 and 20 characters</p>
          </div>

          <button
            type="submit"
            className="btn-primary"
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
      </div>
    </div>
  );
}

