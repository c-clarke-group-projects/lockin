import React, { useRef, useState } from 'react';
import { generateQuestions } from '../lib/api';
import { Icon } from './Icon';

const MAX_PDF_MB = 10;
const COUNT_OPTIONS = [5, 10, 15, 20];

function pdfProblem(file) {
  if (!file) {
    return 'Choose a PDF first.';
  }
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    return 'Only PDF files can be used.';
  }
  if (file.size > MAX_PDF_MB * 1024 * 1024) {
    return `The PDF is larger than ${MAX_PDF_MB} MB.`;
  }
  return '';
}

/** Upload a PDF and ask the backend to write questions from its text. */
export function PdfGenerator({ quizId, onAdded, describeError }) {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [count, setCount] = useState(COUNT_OPTIONS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const pick = (picked) => {
    setFile(picked || null);
    setError(picked ? pdfProblem(picked) : '');
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setDragOver(false);
    pick(event.dataTransfer.files?.[0]);
  };

  const handleGenerate = async () => {
    const problem = pdfProblem(file);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await generateQuestions(quizId, file, count);
      onAdded(result.questions.length, file.name);
      setFile(null);
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="form">
      <label
        className={`dropzone ${dragOver ? 'dropzone--over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <Icon name={file ? 'file' : 'upload'} />
        {file ? (
          <span className="dropzone__file">{file.name}</span>
        ) : (
          <span>Choose a PDF or drop it here</span>
        )}
        <span className="field__hint">Text based PDF, up to {MAX_PDF_MB} MB</span>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="visually-hidden"
          onChange={(e) => pick(e.target.files?.[0])}
          disabled={busy}
        />
      </label>

      <div className="inline-form">
        <div className="field">
          <label htmlFor="question-count" className="field__label">
            Questions to write
          </label>
          <select
            id="question-count"
            className="input"
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            disabled={busy}
          >
            {COUNT_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
        <button type="button" className="pill pill--solid" onClick={handleGenerate} disabled={busy}>
          {busy ? <span className="spinner" aria-hidden="true" /> : <Icon name="file" className="pill__icon" />}
          {busy ? 'Writing questions...' : 'Generate questions'}
        </button>
      </div>

      {busy && (
        <p className="field__hint" role="status">
          Reading the PDF and writing questions. On a laptop model this can take a few minutes.
        </p>
      )}
      {error && (
        <div className="notice notice--error" role="alert">
          <Icon name="alert" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
