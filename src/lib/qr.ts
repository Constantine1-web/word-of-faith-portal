/**
 * Pure TypeScript ISO/IEC 18004 QR Code Generator (Versions 1-9, Error Correction Level M, Byte Mode).
 * Generates crisp, dependency-free SVG strings and module matrices on both server and client.
 */

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) {
    GF_EXP[i] = GF_EXP[i - 255];
  }
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function rsGeneratorPoly(ecCount: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < ecCount; i++) {
    const factor = new Uint8Array([1, GF_EXP[i]]);
    const next = new Uint8Array(poly.length + 1);
    for (let j = 0; j < poly.length; j++) {
      for (let k = 0; k < factor.length; k++) {
        next[j + k] ^= gfMul(poly[j], factor[k]);
      }
    }
    poly = next;
  }
  return poly;
}

function rsComputeEc(data: Uint8Array, ecCount: number): Uint8Array {
  const gen = rsGeneratorPoly(ecCount);
  const res = new Uint8Array(data.length + ecCount);
  res.set(data);
  for (let i = 0; i < data.length; i++) {
    const coef = res[i];
    if (coef !== 0) {
      for (let j = 0; j < gen.length; j++) {
        res[i + j] ^= gfMul(gen[j], coef);
      }
    }
  }
  return res.slice(data.length);
}

interface QrVersionSpec {
  version: number;
  maxBytes: number;
  ecPerBlock: number;
  blocks: Array<[count: number, dataCodewords: number]>;
  alignmentCenters: number[];
  remainderBits: number;
}

// ISO/IEC 18004 Level M (15% error correction), Versions 1..9
const QR_M_SPECS: QrVersionSpec[] = [
  { version: 1, maxBytes: 14, ecPerBlock: 10, blocks: [[1, 16]], alignmentCenters: [], remainderBits: 0 },
  { version: 2, maxBytes: 26, ecPerBlock: 16, blocks: [[1, 28]], alignmentCenters: [6, 18], remainderBits: 7 },
  { version: 3, maxBytes: 42, ecPerBlock: 26, blocks: [[1, 44]], alignmentCenters: [6, 22], remainderBits: 7 },
  { version: 4, maxBytes: 62, ecPerBlock: 18, blocks: [[2, 32]], alignmentCenters: [6, 26], remainderBits: 7 },
  { version: 5, maxBytes: 84, ecPerBlock: 24, blocks: [[2, 43]], alignmentCenters: [6, 30], remainderBits: 7 },
  { version: 6, maxBytes: 106, ecPerBlock: 16, blocks: [[4, 27]], alignmentCenters: [6, 34], remainderBits: 7 },
  { version: 7, maxBytes: 122, ecPerBlock: 18, blocks: [[4, 31]], alignmentCenters: [6, 22, 38], remainderBits: 0 },
  { version: 8, maxBytes: 152, ecPerBlock: 22, blocks: [[2, 38], [2, 39]], alignmentCenters: [6, 24, 42], remainderBits: 0 },
  { version: 9, maxBytes: 180, ecPerBlock: 22, blocks: [[3, 36], [2, 37]], alignmentCenters: [6, 26, 46], remainderBits: 0 },
];

function computeFormatBits(maskId: number): number {
  // EC Level M = 0b00
  const data = (0b00 << 3) | (maskId & 0x7);
  let rem = data << 10;
  const gen = 0b10100110111;
  for (let i = 14; i >= 10; i--) {
    if ((rem >> i) & 1) {
      rem ^= gen << (i - 10);
    }
  }
  return ((data << 10) | rem) ^ 0b101010000010010;
}

function computeVersionBits(version: number): number {
  let rem = version << 12;
  const gen = 0b1111100100101;
  for (let i = 17; i >= 12; i--) {
    if ((rem >> i) & 1) {
      rem ^= gen << (i - 12);
    }
  }
  return (version << 12) | rem;
}

