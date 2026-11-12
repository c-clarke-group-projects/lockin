import React, { useState, useEffect, useRef } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { QuizWebSocketClient } from '../lib/websocket';
import { liveSocketUrl } from '../lib/config';
import { WaitingLobby } from '../components/WaitingLobby';
import { BackgroundTextEffect } from '../components/BackgroundTextEffect';
import { LockInLogo } from '../components/LockInLogo';
import { Icon } from '../components/Icon';
import { AnswerScreen } from '../components/AnswerScreen';
import ParticipantReveal from '../views/participentReveal';
import { Leaderboard } from '../components/Leaderboard';
import { FinalResult } from '../components/FinalResult';

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

  // Joined state & Live game phases
  const [joinedSession, setJoinedSession] = useState(null);
  const [lobbyParticipants, setLobbyParticipants] = useState([]);
  const [participantCount, setParticipantCount] = useState(0);
  const [reconnecting, setReconnecting] = useState(false);
  const [currentPhase, setCurrentPhase] = useState('lobby'); // 'lobby' | 'reveal' | 'leaderboard' | 'ended'
  const [revealData, setRevealData] = useState(null);
  const [leaderboardData, setLeaderboardData] = useState(null);
  const [finalResultData, setFinalResultData] = useState(null);
  const [questionData, setQuestionData] = useState(null);
  const [chosenOption, setChosenOption] = useState(null);
  const [answersLocked, setAnswersLocked] = useState(false);

  const nameInputRef = useRef(null);
  const codeInputRef = useRef(null);
  const clientRef = useRef(clientOverride);
  const timeoutTimerRef = useRef(null);
  const rejoinTimerRef = useRef(null);
  const joiningRef = useRef(false);
  const joinedRef = useRef(null);
  const leavingRef = useRef(false);
  const questionRef = useRef(null);

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
    setCurrentPhase('lobby');
    setRevealData(null);
    setLeaderboardData(null);
    setFinalResultData(null);
    setQuestionData(null);
    setChosenOption(null);
    setAnswersLocked(false);
    questionRef.current = null;
    setReconnecting(false);
    setIsJoining(false);
    if (message) {
      setErrorMessage(message);
    }
  };

  const applyLiveMessage = (msg) => {
    if (msg?.type === 'lobby') {
      setCurrentPhase('lobby');
      if (msg.data?.participants) {
        setLobbyParticipants(msg.data.participants);
      }
      if (typeof msg.data?.count === 'number') {
        setParticipantCount(msg.data.count);
      }
    } else if (msg?.type === 'question') {
      if (questionRef.current?.question_id !== msg.data?.question_id) {
        setChosenOption(null);
      }
      questionRef.current = msg.data;
      setQuestionData(msg.data);
      setAnswersLocked(false);
      setCurrentPhase('question');
    } else if (msg?.type === 'locked') {
      setAnswersLocked(true);
    } else if (msg?.type === 'reveal') {
      // reveal carries no text or options, so it is shown with the question it answers.
      const question = questionRef.current?.question_id === msg.data?.question_id ? questionRef.current : {};
      setCurrentPhase('reveal');
      const source = msg.data?.source;
      setRevealData({
        ...question,
        ...msg.data,
        source_page: source ? source.page_number : msg.data?.source_page,
        source_snippet: source ? source.snippet : msg.data?.source_snippet,
      });
    } else if (msg?.type === 'leaderboard') {
      // Keep showing leaderboard during game; ignore late leaderboard if already ended
      setCurrentPhase((prev) => (prev === 'ended' ? 'ended' : 'leaderboard'));
      setLeaderboardData(msg.data);
    } else if (msg?.type === 'ended') {
      // Dedicated final result screen when quiz ends (PB-28 / SCRUM-92)
      setCurrentPhase('ended');
      setFinalResultData(msg.data);
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
      applyLiveMessage(msg);
      if (msg?.type === 'error' && msg.data?.code === 'removed_by_host') {
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

      // Lobby and game updates arrive on this client after joined, including
      // the first lobby that comes before watchJoinedConnection runs.
      client.onMessage(applyLiveMessage);

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

  const handleAnswer = (option) => {
    if (chosenOption !== null || !questionData || !clientRef.current || !joinedSession) {
      return;
    }
    setChosenOption(option);
    clientRef.current.send(
      'answer',
      { question_id: questionData.question_id, option },
      joinedSession.sessionId
    );
  };

  const handleLeave = () => {
    leavingRef.current = true;
    if (clientRef.current && joinedSession) {
      clientRef.current.leave(joinedSession.sessionId);
    }
    resetToForm();
  };

  if (joinedSession) {
    // 1. Dedicated Final Result Screen when quiz ends (PB-28 / SCRUM-92)
    if (currentPhase === 'ended' && finalResultData) {
      const participantName = joinedSession.displayName || '';
      const participantId = joinedSession.participantId;

      // Extract authoritative server ranking
      const youData = finalResultData.you;

      // Prefer matching by stable participant_id over potentially duplicated display_name
      let matchingTop = null;
      if (Array.isArray(finalResultData.top)) {
        if (participantId !== undefined && participantId !== null) {
          matchingTop = finalResultData.top.find((p) => p.participant_id === participantId);
        }
        if (!matchingTop && participantName) {
          matchingTop = finalResultData.top.find(
            (p) =>
              p.display_name &&
              p.display_name.trim().toLowerCase() === participantName.trim().toLowerCase()
          );
        }
      }

      const authoritativeRank =
        youData?.rank !== undefined && youData?.rank !== null
          ? youData.rank
          : matchingTop?.rank !== undefined && matchingTop?.rank !== null
          ? matchingTop.rank
          : null;

      // Authoritative score from backend 'ended' event only; do not fall back to stale joinedSession.score
      const authoritativeScore =
        youData?.score !== undefined && youData?.score !== null
          ? youData.score
          : matchingTop?.score !== undefined && matchingTop?.score !== null
          ? matchingTop.score
          : null;

      return (
        <div className="join-page-container">
          <FinalResult
            displayName={participantName}
            rank={authoritativeRank}
            score={authoritativeScore}
            participantCount={finalResultData.count ?? participantCount}
            quizTitle={joinedSession.quizTitle}
            reason={finalResultData.reason}
            top={finalResultData.top}
            isDisconnected={!clientRef.current?.isOpen}
            onBackToHome={handleLeave}
          />
        </div>
      );
    }

    if (currentPhase === 'question' && questionData) {
      return (
        <div className="stage">
          <header className="topbar">
            <LockInLogo to={null} />
          </header>
          <div className="dock">
            <AnswerScreen
              question={questionData}
              chosen={chosenOption}
              locked={answersLocked}
              onAnswer={handleAnswer}
            />
          </div>
        </div>
      );
    }

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
