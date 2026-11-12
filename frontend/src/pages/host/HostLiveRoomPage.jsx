import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getAuthToken, getSession, signOut } from '../../lib/api';
import { isLoopbackAddress, joinUrlFor, liveSocketUrl } from '../../lib/config';
import { QuizWebSocketClient } from '../../lib/websocket';
import { useHostErrors } from '../../hooks/useHostErrors';
import { Navbar } from '../../components/Navbar';
import { Icon } from '../../components/Icon';
import { BackgroundTextEffect } from '../../components/BackgroundTextEffect';
import { QRCodeDisplay } from '../../components/QRCodeDisplay';
import { HostGamePanel, applyGameMessage } from '../../components/HostGamePanel';

const MAX_RECONNECT_ATTEMPTS = 8;
const RECONNECT_STEP_MS = 2000;
const MAX_RECONNECT_DELAY_MS = 8000;
const GAME_MESSAGES = new Set(['question', 'answer_count', 'locked', 'reveal', 'leaderboard', 'ended']);

function playerLabel(count) {
  return count === 1 ? '1 player' : `${count} players`;
}

/** Keeps a host control connection open for 1 room and reports lobby and game changes. */
function useHostConnection(sessionId, onLobby, onFatal, onGame, onServerError) {
  const [state, setState] = useState('connecting');
  const clientRef = useRef(null);
  const stoppedRef = useRef(false);
  const timerRef = useRef(null);

  const connect = useCallback(
    async (attempt) => {
      const client = new QuizWebSocketClient(liveSocketUrl());
      clientRef.current = client;

      let joined = false;
      const retry = () => {
        if (stoppedRef.current) return;
        const next = joined ? 1 : attempt + 1;
        if (next > MAX_RECONNECT_ATTEMPTS) {
          console.warn(`Host connection gave up after ${MAX_RECONNECT_ATTEMPTS} attempts`);
          setState('lost');
          return;
        }
        setState('reconnecting');
        const delay = Math.min(RECONNECT_STEP_MS * next, MAX_RECONNECT_DELAY_MS);
        timerRef.current = setTimeout(() => connect(next), delay);
      };

      client.onMessage((msg) => {
        if (msg?.type === 'host_joined') {
          joined = true;
          setState('connected');
        } else if (msg?.type === 'lobby') {
          onLobby(msg.data);
        } else if (GAME_MESSAGES.has(msg?.type)) {
          onGame(msg);
        } else if (msg?.type === 'error') {
          console.warn(`Room server error: ${msg.data?.code}`);
          if (msg.data?.code === 'unauthorised') {
            stoppedRef.current = true;
            client.disconnect();
            onFatal('unauthorised');
          } else {
            onServerError(msg.data?.message || 'The room server refused that. Try again.');
          }
        }
      });
      client.onClose(retry);

      try {
        await client.connect();
        client.hostJoin('control', Number(sessionId), getAuthToken());
      } catch {
        console.warn(`Host connection attempt ${attempt + 1} failed`);
      }
    },
    [sessionId, onLobby, onFatal, onGame, onServerError]
  );

  useEffect(() => {
    stoppedRef.current = false;
    connect(0);
    return () => {
      stoppedRef.current = true;
      clearTimeout(timerRef.current);
      clientRef.current?.disconnect();
    };
  }, [connect]);

  const hostSend = (type, data = {}) => {
    clientRef.current?.send(type, data, Number(sessionId), getAuthToken());
  };
  const kick = (participantId) => hostSend('kick', { participant_id: participantId });

  return { state, kick, hostSend };
}

