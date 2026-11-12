import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { deleteQuestion, getQuiz, publishQuiz } from '../../lib/api';
import { useHostErrors } from '../../hooks/useHostErrors';
import { Navbar } from '../../components/Navbar';
import { Icon } from '../../components/Icon';
import { PdfGenerator } from '../../components/PdfGenerator';
import { QuestionForm } from '../../components/QuestionForm';
import { QuestionCard } from '../../components/QuestionCard';

const TABS = [
  { id: 'pdf', label: 'From a PDF' },
  { id: 'write', label: 'Write one' },
];

function questionLabel(count) {
  return count === 1 ? '1 question' : `${count} questions`;
}

export function QuizEditorPage() {
  const { id: quizId } = useParams();
  const navigate = useNavigate();
  const describeError = useHostErrors();

  const [quiz, setQuiz] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [tab, setTab] = useState('pdf');
  const [notice, setNotice] = useState('');
  const [listError, setListError] = useState('');
  const [removingId, setRemovingId] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState('');

  const load = useCallback(async () => {
    setLoadError('');
    try {
      setQuiz(await getQuiz(quizId));
    } catch (error) {
      setLoadError(describeError(error));
    }
  }, [quizId, describeError]);

  useEffect(() => {
    load();
  }, [load]);

  const handleGenerated = (count, fileName) => {
    setNotice(`Added ${questionLabel(count)} from ${fileName}. Check each one before you publish.`);
    load();
  };

  const handleWritten = () => {
    setNotice('Question added.');
    load();
  };

  const handleRemove = async (question) => {
    if (!window.confirm('Remove this question from the room?')) {
      return;
    }
    setRemovingId(question.id);
    setListError('');
    try {
      await deleteQuestion(quizId, question.id);
      setNotice('Question removed.');
      await load();
    } catch (error) {
      setListError(describeError(error));
    } finally {
      setRemovingId(null);
    }
  };

  const handlePublish = async () => {
    setPublishing(true);
    setPublishError('');
    try {
      const session = await publishQuiz(quizId);
      navigate(`/host/room/${session.id}`);
    } catch (error) {
      setPublishError(describeError(error));
      setPublishing(false);
    }
  };

  if (loadError) {
    return (
      <div className="stage stage--scroll">
        <Navbar />
        <main className="host-main">
          <div className="notice notice--error" role="alert">
            <Icon name="alert" />
            <span>{loadError}</span>
            <button type="button" className="text-link" onClick={load}>
              Try again
            </button>
          </div>
        </main>
      </div>
    );
  }

  const questions = quiz?.questions ?? [];

  return (
    <div className="stage stage--scroll">
      <Navbar />
      <main className="host-main">
        <Link to="/host" className="back-link">
          <Icon name="arrowLeft" />
          Your rooms
        </Link>

        <div className="editor-head">
          <div>
            <h1 className="page-title">{quiz ? quiz.title : 'Loading room...'}</h1>
            <p className="page-lead">
              {quiz ? `${questionLabel(questions.length)}. Publish when they are ready.` : ''}
            </p>
          </div>
          <div className="publish-bar">
            <span className="publish-bar__count" aria-hidden="true">
              {questionLabel(questions.length)}
            </span>
            <button
              type="button"
              className="pill pill--ink"
              onClick={handlePublish}
              disabled={!quiz || questions.length === 0 || publishing}
            >
              {publishing ? <span className="spinner" aria-hidden="true" /> : <Icon name="users" className="pill__icon" />}
              Publish room
            </button>
          </div>
        </div>

        {publishError && (
          <div className="notice notice--error" role="alert">
            <Icon name="alert" />
            <span>{publishError}</span>
          </div>
        )}

        <section className="sheet stack" aria-labelledby="add-title">
          <h2 id="add-title" className="sheet__title" style={{ fontSize: 22 }}>
            Add questions
          </h2>
          <div className="tabs" role="tablist" aria-label="How to add questions">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                id={`tab-${item.id}`}
                className="tab"
                aria-selected={tab === item.id}
                aria-controls={`panel-${item.id}`}
                onClick={() => setTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          {notice && (
            <div className="notice notice--ok" role="status">
              <Icon name="check" />
              <span>{notice}</span>
            </div>
          )}

          <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`}>
            {tab === 'pdf' ? (
              <PdfGenerator quizId={quizId} onAdded={handleGenerated} describeError={describeError} />
            ) : (
              <QuestionForm quizId={quizId} onAdded={handleWritten} describeError={describeError} />
            )}
          </div>
        </section>

        <section className="stack" aria-labelledby="questions-title">
          <h2 id="questions-title" className="page-lead" style={{ fontWeight: 800 }}>
            Questions in this room
          </h2>
          {listError && (
            <div className="notice notice--error" role="alert">
              <Icon name="alert" />
              <span>{listError}</span>
            </div>
          )}
          {quiz && questions.length === 0 && (
            <p className="empty">No questions yet. Generate them from a PDF or write your first one above.</p>
          )}
          {questions.length > 0 && (
            <ol className="question-list">
              {questions.map((question, index) => (
                <QuestionCard
                  key={question.id ?? index}
                  question={question}
                  number={index + 1}
                  onRemove={handleRemove}
                  removing={removingId === question.id}
                />
              ))}
            </ol>
          )}
        </section>
      </main>
    </div>
  );
}
