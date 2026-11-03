/**
 * Lightweight, self-contained QR Code generator in pure JavaScript.
 * Implements ISO/IEC 18004 QR Code Model 2 in Byte Mode.
 * Zero external dependencies.
 */

// Galois Field GF(256) with primitive polynomial 0x11d
const GF256_EXP = new Uint8Array(512);
const GF256_LOG = new Uint8Array(256);

(function initGF() {
  let val = 1;
  for (let i = 0; i < 255; i++) {
    GF256_EXP[i] = val;
    GF256_EXP[i + 255] = val;
    GF256_LOG[val] = i;
    val = (val << 1) ^ (val & 128 ? 0x11d : 0);
  }
})();

function gfMul(x, y) {
  if (x === 0 || y === 0) return 0;
  return GF256_EXP[GF256_LOG[x] + GF256_LOG[y]];
}

function rsGenPoly(n) {
  let poly = [1];
  for (let i = 0; i < n; i++) {
    const next = [0];
    const factor = GF256_EXP[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] = next[j] ^ gfMul(poly[j], factor);
      next.push(poly[j]);
    }
    poly = next;
  }
  return poly;
}

function rsCompute(data, numEc) {
  const gen = rsGenPoly(numEc);
  const res = new Uint8Array(numEc);
  for (let i = 0; i < data.length; i++) {
    const coef = data[i] ^ res[0];
    res.copyWithin(0, 1);
    res[numEc - 1] = 0;
    for (let j = 0; j < numEc; j++) {
      res[j] ^= gfMul(gen[j], coef);
    }
  }
  return res;
}

// Version table for Byte mode with EC level L (Version 1 to 5)
// [version, totalCodewords, dataCodewords, ecCodewordsPerBlock, numBlocks, alignmentPos]
const VERSION_INFO = [
  null,
  { v: 1, total: 26, data: 19, ec: 7, blocks: 1, align: [] },
  { v: 2, total: 44, data: 34, ec: 10, blocks: 1, align: [6, 18] },
  { v: 3, total: 70, data: 55, ec: 15, blocks: 1, align: [6, 22] },
  { v: 4, total: 100, data: 80, ec: 20, blocks: 1, align: [6, 26] },
  { v: 5, total: 134, data: 108, ec: 26, blocks: 1, align: [6, 30] },
];

/**
 * Encodes text into a 2D boolean array representing QR modules.
 * @param {string} text - text to encode (e.g. join URL)
 * @returns {boolean[][]} 2D array of true (black) / false (white)
 */
