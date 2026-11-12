import React from 'react';

/**
 * Waiting lobby component for participants who successfully joined a room.
 * Displays room details, player name, and lobby status while awaiting quiz start.
 */
export function WaitingLobby({
  quizTitle,
  displayName,
  roomCode,
  participants = [],
  participantCount = 0,
  reconnecting = false,
  onLeave,
}) {
  return (
    <section className="sheet" aria-labelledby="lobby-title">
      {reconnecting ? (
        <span className="badge badge--wait">Reconnecting</span>
      ) : (
        <span className="badge">Connected</span>
      )}
      <h1 id="lobby-title" className="sheet__title" style={{ marginTop: 12 }}>
        {quizTitle || 'Quiz Lobby'}
      </h1>
      <p className="lobby__meta">
        Room code: <strong>{roomCode}</strong> &bull; Playing as: <strong>{displayName}</strong>
      </p>

      <div className="lobby__status">
        <span className="waiting-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <p>Waiting for the host to start the quiz.</p>
      </div>

      <h2 className="lobby__heading">
        Participants ({participantCount || participants.length || 1})
      </h2>
      <ul className="chips">
        {participants.length > 0 ? (
          participants.map((p) => {
            const isCurrent = p.display_name?.toLowerCase() === displayName?.toLowerCase();
            return (
              <li
                key={p.participant_id || p.display_name}
                className={`chip ${isCurrent ? 'chip--you' : ''}`}
              >
                {p.display_name} {isCurrent ? '(You)' : ''}
              </li>
            );
          })
        ) : (
          <li className="chip chip--you">{displayName} (You)</li>
        )}
      </ul>

      <button type="button" className="pill pill--quiet pill--block lobby__leave" onClick={onLeave}>
        Leave Room
      </button>
    </section>
  );
}
