import { describe, it, expect } from 'vitest';
import { generateQRMatrix, renderQRSvgPath } from '../src/lib/qrcode';

describe('QR Code Generator (Pure JS ISO/IEC 18004)', () => {
  it('generates a valid QR matrix for a participant join URL', () => {
    const url = 'http://localhost:5173/join/012345';
    const matrix = generateQRMatrix(url);

    expect(Array.isArray(matrix)).toBe(true);
    const size = matrix.length;
    expect(size).toBeGreaterThanOrEqual(21); // At least Version 1 (21x21)
    expect(matrix[0].length).toBe(size);

    // Verify finder pattern corners are black
    expect(matrix[0][0]).toBe(true);
    expect(matrix[0][6]).toBe(true);
    expect(matrix[6][0]).toBe(true);
    expect(matrix[0][size - 1]).toBe(true);
    expect(matrix[0][size - 7]).toBe(true);
    expect(matrix[size - 1][0]).toBe(true);
    expect(matrix[size - 7][0]).toBe(true);
  });

  it('renders SVG path string from matrix', () => {
    const url = 'http://localhost:5173/join/001234';
    const matrix = generateQRMatrix(url);
    const { path, size } = renderQRSvgPath(matrix);

    expect(size).toBe(matrix.length);
    expect(typeof path).toBe('string');
    expect(path).toContain('M');
    expect(path).toContain('h1v1h-1z');
  });
});

