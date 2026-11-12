import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * Turns an ApiError into text for the page. An expired login sends the host back
 * to sign in and returns to this page afterwards.
 */
export function useHostErrors() {
  const navigate = useNavigate();
  const location = useLocation();

  return useCallback(
    (error) => {
      if (error?.status === 401) {
        navigate('/host/login', { replace: true, state: { from: location.pathname, expired: true } });
        return '';
      }
      return error?.message || 'Something went wrong. Try again.';
    },
    [navigate, location.pathname]
  );
}
