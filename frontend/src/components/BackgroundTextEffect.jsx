import React, { useLayoutEffect, useRef, useState } from 'react';

const FILL_SHARE = 0.92;
const MAX_STRETCH = 6;
const WIDTH_BUDGET_VW = 150;
const MAX_SIZE_VW = 48;

/**
 * Giant white type behind a page, stretched to the height of the screen and
 * faded out at the bottom. Purely decorative, so it is hidden from screen readers.
 */
export function BackgroundTextEffect({ text }) {
  const textRef = useRef(null);
  const [stretch, setStretch] = useState(1);
  const sizeVw = Math.min(MAX_SIZE_VW, WIDTH_BUDGET_VW / Math.max(String(text).length, 1));

  useLayoutEffect(() => {
    const element = textRef.current;
    const frame = element?.closest('.bigtype');
    if (!element || !frame) {
      return undefined;
    }

    const measure = () => {
      const textHeight = element.offsetHeight;
      if (textHeight > 0) {
        setStretch(Math.min((frame.clientHeight * FILL_SHARE) / textHeight, MAX_STRETCH));
      }
    };

    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [text]);

  return (
    <div className="bigtype" aria-hidden="true">
      <div className="bigtype__rise">
        <span
          ref={textRef}
          className="bigtype__text"
          style={{
            fontSize: `clamp(64px, ${sizeVw}vw, 800px)`,
            transform: `scale(1.15, ${stretch})`,
          }}
        >
          {text}
        </span>
      </div>
    </div>
  );
}
