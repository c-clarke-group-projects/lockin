/**
 * Backend addresses. When the VITE_ values are not set, the app talks to the
 * address it was loaded from, and the Vite dev server forwards /api and /ws to
 * the backend. That way a phone on the same network needs only 1 address.
 */

function trimSlash(value) {
  return value.replace(/\/+$/, '');
}

export function apiBaseUrl() {
  const fromEnv = import.meta.env?.VITE_API_BASE_URL;
  return fromEnv ? trimSlash(fromEnv) : '';
}

export function liveSocketUrl() {
  const fromEnv = import.meta.env?.VITE_WS_BASE_URL;
  if (fromEnv) {
    return `${trimSlash(fromEnv)}/ws`;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

export function joinUrlFor(joinCode) {
  return `${window.location.origin}/join/${joinCode}`;
}

/** True when phones scanning a QR code for this address could not reach it. */
export function isLoopbackAddress() {
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}
