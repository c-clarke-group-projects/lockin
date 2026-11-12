import React from 'react';
import { Link } from 'react-router-dom';

/** Padlock mark and wordmark. Links home unless `to` is null. */
export function LockInLogo({ to = '/' }) {
  const content = (
    <>
      <svg className="brand__mark" viewBox="0 0 26 26" aria-hidden="true" focusable="false">
        <path
          d="M8 11V8a5 5 0 0110 0v3"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <rect x="3" y="11" width="20" height="14" rx="5" fill="currentColor" />
        <circle cx="13" cy="18" r="2.4" fill="var(--paper)" />
      </svg>
      <span>LockIn</span>
    </>
  );

  if (to === null) {
    return <span className="brand">{content}</span>;
  }
  return (
    <Link to={to} className="brand" aria-label="LockIn home">
      {content}
    </Link>
  );
}
