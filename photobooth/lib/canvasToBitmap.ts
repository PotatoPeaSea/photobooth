import { PRINTER_WIDTH_PX } from "./catPrinter";
import { dither, imageDataToGray, type DitherId } from "./dither";

/** Dither at N× print width, then downsample for a finer pattern on 384px output. */
const DITHER_SUPERSAMPLE = 3;

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

function downsampleBinary(
  binary: Uint8Array,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number
): Uint8Array {
  const out = new Uint8Array(dstW * dstH);
  const scaleX = srcW / dstW;
  const scaleY = srcH / dstH;

  for (let y = 0; y < dstH; y++) {
    const y0 = Math.floor(y * scaleY);
    const y1 = Math.min(srcH, Math.ceil((y + 1) * scaleY));
    for (let x = 0; x < dstW; x++) {
      const x0 = Math.floor(x * scaleX);
      const x1 = Math.min(srcW, Math.ceil((x + 1) * scaleX));
      let ink = 0;
      let count = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          ink += binary[sy * srcW + sx]!;
          count++;
        }
      }
      out[y * dstW + x] = ink * 2 >= count ? 1 : 0;
    }
  }
  return out;
}

function drawScaled(
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  w: number,
  h: number
): void {
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(source, 0, 0, w, h);
}

/**
 * Scale to 384px wide and pack 1-bit print rows.
 * Dithers at DITHER_SUPERSAMPLE× resolution, then downsamples for finer grain.
 */
export function canvasToBitmap(
  source: HTMLCanvasElement,
  ditherId: DitherId
): BitmapResult {
  const srcW = source.width;
  const srcH = source.height;
  const width = PRINTER_WIDTH_PX;
  const height = Math.max(1, Math.round((srcH / srcW) * width));
  const hiW = width * DITHER_SUPERSAMPLE;
  const hiH = height * DITHER_SUPERSAMPLE;

  const hiCanvas = document.createElement("canvas");
  hiCanvas.width = hiW;
  hiCanvas.height = hiH;
  const hiCtx = hiCanvas.getContext("2d", { willReadFrequently: true });
  if (!hiCtx) throw new Error("Canvas not available");
  drawScaled(hiCtx, source, hiW, hiH);

  const grayHi = imageDataToGray(hiCtx.getImageData(0, 0, hiW, hiH));
  const binaryHi = dither(grayHi, hiW, hiH, ditherId);
  const binary = downsampleBinary(binaryHi, hiW, hiH, width, height);

  const previewCanvas = document.createElement("canvas");
  previewCanvas.width = width;
  previewCanvas.height = height;
  const previewCtx = previewCanvas.getContext("2d", {
    willReadFrequently: true,
  })!;
  drawScaled(previewCtx, source, width, height);
  const gray = imageDataToGray(
    previewCtx.getImageData(0, 0, width, height)
  );

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
