import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { FlaggedQuestionsPage } from '../src/pages/FlaggedQuestionsPage';

const flaggedQuestion = {
  question_id: 17,
  quiz_id: 4,
  question_text: 'Which option is correct?',
  options: ['First', 'Second', 'Third', 'Fourth'],
  correct_index: 1,
  time_limit: 30,
  source_page_id: 2,
  source_snippet: 'A source excerpt',
  origin: 'manual',
  flag_count: 3,
};

function response(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(data),
  };
}

describe('FlaggedQuestionsPage', () => {
  beforeEach(() => {
    window.localStorage.setItem('lockin_host_token', 'host-token');
    vi.stubGlobal('fetch', vi.fn());
  });

  it('lists flag counts and opens a question in edit mode', async () => {
    fetch.mockResolvedValue(response({ flagged_questions: [flaggedQuestion] }));

    render(
      <MemoryRouter initialEntries={['/host/sessions/9/flags']}>
        <Routes>
          <Route
            path="/host/sessions/:sessionId/flags"
            element={<FlaggedQuestionsPage />}
          />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText('Flagged 3 times')).toBeInTheDocument();
    expect(screen.getByText('Which option is correct?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /edit question/i }));

    expect(screen.getByRole('textbox', { name: 'Question' })).toHaveValue(
      'Which option is correct?'
    );
    expect(screen.getByRole('textbox', { name: 'Option 2' })).toHaveValue('Second');
  });

  it('saves edits to the question through the protected API', async () => {
    fetch
      .mockResolvedValueOnce(response({ flagged_questions: [flaggedQuestion] }))
      .mockResolvedValueOnce(response({
        ...flaggedQuestion,
        id: flaggedQuestion.question_id,
        text: 'Updated question',
      }));

    render(
      <MemoryRouter initialEntries={['/host/sessions/9/flags']}>
        <Routes>
          <Route
            path="/host/sessions/:sessionId/flags"
            element={<FlaggedQuestionsPage />}
          />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('button', { name: /edit question/i }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Question' }), {
      target: { value: 'Updated question' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save question' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Question updated.');
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const [, options] = fetch.mock.calls[1];
    expect(options.method).toBe('PUT');
    expect(options.headers.get('Authorization')).toBe('Bearer host-token');
    expect(JSON.parse(options.body).text).toBe('Updated question');
  });
});
