/**
 * Host API client. Every call goes to the backend under /api. Reads are retried
 * when the server cannot be reached, writes are sent once so nothing is created
 * twice. A 401 signs the host out.
 */

import { apiBaseUrl } from './config';

const TOKEN_KEY = 'lockin_host_token';
const EMAIL_KEY = 'lockin_host_email';

const REQUEST_TIMEOUT_MS = 15000;
const GENERATION_TIMEOUT_MS = 120000;
const READ_RETRIES = 2;
const RETRY_DELAY_MS = 250;

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    if (value) {
      localStorage.setItem(key, value);
    } else {
      localStorage.removeItem(key);
    }
  } catch (error) {
    console.warn('Could not use browser storage', error);
  }
}

export function getAuthToken() {
  return readStorage(TOKEN_KEY);
}

/** Same token as getAuthToken, kept for the flagged questions and leaderboard pages. */
export function getAccessToken() {
  return getAuthToken();
}

export function getHostEmail() {
  return readStorage(EMAIL_KEY);
}

export function signOut() {
  writeStorage(TOKEN_KEY, null);
  writeStorage(EMAIL_KEY, null);
}

/** FastAPI sends `detail` as a string, or as a list of field errors on a 422. */
function errorMessage(body, status) {
  const detail = body?.detail;
  if (typeof detail === 'string') {
    return detail;
  }
  if (Array.isArray(detail) && detail[0]?.msg) {
    return detail[0].msg;
  }
  return `The server returned an error (${status}). Try again.`;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendOnce(method, path, { body, timeoutMs }) {
  const token = getAuthToken();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const isForm = body instanceof FormData;
  if (body !== undefined && !isForm) {
    headers['Content-Type'] = 'application/json';
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${apiBaseUrl()}${path}`, {
      method,
      headers,
      body: body === undefined || isForm ? body : JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function readResponse(response) {
  if (response.status === 204) {
    return null;
  }
  const body = await response.json().catch(() => null);
  if (response.ok) {
    return body;
  }
  if (response.status === 401) {
    signOut();
  }
  throw new ApiError(response.status, errorMessage(body, response.status));
}

async function request(method, path, { body, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  const attempts = method === 'GET' ? READ_RETRIES + 1 : 1;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let response;
    try {
      response = await sendOnce(method, path, { body, timeoutMs });
    } catch (error) {
      console.warn(`${method} ${path} failed on attempt ${attempt} of ${attempts}`, error);
      if (attempt < attempts) {
        await wait(RETRY_DELAY_MS * attempt);
        continue;
      }
      throw new ApiError(0, 'The server could not be reached. Check your connection and try again.');
    }
    return readResponse(response);
  }
  return null;
}

async function authenticate(path, email, password) {
  const data = await request('POST', path, { body: { email, password } });
  writeStorage(TOKEN_KEY, data.access_token);
  writeStorage(EMAIL_KEY, email);
  return data;
}

export function signIn(email, password) {
  return authenticate('/api/auth/login', email, password);
}

export function registerHost(email, password) {
  return authenticate('/api/auth/register', email, password);
}

export function listQuizzes() {
  return request('GET', '/api/quizzes');
}

export function createQuiz(title) {
  return request('POST', '/api/quizzes', { body: { title } });
}

export function getQuiz(quizId) {
  return request('GET', `/api/quizzes/${quizId}`);
}

export function addQuestion(quizId, question) {
  return request('POST', '/api/questions', { body: { ...question, quiz_id: Number(quizId) } });
}

export function deleteQuestion(quizId, questionId) {
  return request('DELETE', `/api/quizzes/${quizId}/questions/${questionId}`);
}

/** Sends the PDF to the backend, which generates the questions and saves them to the quiz. */
export function generateQuestions(quizId, file, count) {
  const form = new FormData();
  form.append('file', file);
  form.append('count', String(count));
  return request('POST', `/api/quizzes/${quizId}/generate`, {
    body: form,
    timeoutMs: GENERATION_TIMEOUT_MS,
  });
}

export function publishQuiz(quizId) {
  return request('POST', `/api/quizzes/${quizId}/sessions`);
}

export function getSession(sessionId) {
  return request('GET', `/api/sessions/${sessionId}`);
}

const LEGACY_TIMEOUT_MS = 8000;
const LEGACY_MAX_RETRIES = 1;

/**
 * Request helper used by the flagged questions page. It takes a ready body and
 * an explicit token, and retries once on a network error, a 429 or a 5xx.
 */
export async function apiRequest(path, { token, ...options } = {}) {
  const method = options.method || 'GET';
  const url = `${apiBaseUrl()}${path}`;
  let lastError;

  for (let attempt = 0; attempt <= LEGACY_MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), LEGACY_TIMEOUT_MS);
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
      if (attempt < LEGACY_MAX_RETRIES) {
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
      if (attempt < LEGACY_MAX_RETRIES && (response.status === 429 || response.status >= 500)) {
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