function buildBitStream(bytes: Uint8Array, totalDataCodewords: number): Uint8Array {
  const bits: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) {
      bits.push((val >> i) & 1);
    }
  };

  // Mode: Byte (0100), Character count (8 bits for V1..V9)
  pushBits(0b0100, 4);
  pushBits(bytes.length, 8);
  for (const b of bytes) {
    pushBits(b, 8);
  }

  const maxBits = totalDataCodewords * 8;
  const terminatorLen = Math.min(4, maxBits - bits.length);
  for (let i = 0; i < terminatorLen; i++) bits.push(0);

  while (bits.length % 8 !== 0) bits.push(0);

  const codewords = new Uint8Array(totalDataCodewords);
  let cwIndex = 0;
  for (let i = 0; i < bits.length; i += 8) {
    let val = 0;
    for (let j = 0; j < 8; j++) {
      val = (val << 1) | bits[i + j];
    }
    codewords[cwIndex++] = val;
  }

  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (cwIndex < totalDataCodewords) {
    codewords[cwIndex++] = padBytes[padIdx % 2];
    padIdx++;
  }

  return codewords;
}

function interleaveBlocks(dataCodewords: Uint8Array, spec: QrVersionSpec): Uint8Array {
  const dataBlocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];
  let offset = 0;

  for (const [count, len] of spec.blocks) {
    for (let b = 0; b < count; b++) {
      const slice = dataCodewords.slice(offset, offset + len);
      offset += len;
      dataBlocks.push(slice);
      ecBlocks.push(rsComputeEc(slice, spec.ecPerBlock));
    }
  }

  const maxDataLen = Math.max(...dataBlocks.map((b) => b.length));
  const out: number[] = [];

  for (let i = 0; i < maxDataLen; i++) {
    for (const blk of dataBlocks) {
      if (i < blk.length) out.push(blk[i]);
    }
  }
  for (let i = 0; i < spec.ecPerBlock; i++) {
    for (const blk of ecBlocks) {
      out.push(blk[i]);
    }
  }

  return new Uint8Array(out);
}

function createEmptyGrid(size: number) {
  return {
    modules: Array.from({ length: size }, () => new Uint8Array(size)),
    isFunc: Array.from({ length: size }, () => new Uint8Array(size)),
  };
}

function setFunc(
  modules: Uint8Array[],
  isFunc: Uint8Array[],
  r: number,
  c: number,
  dark: boolean
) {
  modules[r][c] = dark ? 1 : 0;
  isFunc[r][c] = 1;
}

function placeFinderAndSeparators(modules: Uint8Array[], isFunc: Uint8Array[], size: number) {
  const corners: Array<[number, number]> = [
    [0, 0],
    [0, size - 7],
    [size - 7, 0],
  ];

  for (const [top, left] of corners) {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const r = top + dr;
        const c = left + dc;
        if (r < 0 || r >= size || c < 0 || c >= size) continue;
        const inOuter = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
        let dark = false;
        if (inOuter) {
          const dist = Math.max(Math.abs(dr - 3), Math.abs(dc - 3));
          dark = dist !== 2;
        }
        setFunc(modules, isFunc, r, c, dark);
      }
    }
  }
}

function placeTimingAndAlignment(
  modules: Uint8Array[],
  isFunc: Uint8Array[],
  size: number,
  alignmentCenters: number[]
) {
  for (let i = 8; i < size - 8; i++) {
    const dark = i % 2 === 0;
    if (!isFunc[6][i]) setFunc(modules, isFunc, 6, i, dark);
    if (!isFunc[i][6]) setFunc(modules, isFunc, i, 6, dark);
  }

  // Dark module mandated by ISO 18004
  setFunc(modules, isFunc, size - 8, 8, true);

  for (let i = 0; i < alignmentCenters.length; i++) {
    for (let j = 0; j < alignmentCenters.length; j++) {
      const last = alignmentCenters.length - 1;
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) {
        continue;
      }
      const cr = alignmentCenters[i];
      const cc = alignmentCenters[j];
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const dist = Math.max(Math.abs(dr), Math.abs(dc));
          setFunc(modules, isFunc, cr + dr, cc + dc, dist !== 1);
        }
      }
    }
  }
}

