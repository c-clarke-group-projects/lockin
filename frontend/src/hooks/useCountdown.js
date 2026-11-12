import { useEffect, useState } from 'react';

const TICK_MS = 250;

/**
 * Milliseconds left on a question. Counts down from remainingMs using the time
 * since the message arrived, never the device clock (protocol section 7 rule 9).
 * The server decides the lock, so this only drives the display.
 */
export function useCountdown(remainingMs, resetKey) {
  const [left, setLeft] = useState(remainingMs ?? 0);

  useEffect(() => {
    if (typeof remainingMs !== 'number') {
      return undefined;
    }
    const started = performance.now();
    setLeft(remainingMs);
    const timer = setInterval(() => {
      const next = Math.max(remainingMs - (performance.now() - started), 0);
      setLeft(next);
      if (next === 0) {
        clearInterval(timer);
      }
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [remainingMs, resetKey]);

  return left;
}
