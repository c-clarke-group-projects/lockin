import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createQuiz, listQuizzes } from '../../lib/api';
import { useHostErrors } from '../../hooks/useHostErrors';
import { Navbar } from '../../components/Navbar';
import { Icon } from '../../components/Icon';

const DATE_FORMAT = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

function questionLabel(count) {
  return count === 1 ? '1 question' : `${count} questions`;
}

export function HostDashboardPage() {
  const navigate = useNavigate();
  const describeError = useHostErrors();
  const [rooms, setRooms] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [title, setTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const load = useCallback(async () => {
    setLoadError('');
    try {
      setRooms(await listQuizzes());
    } catch (error) {
      setLoadError(describeError(error));
    }
  }, [describeError]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (event) => {
    event.preventDefault();
    if (!title.trim()) {
      setCreateError('Give the room a name, for example "Biology week 3".');
      return;
    }
    setCreating(true);
    setCreateError('');
    try {
      const quiz = await createQuiz(title.trim());
      navigate(`/host/quiz/${quiz.id}`);
    } catch (error) {
      setCreateError(describeError(error));
      setCreating(false);
    }
  };

  return (
    <div className="stage stage--scroll">
      <Navbar />
      <main className="host-main">
        <h1 className="page-title">Your rooms</h1>
        <p className="page-lead">Add questions to a room, then publish it to get a join code.</p>

        <section className="sheet stack" aria-labelledby="new-room-title">
          <h2 id="new-room-title" className="sheet__title" style={{ fontSize: 22 }}>
            New room
          </h2>
          <form className="inline-form" onSubmit={handleCreate} noValidate>
            <div className="field">
              <label htmlFor="room-title" className="field__label">
                Room name
              </label>
              <input
                id="room-title"
                className="input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Biology week 3"
                disabled={creating}
                maxLength={120}
              />
            </div>
            <button type="submit" className="pill pill--solid" disabled={creating}>
              {creating ? <span className="spinner" aria-hidden="true" /> : <Icon name="plus" className="pill__icon" />}
              Create room
            </button>
          </form>
          {createError && (
            <div className="notice notice--error" role="alert">
              <Icon name="alert" />
              <span>{createError}</span>
            </div>
          )}
        </section>

        <section className="stack" aria-labelledby="room-list-title">
          <h2 id="room-list-title" className="visually-hidden">
            Saved rooms
          </h2>

          {loadError && (
            <div className="notice notice--error" role="alert">
              <Icon name="alert" />
              <span>{loadError}</span>
              <button type="button" className="text-link" onClick={load}>
                Try again
              </button>
            </div>
          )}

          {!rooms && !loadError && (
            <p className="page-lead" role="status">
              Loading your rooms...
            </p>
          )}

          {rooms && rooms.length === 0 && (
            <p className="empty">No rooms yet. Name your first room above.</p>
          )}

          {rooms && rooms.length > 0 && (
            <ul className="room-list">
              {rooms.map((room, index) => (
                <li key={room.id}>
                  <Link
                    to={`/host/quiz/${room.id}`}
                    className="room-card"
                    style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
                  >
                    <div>
                      <p className="room-card__title">{room.title}</p>
                      <p className="room-card__meta">
                        {questionLabel(room.question_count)} &middot; Created{' '}
                        {DATE_FORMAT.format(new Date(room.created_at))}
                      </p>
                    </div>
                    <span className="room-card__go" aria-hidden="true">
                      <Icon name="arrowRight" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