export function HostLiveRoomPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const describeError = useHostErrors();
  const [room, setRoom] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [players, setPlayers] = useState([]);
  const [game, setGame] = useState(null);
  const [serverError, setServerError] = useState('');

  useEffect(() => {
    getSession(sessionId)
      .then(setRoom)
      .catch((error) => setLoadError(describeError(error)));
  }, [sessionId, describeError]);

  const handleLobby = useCallback((data) => setPlayers(data?.participants ?? []), []);
  const handleFatal = useCallback(() => {
    signOut();
    navigate('/host/login', { replace: true, state: { from: `/host/room/${sessionId}`, expired: true } });
  }, [navigate, sessionId]);

  const handleGame = useCallback((msg) => {
    setServerError('');
    setGame((current) => applyGameMessage(current, msg));
  }, []);

  const { state, kick, hostSend } = useHostConnection(
    sessionId,
    handleLobby,
    handleFatal,
    handleGame,
    setServerError
  );

  const handleStart = () => {
    setServerError('');
    hostSend('start');
  };
  const handleNext = () => hostSend('next');
  const handleEnd = () => {
    if (window.confirm('End the quiz now for everyone?')) {
      hostSend('end');
    }
  };

  const handleKick = (player) => {
    if (window.confirm(`Remove ${player.display_name} from the room?`)) {
      kick(player.participant_id);
    }
  };

  if (loadError) {
    return (
      <div className="stage stage--scroll">
        <Navbar />
        <main className="host-main">
          <div className="notice notice--error" role="alert">
            <Icon name="alert" />
            <span>{loadError}</span>
          </div>
        </main>
      </div>
    );
  }

  const joinUrl = room ? joinUrlFor(room.join_code) : '';

  return (
    <div className="stage stage--scroll">
      {room && <BackgroundTextEffect text={room.join_code} />}
      <Navbar />
      <main className="host-main">
        {room && (
          <Link to={`/host/quiz/${room.quiz_id}`} className="back-link">
            <Icon name="arrowLeft" />
            Edit questions
          </Link>
        )}
        <h1 className="page-title">{room ? room.quiz_title : 'Opening room...'}</h1>
        <p className="page-lead">
          {state === 'connected' && <span className="badge">Live</span>}
          {state === 'connecting' && <span className="badge badge--wait">Connecting</span>}
          {state === 'reconnecting' && <span className="badge badge--wait">Reconnecting</span>}
          {state === 'lost' && (
            <span className="badge badge--wait">Offline, reload the page to reconnect</span>
          )}
        </p>

        {room && isLoopbackAddress() && (
          <div className="notice" role="note">
            <Icon name="alert" />
            <span>
              Phones cannot open a localhost link. Open this page from the laptop&apos;s network address,
              shown as Network when the frontend starts, so the code and QR work on phones.
            </span>
          </div>
        )}

        {serverError && (
          <div className="notice notice--error" role="alert">
            <Icon name="alert" />
            <span>{serverError}</span>
          </div>
        )}

        {room && game && <HostGamePanel game={game} onNext={handleNext} onEnd={handleEnd} />}

        {room && !game && (
          <div className="live">
            <section className="sheet" aria-labelledby="join-how">
              <h2 id="join-how" className="field__label">
                Room code
              </h2>
              <p className="live__code">{room.join_code}</p>
              <p className="live__url">{joinUrl}</p>
              <div className="live__qr">
                <QRCodeDisplay joinUrl={joinUrl} roomCode={room.join_code} />
              </div>
            </section>

            <section className="sheet" aria-labelledby="players-title" aria-live="polite">
              <div className="live__players-head">
                <h2 id="players-title" className="field__label">
                  In the room
                </h2>
                <span className="live__count">{players.length}</span>
              </div>
              <p className="visually-hidden">{playerLabel(players.length)}</p>

              {players.length === 0 ? (
                <p className="empty">Nobody has joined yet. Names appear here as players join.</p>
              ) : (
                <ul className="chips">
                  {players.map((player) => (
                    <li key={player.participant_id} className="chip">
                      {player.display_name}
                      <button
                        type="button"
                        className="chip__remove"
                        onClick={() => handleKick(player)}
                        aria-label={`Remove ${player.display_name}`}
                      >
                        <Icon name="close" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <button
                type="button"
                className="pill pill--ink pill--block game__start"
                onClick={handleStart}
                disabled={players.length === 0 || state !== 'connected'}
              >
                Start quiz
                <Icon name="arrowRight" className="pill__icon" />
              </button>
              {players.length === 0 && (
                <p className="field__hint">Start opens once at least 1 player has joined.</p>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
