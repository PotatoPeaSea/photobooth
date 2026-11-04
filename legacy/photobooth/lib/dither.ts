/** Dithering algorithms — preview matches print output. */

export type DitherId =
  | "floydSteinberg"
  | "atkinson"
  | "bayer4"
  | "bayer8"
  | "burkes"
  | "sierra"
  | "stucki"
  | "jarvis"
  | "threshold"
  | "halftone";

export interface DitherPattern {
  id: DitherId;
  label: string;
  description: string;
}

export const DITHER_PATTERNS: DitherPattern[] = [
  {
    id: "floydSteinberg",
    label: "Floyd–Steinberg",
    description: "Soft, classic error diffusion",
  },
  {
    id: "atkinson",
    label: "Atkinson",
    description: "Light, punchy (Mac classic)",
  },
  {
    id: "bayer4",
    label: "Bayer 4×4",
    description: "Fine ordered crosshatch",
  },
  {
    id: "bayer8",
    label: "Bayer 8×8",
    description: "Coarser ordered screen",
  },
  {
    id: "burkes",
    label: "Burkes",
    description: "Wide, smooth diffusion",
  },
  {
    id: "sierra",
    label: "Sierra",
    description: "Balanced grain",
  },
  {
    id: "stucki",
    label: "Stucki",
    description: "Very smooth tones",
  },
  {
    id: "jarvis",
    label: "Jarvis",
    description: "Detailed, newspaper-like",
  },
  {
    id: "threshold",
    label: "Threshold",
    description: "Flat, no dithering",
  },
  {
    id: "halftone",
    label: "Halftone",
    description: "Dot-screen pattern",
  },
];

const BAYER_4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

const BAYER_8 = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
];

type Kernel = readonly { dx: number; dy: number; w: number }[];

function spreadError(
  buf: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number,
  err: number,
  kernel: Kernel,
  divisor: number
): void {
  for (const { dx, dy, w } of kernel) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
      buf[ny * width + nx]! += (err * w) / divisor;
    }
  }
}

function errorDiffusion(
  gray: Float32Array,
  width: number,
  height: number,
  kernel: Kernel,
  divisor: number,
  attenuate = 1
): Uint8Array {
  const buf = new Float32Array(gray);
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const old = buf[i]!;
      const bit = old < 128 ? 1 : 0;
      out[i] = bit;
      const err = (old - (bit ? 0 : 255)) * attenuate;
      spreadError(buf, width, height, x, y, err, kernel, divisor);
    }
  }
  return out;
}

const FLOYD: Kernel = [
  { dx: 1, dy: 0, w: 7 },
  { dx: -1, dy: 1, w: 3 },
  { dx: 0, dy: 1, w: 5 },
  { dx: 1, dy: 1, w: 1 },
];

const ATKINSON: Kernel = [
  { dx: 1, dy: 0, w: 1 },
  { dx: 2, dy: 0, w: 1 },
  { dx: -1, dy: 1, w: 1 },
  { dx: 0, dy: 1, w: 1 },
  { dx: 1, dy: 1, w: 1 },
  { dx: 0, dy: 2, w: 1 },
];

const BURKES: Kernel = [
  { dx: 1, dy: 0, w: 8 },
  { dx: 2, dy: 0, w: 4 },
  { dx: -2, dy: 1, w: 2 },
  { dx: -1, dy: 1, w: 4 },
  { dx: 0, dy: 1, w: 8 },
  { dx: 1, dy: 1, w: 4 },
  { dx: 2, dy: 1, w: 2 },
];

const SIERRA: Kernel = [
  { dx: 1, dy: 0, w: 5 },
  { dx: 2, dy: 0, w: 3 },
  { dx: -2, dy: 1, w: 2 },
  { dx: -1, dy: 1, w: 4 },
  { dx: 0, dy: 1, w: 5 },
  { dx: 1, dy: 1, w: 4 },
  { dx: 2, dy: 1, w: 2 },
  { dx: -1, dy: 2, w: 2 },
  { dx: 0, dy: 2, w: 3 },
  { dx: 1, dy: 2, w: 2 },
];

const STUCKI: Kernel = [
  { dx: 1, dy: 0, w: 8 },
  { dx: 2, dy: 0, w: 4 },
  { dx: 3, dy: 0, w: 2 },
  { dx: -2, dy: 1, w: 2 },
  { dx: -1, dy: 1, w: 4 },
  { dx: 0, dy: 1, w: 8 },
  { dx: 1, dy: 1, w: 4 },
  { dx: 2, dy: 1, w: 2 },
  { dx: -2, dy: 2, w: 1 },
  { dx: -1, dy: 2, w: 2 },
  { dx: 0, dy: 2, w: 4 },
  { dx: 1, dy: 2, w: 2 },
  { dx: 2, dy: 2, w: 1 },
];

