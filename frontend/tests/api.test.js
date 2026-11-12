import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { addQuestion, getAuthToken, listQuizzes, signIn } from '../src/lib/api';

function jsonResponse(status, body) {
  return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
}

describe('Host API client', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('1. stores the token after signing in and sends it on later calls', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => jsonResponse(200, { access_token: 'abc' }))
      .mockImplementationOnce(() => jsonResponse(200, []));

    await signIn('host@example.test', 'password1');
    await listQuizzes();

    expect(getAuthToken()).toBe('abc');
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer abc');
  });

  it('2. retries a read twice when the server cannot be reached, then reports it', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(listQuizzes()).rejects.toThrow(/could not be reached/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('3. never retries a write, so a question is not created twice', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(addQuestion(1, { text: 'Q' })).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('4. shows the server message and signs out on 401', async () => {
    localStorage.setItem('lockin_host_token', 'old');
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      jsonResponse(401, { detail: 'Invalid or expired token.' })
    );

    await expect(listQuizzes()).rejects.toMatchObject({ status: 401, message: 'Invalid or expired token.' });
    expect(getAuthToken()).toBeNull();
  });
});
