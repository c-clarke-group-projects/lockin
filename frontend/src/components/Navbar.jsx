import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getHostEmail, signOut } from '../lib/api';
import { Icon } from './Icon';
import { LockInLogo } from './LockInLogo';

const ITEM_DELAY_MS = 150;
const ITEM_STEP_MS = 60;

const ITEMS = [
  { label: 'Your rooms', to: '/host', icon: 'users' },
  { label: 'Join a room as a player', to: '/join', icon: 'door' },
];

/** Host top bar with a menu that slides in from the right. */
export function Navbar() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const menuButtonRef = useRef(null);
  const closeButtonRef = useRef(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      closeButtonRef.current?.focus();
    } else if (wasOpen.current) {
      menuButtonRef.current?.focus();
    }
    wasOpen.current = open;

    const onKey = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    if (open) {
      window.addEventListener('keydown', onKey);
    }
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const delay = (index) => ({ transitionDelay: open ? `${ITEM_DELAY_MS + index * ITEM_STEP_MS}ms` : '0ms' });

  const handleSignOut = () => {
    signOut();
    setOpen(false);
    navigate('/host/login');
  };

  return (
    <>
      <header className="topbar">
        <LockInLogo to="/host" />
        <button
          ref={menuButtonRef}
          type="button"
          className="pill pill--small menu-button"
          aria-label="Open menu"
          aria-expanded={open}
          aria-controls="host-menu"
          onClick={() => setOpen(true)}
        >
          <Icon name="menu" className="pill__icon" />
          <span className="menu-button__label">Menu</span>
        </button>
      </header>

      <div
        id="host-menu"
        className={`menu ${open ? 'menu--open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        aria-hidden={!open}
      >
        <button
          type="button"
          className="menu__backdrop"
          tabIndex={-1}
          aria-label="Close menu"
          onClick={() => setOpen(false)}
        />
        <nav className="menu__panel">
          <div className="menu__head">
            <LockInLogo to={null} />
            <button
              ref={closeButtonRef}
              type="button"
              className="icon-button menu__close"
              aria-label="Close menu"
              tabIndex={open ? 0 : -1}
              onClick={() => setOpen(false)}
            >
              <Icon name="close" />
            </button>
          </div>

          {getHostEmail() && <p className="menu__who">Signed in as {getHostEmail()}</p>}

          <ul className="menu__list">
            {ITEMS.map((item, index) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className="menu__item"
                  style={delay(index)}
                  tabIndex={open ? 0 : -1}
                  onClick={() => setOpen(false)}
                >
                  <Icon name={item.icon} />
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>

          <div className="menu__foot">
            <button
              type="button"
              className="pill pill--white pill--block"
              tabIndex={open ? 0 : -1}
              onClick={handleSignOut}
            >
              <Icon name="logout" className="pill__icon" />
              Sign out
            </button>
          </div>
        </nav>
      </div>
    </>
  );
}
