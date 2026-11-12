import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import * as api from '../src/lib/api';
import { HostAuthPage } from '../src/pages/host/HostAuthPage';
import { QuizEditorPage } from '../src/pages/host/QuizEditorPage';
import { QuestionForm } from '../src/components/QuestionForm';

function renderAt(path, routes) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        {routes}
        <Route path="/host/room/:sessionId" element={<p>Live room page</p>} />
        <Route path="/host" element={<p>Rooms page</p>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('Host screens', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('1. sign in shows the server message when the password is wrong', async () => {
    vi.spyOn(api, 'signIn').mockRejectedValue(new api.ApiError(401, 'Incorrect email or password.'));
    renderAt('/host/login', <Route path="/host/login" element={<HostAuthPage />} />);

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'host@example.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong-pass' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.');
  });

  it('2. register checks the password length before calling the server', () => {
    const register = vi.spyOn(api, 'registerHost');
    renderAt('/host/register', <Route path="/host/register" element={<HostAuthPage />} />);

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'host@example.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(screen.getByRole('alert')).toHaveTextContent('at least 8 characters');
    expect(register).not.toHaveBeenCalled();
  });

  it('3. question form asks for the correct option before saving', () => {
    const add = vi.spyOn(api, 'addQuestion');
    render(<QuestionForm quizId="4" onAdded={vi.fn()} describeError={(e) => e.message} />);

    fireEvent.change(screen.getByLabelText('Question'), { target: { value: 'Capital of France?' } });
    ['Paris', 'Rome', 'Oslo', 'Bern'].forEach((text, index) => {
      fireEvent.change(screen.getByLabelText(`Option ${index + 1}`), { target: { value: text } });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add question' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Choose which option is correct.');
    expect(add).not.toHaveBeenCalled();
  });

  it('4. question form sends trimmed text and the chosen option', async () => {
    const add = vi.spyOn(api, 'addQuestion').mockResolvedValue({ id: 9 });
    const onAdded = vi.fn();
    render(<QuestionForm quizId="4" onAdded={onAdded} describeError={(e) => e.message} />);

    fireEvent.change(screen.getByLabelText('Question'), { target: { value: '  Capital of France?  ' } });
    ['Paris ', 'Rome', 'Oslo', 'Bern'].forEach((text, index) => {
      fireEvent.change(screen.getByLabelText(`Option ${index + 1}`), { target: { value: text } });
    });
    fireEvent.click(screen.getByLabelText('Option 1 is correct'));
    fireEvent.click(screen.getByRole('button', { name: 'Add question' }));

    await waitFor(() => expect(onAdded).toHaveBeenCalled());
    expect(add).toHaveBeenCalledWith('4', {
      text: 'Capital of France?',
      options: ['Paris', 'Rome', 'Oslo', 'Bern'],
      correct_index: 0,
      time_limit: 20,
      source_note: null,
    });
  });

  it('5. publish stays off until the room has a question, then opens the live room', async () => {
    const quiz = { id: 4, title: 'Cells', created_at: '2026-11-01T10:00:00Z', questions: [] };
    const getQuiz = vi.spyOn(api, 'getQuiz').mockResolvedValue(quiz);
    vi.spyOn(api, 'publishQuiz').mockResolvedValue({ id: 31, join_code: '012345' });
    const editor = <Route path="/host/quiz/:id" element={<QuizEditorPage />} />;

    const { unmount } = renderAt('/host/quiz/4', editor);
    expect(await screen.findByRole('button', { name: 'Publish room' })).toBeDisabled();
    unmount();

    getQuiz.mockResolvedValue({
      ...quiz,
      questions: [
        { id: 1, text: 'Q', options: ['a', 'b', 'c', 'd'], correct_index: 0, time_limit: 20, origin: 'manual' },
      ],
    });
    renderAt('/host/quiz/4', editor);
    const publish = await screen.findByRole('button', { name: 'Publish room' });
    await waitFor(() => expect(publish).toBeEnabled());
    fireEvent.click(publish);

    expect(await screen.findByText('Live room page')).toBeInTheDocument();
  });
});
