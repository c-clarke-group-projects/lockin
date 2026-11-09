const API_BASE_URL = import.meta.env?.VITE_API_BASE_URL || 'http://127.0.0.1:8000';
const REQUEST_TIMEOUT_MS = 8000;
const MAX_RETRIES = 1;

export function getAccessToken() {
  return window.localStorage.getItem('access_token');
}

export async function apiRequest(path, { token, ...options } = {}) {
  const method = options.method || 'GET';
  const url = `${API_BASE_URL}${path}`;
  let lastError;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const headers = new Headers(options.headers || {});
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (options.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    console.info(`API ${method} ${path}, attempt ${attempt + 1}`);
    let response;
    let responseData = null;
    try {
      response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });
      console.info(`API ${method} ${path}, response ${response.status}`);
      const responseText = response.status === 204 ? '' : await response.text();
      if (responseText) {
        try {
          responseData = JSON.parse(responseText);
        } catch {
          responseData = responseText;
        }
      }
    } catch (error) {
      if (attempt < MAX_RETRIES) {
        console.warn(`API ${method} ${path}, retrying after request failure`);
        continue;
      }
      console.info(`API ${method} ${path}, retry skipped after reaching the limit`);
      console.error(`API ${method} ${path}, request failed`);
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const detail = responseData?.detail || `Request failed with status ${response.status}.`;
      lastError = new Error(detail);
      if (attempt < MAX_RETRIES && (response.status === 429 || response.status >= 500)) {
        console.warn(`API ${method} ${path}, retrying after response ${response.status}`);
        continue;
      }
      console.info(`API ${method} ${path}, retry skipped for response ${response.status}`);
      console.error(`API ${method} ${path}, request failed`);
      throw lastError;
    }
    return responseData;
  }

  throw lastError;
}