function reserveFormatAndVersion(
  modules: Uint8Array[],
  isFunc: Uint8Array[],
  size: number,
  version: number
) {
  for (let i = 0; i < 9; i++) {
    if (i !== 6) {
      setFunc(modules, isFunc, 8, i, false);
      setFunc(modules, isFunc, i, 8, false);
    }
  }
  for (let i = 0; i < 8; i++) {
    setFunc(modules, isFunc, 8, size - 1 - i, false);
    if (i < 7) {
      setFunc(modules, isFunc, size - 1 - i, 8, false);
    }
  }

  if (version >= 7) {
    const verBits = computeVersionBits(version);
    for (let i = 0; i < 18; i++) {
      const dark = ((verBits >> i) & 1) === 1;
      const a = Math.floor(i / 3);
      const b = size - 11 + (i % 3);
      setFunc(modules, isFunc, a, b, dark);
      setFunc(modules, isFunc, b, a, dark);
    }
  }
}

function applyFormatBits(modules: Uint8Array[], size: number, maskId: number) {
  const fmt = computeFormatBits(maskId);

  // Copy 1 (top-left finder perimeter): MSB (bit 14) at (8,0) down to LSB (bit 0) at (0,8)
  for (let i = 0; i <= 5; i++) {
    modules[8][i] = ((fmt >> (14 - i)) & 1) === 1 ? 1 : 0;
  }
  modules[8][7] = ((fmt >> 8) & 1) === 1 ? 1 : 0;
  modules[8][8] = ((fmt >> 7) & 1) === 1 ? 1 : 0;
  modules[7][8] = ((fmt >> 6) & 1) === 1 ? 1 : 0;
  for (let i = 0; i < 6; i++) {
    modules[5 - i][8] = ((fmt >> (5 - i)) & 1) === 1 ? 1 : 0;
  }

  // Copy 2: bits 14..8 bottom-left col 8 (bottom-up), bits 7..0 top-right row 8 (left-to-right)
  for (let i = 0; i < 7; i++) {
    modules[size - 1 - i][8] = ((fmt >> (14 - i)) & 1) === 1 ? 1 : 0;
  }
  for (let i = 0; i < 8; i++) {
    modules[8][size - 8 + i] = ((fmt >> (7 - i)) & 1) === 1 ? 1 : 0;
  }
}

function maskCondition(maskId: number, r: number, c: number): boolean {
  switch (maskId) {
    case 0: return (r + c) % 2 === 0;
    case 1: return r % 2 === 0;
    case 2: return c % 3 === 0;
    case 3: return (r + c) % 3 === 0;
    case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
    case 5: return ((r * c) % 2) + ((r * c) % 3) === 0;
    case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
    default: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
  }
}

function scoreMaskPenalty(modules: Uint8Array[], size: number): number {
  let penalty = 0;

  // Rule 1: 5+ consecutive same-color modules horizontally & vertically
  for (let r = 0; r < size; r++) {
    let runColor = modules[r][0];
    let runLen = 1;
    for (let c = 1; c < size; c++) {
      if (modules[r][c] === runColor) {
        runLen++;
      } else {
        if (runLen >= 5) penalty += 3 + (runLen - 5);
        runColor = modules[r][c];
        runLen = 1;
      }
    }
    if (runLen >= 5) penalty += 3 + (runLen - 5);
  }
  for (let c = 0; c < size; c++) {
    let runColor = modules[0][c];
    let runLen = 1;
    for (let r = 1; r < size; r++) {
      if (modules[r][c] === runColor) {
        runLen++;
      } else {
        if (runLen >= 5) penalty += 3 + (runLen - 5);
        runColor = modules[r][c];
        runLen = 1;
      }
    }
    if (runLen >= 5) penalty += 3 + (runLen - 5);
  }

  // Rule 2: 2x2 same-color blocks
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const color = modules[r][c];
      if (
        modules[r][c + 1] === color &&
        modules[r + 1][c] === color &&
        modules[r + 1][c + 1] === color
      ) {
        penalty += 3;
      }
    }
  }

  // Rule 4: dark ratio deviation from 50%
  let darkCount = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (modules[r][c]) darkCount++;
    }
  }
  const percent = (darkCount * 100) / (size * size);
  const k = Math.floor(Math.abs(percent - 50) / 5);
  penalty += k * 10;

  return penalty;
}

