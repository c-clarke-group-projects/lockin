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
  onLeave,
}) {
  return (
    <div className="join-card lobby-card">
      <div className="lobby-badge">Connected</div>
      <h1 className="lobby-title">{quizTitle || 'Quiz Lobby'}</h1>
      <p className="lobby-session-info">
        Room code: <strong>{roomCode}</strong> &bull; Playing as: <strong>{displayName}</strong>
      </p>

      <div className="lobby-status-box">
        <p>Waiting for the host to start the quiz.</p>
        <div style={{ marginTop: '12px' }}>
          <span className="spinner" style={{ borderColor: 'var(--primary)', borderBottomColor: 'transparent' }}></span>
        </div>
      </div>

      <div className="lobby-participant-list">
        <div className="lobby-participant-heading">
          Participants ({participantCount || participants.length || 1})
        </div>
        <div className="participant-tags">
          {participants.length > 0 ? (
            participants.map((p) => {
              const isCurrent = p.display_name?.toLowerCase() === displayName?.toLowerCase();
              return (
                <span
                  key={p.participant_id || p.display_name}
                  className={`participant-tag ${isCurrent ? 'current-user' : ''}`}
                >
                  {p.display_name} {isCurrent ? '(You)' : ''}
                </span>
              );
            })
          ) : (
            <span className="participant-tag current-user">{displayName} (You)</span>
          )}
        </div>
      </div>

      <button
        type="button"
        className="btn-secondary"
        onClick={onLeave}
      >
        Leave Room
      </button>
    </div>
  );
}

