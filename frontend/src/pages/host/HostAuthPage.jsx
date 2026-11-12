import React, { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { getAuthToken, registerHost, signIn } from '../../lib/api';
import { BackgroundTextEffect } from '../../components/BackgroundTextEffect';
import { LockInLogo } from '../../components/LockInLogo';
import { Icon } from '../../components/Icon';

const MIN_PASSWORD_LENGTH = 8;

const COPY = {
  login: {
    title: 'Sign in to host',
    lead: 'Your rooms and questions are saved to your account.',
    submit: 'Sign in',
    busy: 'Signing in...',
    switchText: 'New here?',
    switchLink: 'Create a host account',
    switchTo: '/host/register',
  },
  register: {
    title: 'Create a host account',
    lead: 'Use an email and password. Players never need an account.',
    submit: 'Create account',
    busy: 'Creating account...',
    switchText: 'Already have an account?',
    switchLink: 'Sign in',
    switchTo: '/host/login',
  },
};

export function HostAuthPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const mode = location.pathname.endsWith('/register') ? 'register' : 'login';
  const copy = COPY[mode];
  const returnTo = location.state?.from || '/host';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (getAuthToken() && !busy) {
    return <Navigate to={returnTo} replace />;
  }

  const validate = () => {
    if (!email.trim()) {
      return 'Enter your email address.';
    }
    if (mode === 'register' && password.length < MIN_PASSWORD_LENGTH) {
      return `Use a password of at least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    if (!password) {
      return 'Enter your password.';
    }
    return '';
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const authenticate = mode === 'register' ? registerHost : signIn;
      await authenticate(email.trim(), password);
      navigate(returnTo, { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="stage">
      <BackgroundTextEffect text="HOST" />
      <header className="topbar">
        <LockInLogo to="/join" />
        <Link to="/join" className="pill pill--white pill--small">
          Join as a player
        </Link>
      </header>

      <main className="dock">
        <section className="sheet" aria-labelledby="auth-title">
          <h1 id="auth-title" className="sheet__title">
            {copy.title}
          </h1>
          <p className="sheet__lead">{copy.lead}</p>

          {location.state?.expired && !error && (
            <div className="notice" role="status">
              <Icon name="alert" />
              <span>Your sign in has expired. Sign in again to continue.</span>
            </div>
          )}

          {error && (
            <div className="notice notice--error" role="alert">
              <Icon name="alert" />
              <span>{error}</span>
            </div>
          )}

          <form className="form" onSubmit={handleSubmit} noValidate>
            <div className="field">
              <label htmlFor="host-email" className="field__label">
                Email
              </label>
              <input
                id="host-email"
                type="email"
                className="input"
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={busy}
                required
              />
            </div>

            <div className="field">
              <label htmlFor="host-password" className="field__label">
                Password
              </label>
              <input
                id="host-password"
                type="password"
                className="input"
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
                required
                aria-describedby={mode === 'register' ? 'password-hint' : undefined}
              />
              {mode === 'register' && (
                <p id="password-hint" className="field__hint">
                  At least {MIN_PASSWORD_LENGTH} characters.
                </p>
              )}
            </div>

            <button type="submit" className="pill pill--solid pill--block" disabled={busy}>
              {busy ? (
                <>
                  <span className="spinner" aria-hidden="true" />
                  {copy.busy}
                </>
              ) : (
                copy.submit
              )}
            </button>
          </form>

          <p className="sheet__lead" style={{ marginTop: 20 }}>
            {copy.switchText}{' '}
            <Link className="text-link" to={copy.switchTo} state={location.state}>
              {copy.switchLink}
            </Link>
          </p>
        </section>
      </main>
    </div>
  );
}