export function generateQRMatrix(text) {
  const bytes = new TextEncoder().encode(text);
  const len = bytes.length;

  let info = null;
  for (let i = 1; i < VERSION_INFO.length; i++) {
    if (len <= VERSION_INFO[i].data - 2) {
      info = VERSION_INFO[i];
      break;
    }
  }
  if (!info) {
    info = VERSION_INFO[5]; // fallback up to Version 5 capacity
  }

  // 1. Bit buffer construction (Byte mode: 0100 + 8-bit length + data)
  const bitBuf = [];
  function pushBits(val, count) {
    for (let i = count - 1; i >= 0; i--) {
      bitBuf.push((val >> i) & 1);
    }
  }

  pushBits(0b0100, 4); // Byte mode indicator
  pushBits(len, 8); // Character count indicator (8 bits for V1-9)
  for (let i = 0; i < len; i++) {
    pushBits(bytes[i], 8);
  }

  // Terminator (up to 4 zeroes)
  const maxBits = info.data * 8;
  const termLen = Math.min(4, maxBits - bitBuf.length);
  pushBits(0, termLen);

  // Pad to byte boundary
  while (bitBuf.length % 8 !== 0) {
    bitBuf.push(0);
  }

  // Convert bits to data bytes
  const dataBytes = new Uint8Array(info.data);
  for (let i = 0; i < bitBuf.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) {
      b = (b << 1) | bitBuf[i + j];
    }
    dataBytes[i / 8] = b;
  }

  // Pad bytes (0xEC, 0x11)
  let padIdx = bitBuf.length / 8;
  let padToggle = true;
  while (padIdx < info.data) {
    dataBytes[padIdx++] = padToggle ? 0xec : 0x11;
    padToggle = !padToggle;
  }

  // 2. Reed-Solomon Error Correction Codewords
  const ecBytes = rsCompute(dataBytes, info.ec);

  // Final codeword sequence
  const allCodewords = new Uint8Array(info.total);
  allCodewords.set(dataBytes, 0);
  allCodewords.set(ecBytes, dataBytes.length);

  // 3. Matrix placement
  const size = info.v * 4 + 17;
  const matrix = Array.from({ length: size }, () => Array(size).fill(null));

  function setModule(r, c, val) {
    if (r >= 0 && r < size && c >= 0 && c < size) {
      matrix[r][c] = val;
    }
  }

  // Finder pattern (7x7) with separator
  function placeFinder(row, col) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const qr = row + r;
        const qc = col + c;
        if (qr < 0 || qr >= size || qc < 0 || qc >= size) continue;
        if (r === -1 || r === 7 || c === -1 || c === 7) {
          matrix[qr][qc] = false;
        } else if (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)) {
          matrix[qr][qc] = true;
        } else {
          matrix[qr][qc] = false;
        }
      }
    }
  }

  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  // Alignment pattern (5x5) if present
  if (info.align.length > 0) {
    for (const ar of info.align) {
      for (const ac of info.align) {
        if (matrix[ar][ac] !== null) continue; // skip if overlaps finder
        for (let r = -2; r <= 2; r++) {
          for (let c = -2; c <= 2; c++) {
            const isBorder = Math.abs(r) === 2 || Math.abs(c) === 2;
            const isCenter = r === 0 && c === 0;
            matrix[ar + r][ac + c] = isBorder || isCenter;
          }
        }
      }
    }
  }

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    if (matrix[6][i] === null) matrix[6][i] = i % 2 === 0;
    if (matrix[i][6] === null) matrix[i][6] = i % 2 === 0;
  }

  // Dark module
  matrix[size - 8][8] = true;

  // Format info dummy reserve
  for (let i = 0; i < 9; i++) {
    if (matrix[8][i] === null) matrix[8][i] = false;
    if (matrix[i][8] === null) matrix[i][8] = false;
  }
  for (let i = 0; i < 8; i++) {
    if (matrix[8][size - 1 - i] === null) matrix[8][size - 1 - i] = false;
    if (matrix[size - 1 - i][8] === null) matrix[size - 1 - i][8] = false;
  }

  // 4. Place Data Codewords (zigzag)
  let dir = -1; // upwards
  let c = size - 1;
  let r = size - 1;
  let byteIndex = 0;
  let bitIndex = 7;

  while (c > 0) {
    if (c === 6) c--; // Skip vertical timing pattern column

    for (let i = 0; i < size; i++) {
      const curRow = dir === -1 ? r - i : r + i;
      for (let colOffset = 0; colOffset < 2; colOffset++) {
        const curCol = c - colOffset;
        if (matrix[curRow][curCol] === null) {
          let bit = false;
          if (byteIndex < allCodewords.length) {
            bit = ((allCodewords[byteIndex] >> bitIndex) & 1) === 1;
            bitIndex--;
            if (bitIndex < 0) {
              bitIndex = 7;
              byteIndex++;
            }
          }
          // Apply mask 0: (row + col) % 2 === 0
          const mask = (curRow + curCol) % 2 === 0;
          matrix[curRow][curCol] = bit ^ mask;
        }
      }
    }

    dir = -dir;
    r = dir === -1 ? size - 1 : 0;
    c -= 2;
  }

  // 5. Format info for EC Level L, Mask 0: 0x77c4 (0b111011111000100)
  const formatBits = 0x77c4;
  for (let i = 0; i < 15; i++) {
    const bit = ((formatBits >> (14 - i)) & 1) === 1;
    // Around top-left finder
    if (i <= 5) matrix[8][i] = bit;
    else if (i === 6) matrix[8][7] = bit;
    else if (i === 7) matrix[8][8] = bit;
    else if (i === 8) matrix[7][8] = bit;
    else matrix[14 - i][8] = bit;

    // Around top-right and bottom-left
    if (i < 8) matrix[size - 1 - i][8] = bit;
    else matrix[8][size - 15 + i] = bit;
  }

  return matrix;
}

/**
 * Returns an SVG path string or rect elements for the QR code modules.
 */
export function renderQRSvgPath(matrix) {
  const size = matrix.length;
  let path = '';
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (matrix[r][c]) {
        path += `M${c},${r}h1v1h-1z `;
      }
    }
  }
  return { path, size };
}
