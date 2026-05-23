import { PRINTER_WIDTH_PX } from "./catPrinter";
import { dither, imageDataToGray, type DitherId } from "./dither";

export interface BitmapResult {
  rows: Uint8Array[];
  width: number;
  height: number;
  /** Scaled grayscale preview (no dither) for UI. */
  grayscalePreviewUrl: string;
}

function grayscaleToDataUrl(
  gray: Float32Array,
  width: number,
  height: number
): string {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(width, height);
  const d = img.data;
  for (let i = 0; i < gray.length; i++) {
    const v = Math.round(gray[i]!);
    const o = i * 4;
    d[o] = v;
    d[o + 1] = v;
    d[o + 2] = v;
    d[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL("image/png");
}

/**
 * Scale to 384px wide and pack 1-bit print rows.
 * Cat printers only support on/off dots — use `threshold` for plain gray→B/W
 * (no Floyd–Steinberg / halftone); other DitherId values add a pattern.
 */
export function canvasToBitmap(
  source: HTMLCanvasElement,
  ditherId: DitherId
): BitmapResult {
  const srcW = source.width;
  const srcH = source.height;
  const width = PRINTER_WIDTH_PX;
  const height = Math.max(1, Math.round((srcH / srcW) * width));

  const work = document.createElement("canvas");
  work.width = width;
  work.height = height;
  const ctx = work.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas not available");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);
  const gray = imageDataToGray(imageData);
  const binary = dither(gray, width, height, ditherId);

  const rows: Uint8Array[] = [];
  for (let y = 0; y < height; y++) {
    const row = new Uint8Array(width);
    for (let x = 0; x < width; x++) {
      row[x] = binary[y * width + x]!;
    }
    rows.push(row);
  }

  return {
    rows,
    width,
    height,
    grayscalePreviewUrl: grayscaleToDataUrl(gray, width, height),
  };
}
