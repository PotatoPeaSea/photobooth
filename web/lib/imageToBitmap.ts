import { PRINTER_WIDTH_PX } from "./catPrinter";

export interface BitmapResult {
  rows: Uint8Array[];
  width: number;
  height: number;
  previewUrl: string;
}

/** Scale image to 384px wide, Floyd–Steinberg dither, pack MSB-first rows. */
export async function imageFileToBitmap(file: File): Promise<BitmapResult> {
  const bitmap = await createImageBitmap(file);
  const aspect = bitmap.height / bitmap.width;
  const width = PRINTER_WIDTH_PX;
  const height = Math.max(1, Math.round(width * aspect));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas not available");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const { data } = ctx.getImageData(0, 0, width, height);
  const gray = new Float32Array(width * height);
  for (let i = 0; i < gray.length; i++) {
    const o = i * 4;
    gray[i] =
      0.299 * data[o]! + 0.587 * data[o + 1]! + 0.114 * data[o + 2]!;
  }

  const binary = floydSteinberg(gray, width, height);
  const rows = packPixelRows(binary, width, height);

  const preview = renderPreview(binary, width, height);
  return {
    rows,
    width,
    height,
    previewUrl: preview,
  };
}

function floydSteinberg(
  gray: Float32Array,
  width: number,
  height: number
): Uint8Array {
  const buf = new Float32Array(gray);
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const old = buf[i]!;
      const bit = old < 128 ? 1 : 0;
      out[i] = bit;
      const err = old - (bit ? 0 : 255);
      if (x + 1 < width) buf[i + 1]! += (err * 7) / 16;
      if (y + 1 < height) {
        if (x > 0) buf[i + width - 1]! += (err * 3) / 16;
        buf[i + width]! += (err * 5) / 16;
        if (x + 1 < width) buf[i + width + 1]! += err / 16;
      }
    }
  }
  return out;
}

/** One Uint8Array per row: 384 pixels, 1 = ink (matches catprinter after invert). */
function packPixelRows(
  binary: Uint8Array,
  width: number,
  height: number
): Uint8Array[] {
  const rows: Uint8Array[] = [];
  for (let y = 0; y < height; y++) {
    const row = new Uint8Array(width);
    for (let x = 0; x < width; x++) {
      row[x] = binary[y * width + x]!;
    }
    rows.push(row);
  }
  return rows;
}

function renderPreview(
  binary: Uint8Array,
  width: number,
  height: number
): string {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(width, height);
  for (let i = 0; i < binary.length; i++) {
    const v = binary[i] ? 0 : 255;
    const o = i * 4;
    img.data[o] = v;
    img.data[o + 1] = v;
    img.data[o + 2] = v;
    img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL("image/png");
}