export function encodeQrMatrix(text: string): { size: number; modules: boolean[][] } {
  const utf8Bytes = new TextEncoder().encode(text);
  const spec =
    QR_M_SPECS.find((s) => utf8Bytes.length <= s.maxBytes) ||
    QR_M_SPECS[QR_M_SPECS.length - 1];

  const payload =
    utf8Bytes.length <= spec.maxBytes ? utf8Bytes : utf8Bytes.slice(0, spec.maxBytes);
  const totalDataCodewords = spec.blocks.reduce((acc, [cnt, len]) => acc + cnt * len, 0);
  const dataCodewords = buildBitStream(payload, totalDataCodewords);
  const finalStream = interleaveBlocks(dataCodewords, spec);

  const size = spec.version * 4 + 17;
  const { modules: baseModules, isFunc } = createEmptyGrid(size);
  placeFinderAndSeparators(baseModules, isFunc, size);
  placeTimingAndAlignment(baseModules, isFunc, size, spec.alignmentCenters);
  reserveFormatAndVersion(baseModules, isFunc, size, spec.version);

  // Place data bits in upward/downward zigzag columns
  let bitIdx = 0;
  const totalBits = finalStream.length * 8 + spec.remainderBits;
  let upward = true;

  for (let rightCol = size - 1; rightCol >= 1; rightCol -= 2) {
    if (rightCol === 6) rightCol = 5;
    for (let step = 0; step < size; step++) {
      const r = upward ? size - 1 - step : step;
      for (let dc = 0; dc < 2; dc++) {
        const c = rightCol - dc;
        if (isFunc[r][c]) continue;
        let dark = false;
        if (bitIdx < finalStream.length * 8) {
          const byteVal = finalStream[bitIdx >> 3];
          dark = ((byteVal >> (7 - (bitIdx & 7))) & 1) === 1;
        } else if (bitIdx < totalBits) {
          dark = false;
        }
        baseModules[r][c] = dark ? 1 : 0;
        bitIdx++;
      }
    }
    upward = !upward;
  }

  let bestMask = 0;
  let bestPenalty = Infinity;
  let bestModules = baseModules;

  for (let maskId = 0; maskId < 8; maskId++) {
    const candidate = baseModules.map((row) => new Uint8Array(row));
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (!isFunc[r][c] && maskCondition(maskId, r, c)) {
          candidate[r][c] ^= 1;
        }
      }
    }
    applyFormatBits(candidate, size, maskId);
    const penalty = scoreMaskPenalty(candidate, size);
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      bestMask = maskId;
      bestModules = candidate;
    }
  }

  void bestMask;

  return {
    size,
    modules: bestModules.map((row) => Array.from(row, (v) => v === 1)),
  };
}

/**
 * Renders a compact, scannable crisp SVG QR Code (single <path> for dark modules) with quiet zone.
 */
export function generateQrSvgMarkup(
  text: string,
  options?: { fgColor?: string; bgColor?: string; quietZone?: number }
): { viewBoxSize: number; pathD: string; fgColor: string; bgColor: string } {
  const { size, modules } = encodeQrMatrix(text);
  const quiet = options?.quietZone ?? 2;
  const viewBoxSize = size + quiet * 2;
  const parts: string[] = [];

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (modules[r][c]) {
        parts.push(`M${c + quiet},${r + quiet}h1v1h-1z`);
      }
    }
  }

  return {
    viewBoxSize,
    pathD: parts.join(""),
    fgColor: options?.fgColor ?? "#0A2540",
    bgColor: options?.bgColor ?? "#FFFFFF",
  };
}
