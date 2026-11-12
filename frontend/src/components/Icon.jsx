import React from 'react';

const PATHS = {
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  arrowLeft: <path d="M19 12H5m6-6l-6 6 6 6" />,
  arrowRight: <path d="M5 12h14m-6-6l6 6-6 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  upload: <path d="M12 16V4m-5 5l5-5 5 5M5 20h14" />,
  trash: <path d="M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  users: (
    <path d="M16 20v-1a4 4 0 00-4-4H7a4 4 0 00-4 4v1m18 0v-1a4 4 0 00-3-3.9M14 4.1a4 4 0 010 7.8M13.5 7.5a4 4 0 11-8 0 4 4 0 018 0z" />
  ),
  door: <path d="M14 4h4a2 2 0 012 2v12a2 2 0 01-2 2h-4M10 16l4-4-4-4m4 4H4" />,
  logout: <path d="M10 4H6a2 2 0 00-2 2v12a2 2 0 002 2h4m6-4l4-4-4-4m4 4H10" />,
  alert: <path d="M12 8v5m0 3.5v.5M10.3 3.9L2.5 17.5A2 2 0 004.2 20.5h15.6a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  file: <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5zm0 0v5h5M9 13h6M9 17h4" />,
};

/** Decorative stroke icon. Give the button or link around it a text label. */
export function Icon({ name, className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
