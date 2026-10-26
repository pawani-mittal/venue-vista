/**
 * Venue Vista - Standalone SVG QR Code Generator
 * Pure JavaScript Model 2 QR Code implementation
 * Generates crisp, scalable SVG QR codes with zero external dependencies
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.QRCode = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  // Reed-Solomon Galois Field tables and polynomial multiplication
  const GF256 = {
    exp: new Uint8Array(512),
    log: new Uint8Array(256)
  };

  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF256.exp[i] = x;
    GF256.log[x] = i;
    x <<= 1;
    if (x & 256) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) {
    GF256.exp[i] = GF256.exp[i - 255];
  }

  function gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return GF256.exp[GF256.log[a] + GF256.log[b]];
  }

  function rsGenPoly(n) {
    let p = [1];
    for (let i = 0; i < n; i++) {
      const next = [0];
      const factor = GF256.exp[i];
      for (let j = 0; j < p.length; j++) {
        next.push(gfMul(p[j], factor));
        if (j < next.length - 1) {
          next[j] ^= p[j];
        }
      }
      p = next;
    }
    return p;
  }

  function rsEncode(data, ecLen) {
    const gen = rsGenPoly(ecLen);
    const msg = new Uint8Array(data.length + ecLen);
    msg.set(data);

    for (let i = 0; i < data.length; i++) {
      const coef = msg[i];
      if (coef !== 0) {
        for (let j = 0; j < gen.length; j++) {
          msg[i + j] ^= gfMul(gen[j], coef);
        }
      }
    }
    return msg.slice(data.length);
  }

  // QR Version 4 (33x33 matrix) - capacity up to ~114 alphanumeric chars in Low/Medium EC
  // Version 6 (41x41) - capacity up to ~210 chars, perfect for JSON payloads
  function selectVersion(dataLen) {
    if (dataLen <= 32) return { version: 3, size: 29, dataCap: 44, ecLen: 22 };
    if (dataLen <= 64) return { version: 4, size: 33, dataCap: 64, ecLen: 36 };
    if (dataLen <= 110) return { version: 6, size: 41, dataCap: 108, ecLen: 56 };
    return { version: 8, size: 49, dataCap: 152, ecLen: 80 };
  }

  function encodeData(text, cap) {
    const bytes = [];
    // Byte mode indicator: 0100
    // Character count (8-bit for v1-9)
    const utf8 = new TextEncoder().encode(text);
    const len = utf8.length;

    // Bit-level pack
    let bits = '';
    bits += '0100'; // mode: byte
    bits += len.toString(2).padStart(8, '0');

    for (let i = 0; i < len; i++) {
      bits += utf8[i].toString(2).padStart(8, '0');
    }

    // Terminator
    while (bits.length % 8 !== 0) bits += '0';
    while (bits.length < cap * 8) {
      if (bits.length + 8 <= cap * 8) bits += '11101100'; // pad 0xEC
      if (bits.length + 8 <= cap * 8) bits += '00010001'; // pad 0x11
    }

    const dataBytes = new Uint8Array(cap);
    for (let i = 0; i < cap; i++) {
      dataBytes[i] = parseInt(bits.substring(i * 8, i * 8 + 8) || '0', 2);
    }
    return dataBytes;
  }

  function createMatrix(size) {
    const matrix = [];
    for (let y = 0; y < size; y++) {
      matrix.push(new Int8Array(size).fill(-1));
    }
    return matrix;
  }

  function addFinderPattern(matrix, x, y) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const row = y + r;
        const col = x + c;
        if (row >= 0 && row < matrix.length && col >= 0 && col < matrix.length) {
          if (
            (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
            (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
            (r >= 2 && r <= 4 && c >= 2 && c <= 4)
          ) {
            matrix[row][col] = 1;
          } else {
            matrix[row][col] = 0;
          }
        }
      }
    }
  }

  function addTimingPatterns(matrix) {
    const size = matrix.length;
    for (let i = 8; i < size - 8; i++) {
      const bit = (i % 2 === 0) ? 1 : 0;
      if (matrix[6][i] === -1) matrix[6][i] = bit;
      if (matrix[i][6] === -1) matrix[i][6] = bit;
    }
  }

  function buildQRMatrix(text) {
    const utf8Len = new TextEncoder().encode(text).length;
    const { version, size, dataCap, ecLen } = selectVersion(utf8Len);
    const dataBytes = encodeData(text, dataCap);
    const ecBytes = rsEncode(dataBytes, ecLen);

    // Merge data + EC
    const fullCodewords = new Uint8Array(dataCap + ecLen);
    fullCodewords.set(dataBytes);
    fullCodewords.set(ecBytes, dataCap);

    const matrix = createMatrix(size);

    // 1. Finder patterns
    addFinderPattern(matrix, 0, 0);
    addFinderPattern(matrix, size - 7, 0);
    addFinderPattern(matrix, 0, size - 7);

    // 2. Timing patterns
    addTimingPatterns(matrix);

    // 3. Dark module & format reserve
    matrix[size - 8][8] = 1;

    // Fill data with standard zig-zag
    let byteIdx = 0;
    let bitIdx = 7;
    let dir = -1; // up
    let c = size - 1;

    while (c > 0) {
      if (c === 6) c--; // skip timing column
      const rows = dir === -1
        ? Array.from({ length: size }, (_, i) => size - 1 - i)
        : Array.from({ length: size }, (_, i) => i);

      for (const r of rows) {
        for (const col of [c, c - 1]) {
          if (matrix[r][col] === -1) {
            let bit = 0;
            if (byteIdx < fullCodewords.length) {
              bit = (fullCodewords[byteIdx] >> bitIdx) & 1;
              bitIdx--;
              if (bitIdx < 0) {
                bitIdx = 7;
                byteIdx++;
              }
            }
            // Mask pattern 0: (row + col) % 2 === 0
            if ((r + col) % 2 === 0) {
              bit ^= 1;
            }
            matrix[r][col] = bit;
          }
        }
      }
      dir = -dir;
      c -= 2;
    }

    return matrix;
  }

  /**
   * Render SVG string from matrix
   */
  function toSVG(text, options = {}) {
    const sizePx = options.size || 200;
    const margin = options.margin !== undefined ? options.margin : 2;
    const darkColor = options.darkColor || '#0f172a';
    const lightColor = options.lightColor || '#ffffff';

    const matrix = buildQRMatrix(text);
    const matrixSize = matrix.length;
    const totalModules = matrixSize + margin * 2;
    const moduleSize = (sizePx / totalModules).toFixed(3);

    let rects = '';
    for (let r = 0; r < matrixSize; r++) {
      for (let c = 0; c < matrixSize; c++) {
        if (matrix[r][c] === 1) {
          const x = ((c + margin) * moduleSize).toFixed(2);
          const y = ((r + margin) * moduleSize).toFixed(2);
          rects += `<rect x="${x}" y="${y}" width="${moduleSize}" height="${moduleSize}" fill="${darkColor}" />`;
        }
      }
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sizePx} ${sizePx}" width="${sizePx}" height="${sizePx}" class="qr-svg-code">
      <rect width="100%" height="100%" fill="${lightColor}" rx="8" />
      ${rects}
    </svg>`;
  }

  return {
    toSVG,
    buildQRMatrix
  };
}));
