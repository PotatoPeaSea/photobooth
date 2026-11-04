/**
 * Cat Printer protocol (GB0X / MX0X / M02 / SC03 family).
 * Derived from the supplied PacketLogger trace.
 */

export const PRINTER_WIDTH_PX = 384;
export const PRINTER_BYTES_PER_ROW = PRINTER_WIDTH_PX / 8;

export const PRINTER_SERVICES = [
  "0000ae30-0000-1000-8000-00805f9b34fb",
  "0000af30-0000-1000-8000-00805f9b34fb",
] as const;

export const PRINTER_TX_CHARACTERISTICS = [
  "0000ae01-0000-1000-8000-00805f9b34fb",
  "0000af01-0000-1000-8000-00805f9b34fb",
] as const;

export const PRINTER_RX_CHARACTERISTICS = [
  "0000ae02-0000-1000-8000-00805f9b34fb",
  "0000af02-0000-1000-8000-00805f9b34fb",
] as const;

export const PRINTER_NAME_PREFIXES = [
  "GB01",
  "GB02",
  "GB03",
  "GB04",
  "GT01",
  "MX05",
  "MX06",
  "MX08",
  "MX10",
  "YHK",
  "M02",
  "M03",
  "M04",
  "T02",
  "SC01",
  "SC02",
  "SC03",
  "Phomemo",
  "Bisofice",
] as const;

export enum Cmd {
  RetractPaper = 0xa0,
  FeedPaper = 0xa1,
  DrawBitmap = 0xa2,
  GetDevState = 0xa3,
  SetEnergy = 0xa4,
  ApplyEnergy = 0xa6,
  GetDevInfo = 0xa8,
  PrintLattice = 0xeb,
  SetSpeed = 0xbb,
  SetLattice = 0xbd,
  LatticeStart = 0xbe,
  DrawRleBitmap = 0xbf,
}

export function crc8(data: Uint8Array): number {
  let crc = 0;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i]!;
    for (let b = 0; b < 8; b++) {
      if (crc & 0x80) crc = ((crc << 1) ^ 0x07) & 0xff;
      else crc = (crc << 1) & 0xff;
    }
  }
  return crc;
}

/** Build one host→printer frame (0x51 0x78 … 0xff). */
export function buildFrame(cmd: Cmd, payload: Uint8Array): Uint8Array {
  const len = payload.length;
  const frame = new Uint8Array(8 + len);
  frame[0] = 0x51;
  frame[1] = 0x78;
  frame[2] = cmd;
  frame[3] = 0x00;
  frame[4] = len & 0xff;
  frame[5] = (len >> 8) & 0xff;
  frame.set(payload, 6);
  frame[6 + len] = crc8(payload);
  frame[7 + len] = 0xff;
  return frame;
}

/** One row: 384 pixels as 0/1 (1 = print dot). */

function encodeRunRepetition(n: number, val: number): number[] {
  const res: number[] = [];
  while (n > 0x7f) {
    res.push(0x7f | (val << 7));
    n -= 0x7f;
  }
  if (n > 0) res.push((val << 7) | n);
  return res;
}

/** Pixel RLE for Cmd.DrawRleBitmap (0xbf) — matches rbaron/catprinter. */
export function runLengthEncodePixels(pixels: Uint8Array): Uint8Array {
  const res: number[] = [];
  let count = 0;
  let lastVal = -1;
  for (let i = 0; i < pixels.length; i++) {
    const val = pixels[i]! ? 1 : 0;
    if (val === lastVal) {
      count++;
    } else {
      res.push(...encodeRunRepetition(count, lastVal));
      count = 1;
      lastVal = val;
    }
  }
  if (count > 0) res.push(...encodeRunRepetition(count, lastVal));
  return new Uint8Array(res);
}

/** Uncompressed row for Cmd.DrawBitmap (0xa2) — LSB = leftmost pixel. */
export function byteEncodePixels(pixels: Uint8Array): Uint8Array {
  const row = new Uint8Array(PRINTER_BYTES_PER_ROW);
  for (let chunk = 0; chunk < pixels.length; chunk += 8) {
    let byte = 0;
    for (let bit = 0; bit < 8; bit++) {
      if (pixels[chunk + bit]) byte |= 1 << bit;
    }
    row[chunk >> 3] = byte;
  }
  return row;
}

/** Pick 0xbf RLE or 0xa2 raw for one scanline (same heuristic as catprinter). */
export function encodePrintRow(pixels: Uint8Array): Uint8Array {
  const rle = runLengthEncodePixels(pixels);
  if (rle.length > PRINTER_BYTES_PER_ROW) {
    return buildFrame(Cmd.DrawBitmap, byteEncodePixels(pixels));
  }
  return buildFrame(Cmd.DrawRleBitmap, rle);
}

export interface PrintOptions {
  energy?: number;
  speed?: number;
  feedAfter?: number;
}

/** Ordered command frames matching the trace print job. */
export function buildPrintJob(
  rows: Uint8Array[],
  opts: PrintOptions = {}
): Uint8Array[] {
  const energy = opts.energy ?? 0x33;
  const speed = opts.speed ?? 0x01;
  const feed = opts.feedAfter ?? 0x60;
  const height = rows.length;
  const frames: Uint8Array[] = [];

  frames.push(buildFrame(Cmd.GetDevState, new Uint8Array([0x00])));
  frames.push(buildFrame(Cmd.SetEnergy, new Uint8Array([energy])));
  frames.push(buildFrame(Cmd.ApplyEnergy, new Uint8Array([0x00])));
  frames.push(buildFrame(Cmd.SetSpeed, new Uint8Array([speed])));
  frames.push(
    buildFrame(Cmd.LatticeStart, new Uint8Array([0x00, 0x01]))
  );
  frames.push(
    buildFrame(Cmd.SetLattice, new Uint8Array([0x19, 0x4f]))
  );

  for (const row of rows) {
    frames.push(encodePrintRow(row));
  }

  const hi = height & 0xff;
  const lo = (height >> 8) & 0xff;
  frames.push(buildFrame(Cmd.SetLattice, new Uint8Array([hi, lo])));
  frames.push(
    buildFrame(Cmd.FeedPaper, new Uint8Array([feed & 0xff, (feed >> 8) & 0xff]))
  );
  frames.push(buildFrame(Cmd.GetDevState, new Uint8Array([0x00])));

  return frames;
}

export function buildInitSequence(): Uint8Array[] {
  return [
    buildFrame(Cmd.GetDevInfo, new Uint8Array([0x00])),
    buildFrame(Cmd.GetDevState, new Uint8Array([0x00])),
  ];
}
