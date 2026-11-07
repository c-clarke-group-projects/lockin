import React, { useState, useEffect, useMemo, useRef } from 'react';

/**
 * Deduplicate leaderboard rows by participant_id or display_name.
 * Preserves backend order and rankings.
 */
export function deduplicateLeaderboard(list) {
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
    } else {
      result.push(item);
    }
  }

  return result;
}

/**
 * Leaderboard Component (PB-20).
 * Displays live quiz rankings adhering to backend authoritative ranks and tie-breakers.
 *
 * Props:
 * - top: Initial or controlled top players array [{ rank, display_name, score, ... }]
 * - count: Total participant count
 * - you: Current player's ranking object { rank, score, display_name } (for mobile/personal display)
 * - variant: 'big-screen' | 'mobile'
 * - client: Optional QuizWebSocketClient instance for real-time live events
 * - isLoading: Boolean
 * - isDisconnected: Boolean
 * - error: String or Error
 * - title: Header text (default "Leaderboard")
 */
export function Leaderboard({
  top: controlledTop = null,
  count: controlledCount = null,
  you: controlledYou = null,
  variant = 'big-screen',
  client = null,
  clientOverride = null,
  isLoading: controlledLoading = false,
  isDisconnected: controlledDisconnected = false,
  error: controlledError = null,
  title = 'Leaderboard',
  className = '',
}) {
  const activeClient = clientOverride || client;

  // Internal state for live updates
  const [liveTop, setLiveTop] = useState(controlledTop);
  const [liveCount, setLiveCount] = useState(controlledCount);
  const [liveYou, setLiveYou] = useState(controlledYou);
  const [isSocketConnected, setIsSocketConnected] = useState(activeClient ? activeClient.isOpen : true);
  const [socketError, setSocketError] = useState(null);
  const [voidNotice, setVoidNotice] = useState(null);
  const isMountedRef = useRef(true);

  // Sync controlled props
  useEffect(() => {
    isMountedRef.current = true;
    if (controlledTop !== null) {
      setLiveTop(controlledTop);
    }
    if (controlledCount !== null) {
      setLiveCount(controlledCount);
    }
    if (controlledYou !== null) {
      setLiveYou(controlledYou);
    }
    return () => {
      isMountedRef.current = false;
    };
  }, [controlledTop, controlledCount, controlledYou]);

  // Subscribe to WebSocket live events
  useEffect(() => {
    if (!activeClient || typeof activeClient.onMessage !== 'function') return;

    const unregOpen = typeof activeClient.onOpen === 'function'
      ? activeClient.onOpen(() => {
          if (isMountedRef.current) {
            setIsSocketConnected(true);
            setSocketError(null);
          }
        })
      : null;

    const unregClose = typeof activeClient.onClose === 'function'
      ? activeClient.onClose(() => {
          if (isMountedRef.current) {
            setIsSocketConnected(false);
          }
        })
      : null;

    const unregError = typeof activeClient.onError === 'function'
      ? activeClient.onError((err) => {
          if (isMountedRef.current) {
            setSocketError(err?.message || 'WebSocket connection error');
          }
        })
      : null;

    const unregMessage = activeClient.onMessage((msg) => {
      if (!msg || !isMountedRef.current) return;

      // 1. Leaderboard broadcast (docs/WEBSOCKET_PROTOCOL.md)
      if (msg.type === 'leaderboard') {
        if (msg.data?.top) {
          setLiveTop(msg.data.top);
        }
        if (msg.data?.count !== undefined) {
          setLiveCount(msg.data.count);
        }
        if (msg.data?.you) {
          setLiveYou(msg.data.you);
        }
      }

      // 2. Voided question broadcast (recalculated leaderboard)
      if (msg.type === 'voided') {
        if (msg.data?.top) {
          setLiveTop(msg.data.top);
        }
        if (msg.data?.count !== undefined) {
          setLiveCount(msg.data.count);
        }
        if (msg.data?.you) {
          setLiveYou(msg.data.you);
        }
        setVoidNotice(`Question ${msg.data?.question_id || ''} was voided. Leaderboard updated!`);
      }

      // 3. Quiz ended broadcast
      if (msg.type === 'ended') {
        if (msg.data?.top) {
          setLiveTop(msg.data.top);
        }
        if (msg.data?.count !== undefined) {
          setLiveCount(msg.data.count);
        }
        if (msg.data?.you) {
          setLiveYou(msg.data.you);
        }
      }

      // 4. Error event
      if (msg.type === 'error') {
        setSocketError(msg.data?.message || 'Error received from server');
      }
    });

    return () => {
      if (typeof unregOpen === 'function') unregOpen();
      if (typeof unregClose === 'function') unregClose();
      if (typeof unregError === 'function') unregError();
      if (typeof unregMessage === 'function') unregMessage();
    };
  }, [activeClient]);

  // Deduplicate entries while preserving backend ranks
  const rawList = liveTop || [];
  const entries = useMemo(() => deduplicateLeaderboard(rawList), [rawList]);

  const isLoading = controlledLoading;
  const isDisconnected = controlledDisconnected || (!isSocketConnected && activeClient !== null);
  const errorMessage = controlledError || socketError;
  const isMobile = variant === 'mobile';

  // Helper for rank badge
  const renderRankBadge = (rank) => {
    if (rank === 1) return <span aria-label="1st place">🥇</span>;
    if (rank === 2) return <span aria-label="2nd place">🥈</span>;
    if (rank === 3) return <span aria-label="3rd place">🥉</span>;
    return <span style={{ fontWeight: '700', color: '#64748b' }}>#{rank}</span>;
  };

  return (
    <div
      className={`leaderboard-container ${isMobile ? 'leaderboard-mobile' : 'leaderboard-big-screen'} ${className}`.trim()}
      style={{
        width: '100%',
        maxWidth: isMobile ? '480px' : '900px',
        margin: '0 auto',
        padding: isMobile ? '16px' : '32px',
        fontFamily: 'var(--font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif)',
        boxSizing: 'border-box',
      }}
    >
      {/* Header */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '20px',
          borderBottom: '2px solid #e2e8f0',
          paddingBottom: '12px',
        }}
      >
        <div>
          <h2
            style={{
              fontSize: isMobile ? '22px' : '32px',
              fontWeight: '800',
              color: '#0f172a',
              letterSpacing: '-0.5px',
              margin: 0,
            }}
          >
            {title}
          </h2>
          {liveCount !== null && (
            <p style={{ fontSize: '14px', color: '#64748b', margin: '4px 0 0 0' }}>
              {liveCount} {liveCount === 1 ? 'participant' : 'participants'}
            </p>
          )}
        </div>

        {isDisconnected && (
          <span
            role="status"
            style={{
              padding: '6px 12px',
              borderRadius: '9999px',
              backgroundColor: '#fef2f2',
              color: '#dc2626',
              fontSize: '12px',
              fontWeight: '600',
              border: '1px solid #fecaca',
            }}
          >
            Disconnected
          </span>
        )}
      </header>

      {/* Connection Notice */}
      {isDisconnected && (
        <div
          role="alert"
          style={{
            marginBottom: '16px',
            padding: '12px 16px',
            borderRadius: '8px',
            backgroundColor: '#fffbeb',
            border: '1px solid #fde68a',
            color: '#92400e',
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span>⚠️ Connection lost. Reconnecting to live scores...</span>
        </div>
      )}

      {/* Void Notice */}
      {voidNotice && (
        <div
          role="status"
          style={{
            marginBottom: '16px',
            padding: '10px 14px',
            borderRadius: '8px',
            backgroundColor: '#eff6ff',
            border: '1px solid #bfdbfe',
            color: '#1e40af',
            fontSize: '13px',
            fontWeight: '600',
          }}
        >
          ℹ️ {voidNotice}
        </div>
      )}

      {/* Error state */}
      {errorMessage && (
        <div
          role="alert"
          style={{
            marginBottom: '16px',
            padding: '12px 16px',
            borderRadius: '8px',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#dc2626',
            fontSize: '14px',
          }}
        >
          {errorMessage}
        </div>
      )}

      {/* Loading state */}
      {isLoading ? (
        <div
          role="status"
          style={{
            padding: '40px 20px',
            textAlign: 'center',
            color: '#64748b',
            fontSize: '16px',
          }}
        >
          <div
            style={{
              display: 'inline-block',
              width: '28px',
              height: '28px',
              border: '3px solid #cbd5e1',
              borderTopColor: '#2563eb',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
              marginBottom: '12px',
            }}
          />
          <div>Loading leaderboard...</div>
        </div>
      ) : entries.length === 0 ? (
        /* Empty state */
        <div
          role="status"
          style={{
            padding: '48px 24px',
            textAlign: 'center',
            backgroundColor: '#f8fafc',
            border: '1px dashed #cbd5e1',
            borderRadius: '12px',
            color: '#64748b',
          }}
        >
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>🏆</div>
          <p style={{ fontSize: '16px', fontWeight: '600', margin: 0 }}>
            No players on the leaderboard yet.
          </p>
          <p style={{ fontSize: '13px', color: '#94a3b8', marginTop: '4px' }}>
            Scores will appear here as soon as questions are answered.
          </p>
        </div>
      ) : (
        /* Rankings Table / List */
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            overflow: 'hidden',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
          }}
        >
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
            }}
            aria-label="Leaderboard rankings"
          >
            {entries.map((player, idx) => {
              const isYou =
                Boolean(liveYou && liveYou.display_name && player.display_name === liveYou.display_name) ||
                Boolean(liveYou && liveYou.participant_id && player.participant_id === liveYou.participant_id);

              const rankDisplay = player.rank !== undefined ? player.rank : idx + 1;

              return (
                <li
                  key={player.participant_id || player.display_name || idx}
                  data-testid={`leaderboard-row-${idx}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: isMobile ? '12px 14px' : '16px 24px',
                    borderBottom: idx === entries.length - 1 ? 'none' : '1px solid #f1f5f9',
                    backgroundColor: isYou ? '#eff6ff' : idx % 2 === 0 ? '#ffffff' : '#f8fafc',
                    borderLeft: isYou ? '4px solid #2563eb' : '4px solid transparent',
                    transition: 'background-color 0.15s ease',
                  }}
                >
                  {/* Rank & Name */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '12px' : '18px' }}>
                    <div
                      style={{
                        minWidth: '36px',
                        textAlign: 'center',
                        fontSize: isMobile ? '16px' : '20px',
                      }}
                    >
                      {renderRankBadge(rankDisplay)}
                    </div>
                    <div>
                      <span
                        style={{
                          fontSize: isMobile ? '15px' : '18px',
                          fontWeight: isYou ? '700' : '600',
                          color: isYou ? '#1d4ed8' : '#0f172a',
                        }}
                      >
                        {player.display_name || 'Anonymous'}
                      </span>
                      {isYou && (
                        <span
                          style={{
                            marginLeft: '8px',
                            fontSize: '11px',
                            fontWeight: '700',
                            backgroundColor: '#dbeafe',
                            color: '#1e40af',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            textTransform: 'uppercase',
                          }}
                        >
                          You
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Score & Time */}
                  <div style={{ textAlign: 'right' }}>
                    <span
                      style={{
                        fontSize: isMobile ? '16px' : '20px',
                        fontWeight: '800',
                        color: '#0f172a',
                      }}
                    >
                      {player.score !== undefined ? player.score : player.total_score || 0}
                    </span>
                    <span style={{ fontSize: '12px', color: '#64748b', marginLeft: '4px' }}>pts</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Personal Rank Banner (Sticky / Prominent on Mobile when `you` is provided) */}
      {liveYou && (
        <div
          role="region"
          aria-label="Your ranking summary"
          style={{
            marginTop: '16px',
            padding: '14px 18px',
            backgroundColor: '#1e293b',
            color: '#ffffff',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '18px' }}>👤</span>
            <div>
              <div style={{ fontSize: '12px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '700' }}>
                Your Rank
              </div>
              <div style={{ fontSize: '18px', fontWeight: '800' }}>
                #{liveYou.rank !== undefined ? liveYou.rank : '-'}
              </div>
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '12px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '700' }}>
              Your Score
            </div>
            <div style={{ fontSize: '18px', fontWeight: '800', color: '#38bdf8' }}>
              {liveYou.score !== undefined ? liveYou.score : 0} pts
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Leaderboard;

