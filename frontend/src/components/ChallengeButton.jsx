import React, { useState, useEffect, useRef } from 'react';

/**
 * Resolve API base URL for HTTP requests.
 * Uses VITE_API_BASE_URL if set, or defaults to backend port 8000 when running on Vite dev (5173).
 */
export function getApiBaseUrl() {
  const envUrl = import.meta.env?.VITE_API_BASE_URL;
  if (envUrl) {
    return envUrl.replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined' && window.location) {
    const protocol = window.location.protocol;
    const host = window.location.hostname || 'localhost';
    if (window.location.port === '5173') {
      return `${protocol}//${host}:8000`;
    }
    return '';
  }
  return 'http://localhost:8000';
}

/**
 * Challenge / Flag Button for Lockin participants (PB-23).
 *
 * Rules:
 * - Visible only during the 'reveal' phase.
 * - Single tap submission (no confirmation dialog).
 * - Enforces 1 flag per participant per question (persisted across refreshes in sessionStorage).
 * - Submits via HTTP POST /api/flags/ (and optionally via WebSocket 'flag' event if wsClient provided).
 * - Prevents duplicate clicks, disables during pending submission.
 * - Handles server-side 409 (Already Flagged) and other errors gracefully.
 */
export function ChallengeButton({
  questionId,
  sessionId,
  participantId,
  phase = 'reveal',
  isRevealPhase = true,
  wsClient = null,
  apiBaseUrl = getApiBaseUrl(),
  initialFlagged = false,
  onFlagSuccess = null,
  onFlagError = null,
  reason = 'Participant challenge',
  className = '',
  disabled = false,
}) {
  // If not in reveal phase, hide the button per PB-23 requirement
  const isInReveal = Boolean(isRevealPhase && (phase === 'reveal' || !phase));

  // Storage key to remember flags across refreshes / reconnects for this question
  const storageKey =
    sessionId && questionId && participantId
      ? `lockin_flag_${sessionId}_${questionId}_${participantId}`
      : sessionId && questionId
      ? `lockin_flag_${sessionId}_${questionId}`
      : null;

  const [hasFlagged, setHasFlagged] = useState(() => {
    if (initialFlagged) return true;
    if (typeof window !== 'undefined' && window.sessionStorage && storageKey) {
      return window.sessionStorage.getItem(storageKey) === 'true';
    }
    return false;
  });

  const [isPending, setIsPending] = useState(false);
  const [feedback, setFeedback] = useState(null); // { type: 'success' | 'error' | 'info', message: string }
  const isMountedRef = useRef(true);

  // Sync state if questionId or initialFlagged changes
  useEffect(() => {
    isMountedRef.current = true;
    if (initialFlagged) {
      setHasFlagged(true);
      return;
    }
    if (typeof window !== 'undefined' && window.sessionStorage && storageKey) {
      const stored = window.sessionStorage.getItem(storageKey) === 'true';
      setHasFlagged(stored);
      if (stored) {
        setFeedback({ type: 'info', message: 'You have already challenged this question.' });
      } else {
        setFeedback(null);
      }
    } else {
      setHasFlagged(false);
      setFeedback(null);
    }

    return () => {
      isMountedRef.current = false;
    };
  }, [questionId, sessionId, participantId, storageKey, initialFlagged]);

  // Listen to WebSocket ack messages if wsClient is provided
  useEffect(() => {
    if (!wsClient || typeof wsClient.onMessage !== 'function') return;

    const unsubscribe = wsClient.onMessage((msg) => {
      if (!msg || !isMountedRef.current) return;

      // Check for flag ack
      if (
        msg.type === 'ack' &&
        msg.data?.for === 'flag' &&
        (!msg.data?.question_id || Number(msg.data.question_id) === Number(questionId))
      ) {
        setHasFlagged(true);
        setIsPending(false);
        setFeedback({ type: 'success', message: 'Challenge submitted to host.' });
        if (typeof window !== 'undefined' && window.sessionStorage && storageKey) {
          window.sessionStorage.setItem(storageKey, 'true');
        }
      }

      // Check for error on flag
      if (msg.type === 'error' && isPending) {
        setIsPending(false);
        setFeedback({ type: 'error', message: msg.data?.message || 'Failed to submit challenge.' });
      }
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [wsClient, questionId, storageKey, isPending]);

  // Return nothing when not in reveal phase
  if (!isInReveal) {
    return null;
  }

  const handleFlagClick = async () => {
    if (isPending || hasFlagged || disabled) return;

    // Immediate optimistic lock to prevent multi-tap race conditions
    setIsPending(true);
    setFeedback(null);

    // 1. Send via WebSocket if client connected
    let wsSent = false;
    if (wsClient && wsClient.isOpen && typeof wsClient.send === 'function') {
      try {
        wsClient.send(
          'flag',
          {
            question_id: Number(questionId),
            reason: reason || 'Participant challenge',
          },
          sessionId ? Number(sessionId) : null
        );
        wsSent = true;
      } catch (err) {
        wsSent = false;
      }
    }

    // 2. Submit via HTTP API (backend app/api/flags.py)
    try {
      const baseUrl = (apiBaseUrl || '').replace(/\/+$/, '');
      const url = `${baseUrl}/api/flags/`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session_id: Number(sessionId) || 0,
          question_id: Number(questionId),
          participant_id: Number(participantId) || 0,
          reason: reason || 'Participant challenge',
        }),
      });

      if (!isMountedRef.current) return;

      if (response.status === 201) {
        const data = await response.json();
        setHasFlagged(true);
        setIsPending(false);
        setFeedback({ type: 'success', message: 'Question challenged! Host will review.' });
        if (typeof window !== 'undefined' && window.sessionStorage && storageKey) {
          window.sessionStorage.setItem(storageKey, 'true');
        }
        if (onFlagSuccess) {
          onFlagSuccess(data);
        }
      } else if (response.status === 409) {
        // Backend detected duplicate flag (one per person per question)
        const errorData = await response.json().catch(() => ({}));
        setHasFlagged(true);
        setIsPending(false);
        setFeedback({
          type: 'info',
          message: errorData.detail || 'You have already flagged this question.',
        });
        if (typeof window !== 'undefined' && window.sessionStorage && storageKey) {
          window.sessionStorage.setItem(storageKey, 'true');
        }
        if (onFlagError) {
          onFlagError(errorData);
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        setIsPending(false);
        // If WS already delivered or acked, do not treat as fatal
        if (!wsSent) {
          setFeedback({
            type: 'error',
            message: errorData.detail || 'Failed to submit challenge. Please try again.',
          });
          if (onFlagError) {
            onFlagError(errorData);
          }
        } else {
          setHasFlagged(true);
          setFeedback({ type: 'success', message: 'Challenge submitted via live connection.' });
        }
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      setIsPending(false);
      if (wsSent) {
        // WebSocket dispatched successfully
        setHasFlagged(true);
        setFeedback({ type: 'success', message: 'Challenge sent via live connection.' });
        if (typeof window !== 'undefined' && window.sessionStorage && storageKey) {
          window.sessionStorage.setItem(storageKey, 'true');
        }
      } else {
        setFeedback({
          type: 'error',
          message: 'Network error. Could not reach server.',
        });
        if (onFlagError) {
          onFlagError(err);
        }
      }
    }
  };

  const isButtonDisabled = disabled || isPending || hasFlagged;

  return (
    <div
      className={`challenge-button-wrapper ${className}`.trim()}
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        margin: '12px 0',
      }}
    >
      <button
        type="button"
        onClick={handleFlagClick}
        disabled={isButtonDisabled}
        aria-disabled={isButtonDisabled}
        aria-label={hasFlagged ? 'Question flagged' : 'Challenge this question'}
        className={`challenge-btn ${hasFlagged ? 'challenge-btn-flagged' : ''}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          padding: '10px 18px',
          fontSize: '14px',
          fontWeight: '600',
          borderRadius: '8px',
          border: hasFlagged ? '1px solid #cbd5e1' : '1px solid #f59e0b',
          backgroundColor: hasFlagged ? '#f1f5f9' : '#fffbeb',
          color: hasFlagged ? '#64748b' : '#b45309',
          cursor: isButtonDisabled ? 'not-allowed' : 'pointer',
          transition: 'all 0.15s ease-in-out',
          boxShadow: hasFlagged ? 'none' : '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        }}
      >
        <span aria-hidden="true" style={{ fontSize: '16px' }}>
          {hasFlagged ? '🚩' : isPending ? '⏳' : '⚠️'}
        </span>
        <span>
          {hasFlagged
            ? 'Flagged'
            : isPending
            ? 'Submitting...'
            : 'Challenge Question'}
        </span>
      </button>

      {feedback && (
        <div
          role="status"
          aria-live="polite"
          style={{
            marginTop: '8px',
            fontSize: '13px',
            fontWeight: '500',
            textAlign: 'center',
            color:
              feedback.type === 'success'
                ? '#16a34a'
                : feedback.type === 'error'
                ? '#dc2626'
                : '#475569',
          }}
        >
          {feedback.message}
        </div>
      )}
    </div>
  );
}

export default ChallengeButton;

