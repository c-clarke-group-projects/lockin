import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { getAuthToken } from '../lib/api';

/** Shows host pages only to a signed in host. The server still checks every request. */
export function RequireHost({ children }) {
  const location = useLocation();
  if (!getAuthToken()) {
    return <Navigate to="/host/login" replace state={{ from: location.pathname }} />;
  }
  return children;
}