const JARVIS: Kernel = [
  { dx: 1, dy: 0, w: 7 },
  { dx: 2, dy: 0, w: 5 },
  { dx: 3, dy: 0, w: 3 },
  { dx: 4, dy: 0, w: 1 },
  { dx: -2, dy: 1, w: 3 },
  { dx: -1, dy: 1, w: 5 },
  { dx: 0, dy: 1, w: 7 },
  { dx: 1, dy: 1, w: 5 },
  { dx: 2, dy: 1, w: 3 },
  { dx: 3, dy: 1, w: 1 },
  { dx: -2, dy: 2, w: 1 },
  { dx: -1, dy: 2, w: 3 },
  { dx: 0, dy: 2, w: 5 },
  { dx: 1, dy: 2, w: 3 },
  { dx: 2, dy: 2, w: 1 },
];

function orderedDither(
  gray: Float32Array,
  width: number,
  height: number,
  matrix: number[][],
  size: number,
  levels: number
): Uint8Array {
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const threshold = (matrix[y % size]![x % size]! + 0.5) * (255 / levels);
      out[i] = gray[i]! < threshold ? 1 : 0;
    }
  }
  return out;
}

function threshold(gray: Float32Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(width * height);
  for (let i = 0; i < out.length; i++) {
    out[i] = gray[i]! < 128 ? 1 : 0;
  }
  return out;
}

function halftoneDither(
  gray: Float32Array,
  width: number,
  height: number,
  cell = 8
): Uint8Array {
  const out = new Uint8Array(width * height);
  const cx = cell / 2;
  const cy = cell / 2;
  const maxR = Math.sqrt(cx * cx + cy * cy);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const lx = x % cell;
      const ly = y % cell;
      const dist = Math.sqrt((lx - cx) ** 2 + (ly - cy) ** 2) / maxR;
      const dot = (1 - dist) * 255;
      out[i] = gray[i]! < dot ? 1 : 0;
    }
  }
  return out;
}

/** 1 = ink (prints black). */
export function dither(
  gray: Float32Array,
  width: number,
  height: number,
  id: DitherId
): Uint8Array {
  switch (id) {
    case "floydSteinberg":
      return errorDiffusion(gray, width, height, FLOYD, 16);
    case "atkinson":
      return errorDiffusion(gray, width, height, ATKINSON, 8, 0.75);
    case "burkes":
      return errorDiffusion(gray, width, height, BURKES, 32);
    case "sierra":
      return errorDiffusion(gray, width, height, SIERRA, 32);
    case "stucki":
      return errorDiffusion(gray, width, height, STUCKI, 42);
    case "jarvis":
      return errorDiffusion(gray, width, height, JARVIS, 48);
    case "bayer4":
      return orderedDither(gray, width, height, BAYER_4, 4, 16);
    case "bayer8":
      return orderedDither(gray, width, height, BAYER_8, 8, 64);
    case "threshold":
      return threshold(gray, width, height);
    case "halftone":
      return halftoneDither(gray, width, height);
    default:
      return errorDiffusion(gray, width, height, FLOYD, 16);
  }
}

export function imageDataToGray(data: ImageData): Float32Array {
  const { width, height } = data;
  const gray = new Float32Array(width * height);
  const d = data.data;
  for (let i = 0; i < gray.length; i++) {
    const o = i * 4;
    gray[i] = 0.299 * d[o]! + 0.587 * d[o + 1]! + 0.114 * d[o + 2]!;
  }
  return gray;
}

/** Paint 1-bit buffer into ImageData (ink = black). */
export function binaryToImageData(
  binary: Uint8Array,
  imageData: ImageData
): void {
  const d = imageData.data;
  for (let i = 0; i < binary.length; i++) {
    const v = binary[i] ? 0 : 255;
    const o = i * 4;
    d[o] = v;
    d[o + 1] = v;
    d[o + 2] = v;
    d[o + 3] = 255;
  }
}

export function ditherImageData(
  data: ImageData,
  id: DitherId
): Uint8Array {
  const gray = imageDataToGray(data);
  const binary = dither(gray, data.width, data.height, id);
  binaryToImageData(binary, data);
  return binary;
}
