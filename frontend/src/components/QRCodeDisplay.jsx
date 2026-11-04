import React, { useMemo } from 'react';
import { generateQRMatrix, renderQRSvgPath } from '../lib/qrcode';

/**
 * QR Code Display Component.
 * If backend Base64 QR code image is provided (SCRUM-40), renders it directly.
 * If not provided (e.g. direct route access), generates a real, scannable SVG QR code
 * containing the exact join URL using pure JavaScript ISO/IEC 18004 QR generation.
 */
export function QRCodeDisplay({ qrCode, joinUrl, roomCode }) {
  const qrSvg = useMemo(() => {
    if (qrCode || !joinUrl) return null;
    try {
      const matrix = generateQRMatrix(joinUrl);
      return renderQRSvgPath(matrix);
    } catch (e) {
      return null;
    }
  }, [qrCode, joinUrl]);

  if (qrCode) {
    return (
      <div className="big-screen-qr-wrapper">
        <img
          src={qrCode}
          alt={`Scan QR code to join room ${roomCode}`}
          className="big-screen-qr-img"
        />
        <p className="big-screen-qr-hint">Scan with your phone camera to join</p>
      </div>
    );
  }

  const border = 4;
  const viewBoxSize = qrSvg ? qrSvg.size + border * 2 : 100;

  return (
    <div className="big-screen-qr-wrapper">
      <div className="big-screen-qr-placeholder" aria-label="QR Code">
        {qrSvg ? (
          <svg
            viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
            className="big-screen-qr-svg"
            role="img"
            aria-label={`Real QR code for ${joinUrl}`}
            shapeRendering="crispEdges"
          >
            <rect width={viewBoxSize} height={viewBoxSize} fill="#ffffff" />
            <g transform={`translate(${border}, ${border})`}>
              <path d={qrSvg.path} fill="#0f172a" />
            </g>
          </svg>
        ) : (
          <p className="big-screen-qr-hint">Join link: {joinUrl}</p>
        )}
      </div>
      <p className="big-screen-qr-hint">Scan with your phone camera to join</p>
    </div>
  );
}

export default QRCodeDisplay;
