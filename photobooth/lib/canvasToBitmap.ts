import { PRINTER_WIDTH_PX } from "./catPrinter";
import { dither, imageDataToGray, type DitherId } from "./dither";

export interface BitmapResult {
  rows: Uint8Array[];
  width: number;
  height: number;
  previewUrl: string;
}

/** Scale capture to 384px wide, dither with chosen pattern, pack print rows. */
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

  const preview = document.createElement("canvas");
  preview.width = width;
  preview.height = height;
  const pctx = preview.getContext("2d")!;
  const img = pctx.createImageData(width, height);
  for (let i = 0; i < binary.length; i++) {
    const v = binary[i] ? 0 : 255;
    const o = i * 4;
    img.data[o] = v;
    img.data[o + 1] = v;
    img.data[o + 2] = v;
    img.data[o + 3] = 255;
  }
  pctx.putImageData(img, 0, 0);

  return {
    rows,
    width,
    height,
    previewUrl: preview.toDataURL("image/png"),
  };
}
