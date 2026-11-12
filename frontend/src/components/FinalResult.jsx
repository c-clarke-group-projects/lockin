import React, { useState } from 'react';

/**
 * Final Result Screen for Lockin participant mobile display (PB-28 / SCRUM-92).
 *
 * Appears automatically when the quiz ends (WebSocket 'ended' event).
 * Displays authoritative server-calculated rank, score, participant count,
 * celebratory feedback, and a touch-friendly Back to Home button.
 */
export function FinalResult({
  displayName = '',
  rank = null,
  score = null,
  participantCount = null,
  quizTitle = 'Lockin Quiz',
  reason = 'finished',
  top = [],
  isDisconnected = false,
  onBackToHome = null,
  className = '',
}) {
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  // Normalize numeric values (carefully preserving zero)
  const numericRank = typeof rank === 'number' ? rank : rank ? Number(rank) : null;
  const numericScore =
    score !== undefined && score !== null && !isNaN(Number(score))
      ? Number(score)
      : null;
  const numericCount =
    participantCount !== undefined && participantCount !== null && !isNaN(Number(participantCount))
      ? Number(participantCount)
      : null;

  // Determine celebratory badge and message based on authoritative rank
  const isFirstPlace = numericRank === 1;
  const isPodium = numericRank && numericRank <= 3;

  const getRankBadge = () => {
    if (numericRank === 1) return { icon: '🥇', label: '1st Place', color: '#eab308' };
    if (numericRank === 2) return { icon: '🥈', label: '2nd Place', color: '#94a3b8' };
    if (numericRank === 3) return { icon: '🥉', label: '3rd Place', color: '#d97706' };
    return { icon: '🎯', label: 'Completed', color: '#3b82f6' };
  };

  const getCongratulationsText = () => {
    if (numericRank === null && numericScore === null) {
      return 'Quiz completed! Final results unavailable.';
    }
    if (isFirstPlace) {
      return 'Outstanding! You took 1st place! 🏆';
    }
    if (numericRank === 2) {
      return 'Incredible job! You finished 2nd! 🥈';
    }
    if (numericRank === 3) {
      return 'Great effort! You made the podium! 🥉';
    }
    if (numericRank && numericRank <= 10) {
      return 'Awesome job! You finished in the Top 10! ⭐';
    }
    if (numericScore && numericScore > 0) {
      return 'Well played! Thanks for participating! 🎉';
    }
    return 'Quiz finished! Thanks for playing! 👍';
  };

  const badge = getRankBadge();

  return (
    <div
      className={`final-result-container ${className}`.trim()}
      style={{
        width: '100%',
        maxWidth: '440px',
        margin: '0 auto',
        padding: '24px 16px',
        fontFamily:
          'var(--font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif)',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      {/* Disconnected notification if dropped at the end */}
      {isDisconnected && (
        <div
          role="status"
          style={{
            width: '100%',
            marginBottom: '12px',
            padding: '8px 12px',
            borderRadius: '8px',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#dc2626',
            fontSize: '12px',
            fontWeight: '600',
            textAlign: 'center',
          }}
        >
          Offline • Final result cached
        </div>
      )}

      {/* Main Result Card */}
      <div
        className="final-result-card"
        style={{
          width: '100%',
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.04)',
          padding: '32px 24px',
          textAlign: 'center',
          boxSizing: 'border-box',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Top celebratory decorative banner */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '6px',
            background: isFirstPlace
              ? 'linear-gradient(90deg, #f59e0b, #fbbf24, #f59e0b)'
              : 'linear-gradient(90deg, #2563eb, #3b82f6, #60a5fa)',
          }}
        />

        {/* Header */}
        <header style={{ marginBottom: '20px' }}>
          <div
            style={{
              fontSize: '48px',
              lineHeight: 1,
              marginBottom: '12px',
              animation: 'bounce 1s ease',
            }}
            aria-hidden="true"
          >
            {badge.icon}
          </div>
          <h1
            style={{
              fontSize: '24px',
              fontWeight: '800',
              color: '#0f172a',
              letterSpacing: '-0.5px',
              margin: '0 0 6px 0',
            }}
          >
            Quiz Completed!
          </h1>
          {quizTitle && (
            <p
              style={{
                fontSize: '14px',
                color: '#64748b',
                margin: 0,
                fontWeight: '500',
              }}
            >
              {quizTitle}
            </p>
          )}
          {displayName && (
            <p
              data-testid="participant-name"
              style={{
                fontSize: '16px',
                fontWeight: '700',
                color: '#1e293b',
                marginTop: '6px',
                marginBottom: 0,
              }}
            >
              {displayName}
            </p>
          )}
        </header>

        {/* Reason banner if ended early by host */}
        {reason === 'ended_by_host' && (
          <div
            style={{
              display: 'inline-block',
              padding: '4px 10px',
              borderRadius: '9999px',
              backgroundColor: '#f1f5f9',
              color: '#64748b',
              fontSize: '12px',
              fontWeight: '600',
              marginBottom: '16px',
            }}
          >
            Ended by Host
          </div>
        )}

        {/* Big Rank Box */}
        <div
          role="region"
          aria-label="Final rank"
          style={{
            backgroundColor: isFirstPlace ? '#fefce8' : '#f8fafc',
            border: isFirstPlace ? '2px solid #fef08a' : '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: '20px 16px',
            marginBottom: '16px',
          }}
        >
          <div
            style={{
              fontSize: '12px',
              fontWeight: '700',
              textTransform: 'uppercase',
              color: isFirstPlace ? '#854d0e' : '#64748b',
              letterSpacing: '0.5px',
              marginBottom: '4px',
            }}
          >
            Your Final Rank
          </div>
          <div
            data-testid="final-rank-display"
            style={{
              fontSize: '44px',
              fontWeight: '900',
              color: isFirstPlace ? '#b45309' : '#0f172a',
              lineHeight: 1.1,
              letterSpacing: '-1px',
            }}
          >
            {numericRank !== null ? `#${numericRank}` : '-'}
          </div>
          {numericCount !== null && (
            <div
              data-testid="participant-count-display"
              style={{
                fontSize: '13px',
                color: isFirstPlace ? '#a16207' : '#64748b',
                fontWeight: '600',
                marginTop: '4px',
              }}
            >
              out of {numericCount} {numericCount === 1 ? 'player' : 'players'}
            </div>
          )}
        </div>

        {/* Score Box */}
        <div
          role="region"
          aria-label="Final score"
          style={{
            backgroundColor: '#f1f5f9',
            borderRadius: '12px',
            padding: '16px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ textAlign: 'left' }}>
            <span
              style={{
                fontSize: '12px',
                fontWeight: '700',
                color: '#64748b',
                textTransform: 'uppercase',
                display: 'block',
              }}
            >
              Total Points
            </span>
            <span style={{ fontSize: '13px', color: '#94a3b8' }}>Final Score</span>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span
              data-testid="final-score-display"
              style={{
                fontSize: numericScore !== null ? '26px' : '22px',
                fontWeight: '800',
                color: numericScore !== null ? '#2563eb' : '#94a3b8',
              }}
            >
              {numericScore !== null ? numericScore.toLocaleString() : '-'}
            </span>
            {numericScore !== null && (
              <span style={{ fontSize: '13px', color: '#64748b', marginLeft: '4px', fontWeight: '600' }}>
                pts
              </span>
            )}
          </div>
        </div>

        {/* Congratulatory message */}
        <p
          data-testid="congrats-message"
          style={{
            fontSize: '15px',
            fontWeight: '600',
            color: '#334155',
            margin: '0 0 24px 0',
          }}
        >
          {getCongratulationsText()}
        </p>

        {/* Optional Final Top 10 Toggle */}
        {Array.isArray(top) && top.length > 0 && (
          <div style={{ marginBottom: '20px' }}>
            <button
              type="button"
              onClick={() => setShowLeaderboard((prev) => !prev)}
              style={{
                background: 'none',
                border: 'none',
                color: '#2563eb',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer',
                padding: '6px 12px',
                borderRadius: '6px',
              }}
            >
              {showLeaderboard ? 'Hide Final Standings ▲' : 'View Final Standings ▼'}
            </button>

            {showLeaderboard && (
              <div
                style={{
                  marginTop: '12px',
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  padding: '12px',
                  textAlign: 'left',
                }}
              >
                <div style={{ fontSize: '12px', fontWeight: '700', color: '#64748b', marginBottom: '8px' }}>
                  TOP PLAYERS
                </div>
                <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: '#1e293b' }}>
                  {top.slice(0, 5).map((player, idx) => (
                    <li key={player.participant_id || idx} style={{ marginBottom: '4px' }}>
                      <strong>{player.display_name}</strong> - {player.score} pts
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button
            type="button"
            onClick={onBackToHome}
            aria-label="Back to home"
            data-testid="back-to-home-btn"
            style={{
              width: '100%',
              minHeight: '48px',
              padding: '12px 24px',
              fontSize: '16px',
              fontWeight: '700',
              borderRadius: '10px',
              backgroundColor: '#2563eb',
              color: '#ffffff',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.2)',
              transition: 'background-color 0.15s ease',
            }}
          >
            Back to Home
          </button>
        </div>
      </div>
    </div>
  );
}

export default FinalResult;

