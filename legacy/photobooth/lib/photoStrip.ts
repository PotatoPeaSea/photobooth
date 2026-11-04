import { PRINTER_WIDTH_PX } from "./catPrinter";

export const STRIP_COUNT = 4;
export const STRIP_WIDTH = PRINTER_WIDTH_PX;

/** Square frames stacked vertically (384 wide × 1536 tall at print resolution). */
export function composePhotoStrip(frames: HTMLCanvasElement[]): HTMLCanvasElement {
  if (frames.length !== STRIP_COUNT) {
    throw new Error(`Expected ${STRIP_COUNT} frames, got ${frames.length}`);
  }

  const cellSize = STRIP_WIDTH;
  const stripHeight = cellSize * STRIP_COUNT;
  const out = document.createElement("canvas");
  out.width = STRIP_WIDTH;
  out.height = stripHeight;
  const ctx = out.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, STRIP_WIDTH, stripHeight);

  frames.forEach((frame, i) => {
    ctx.drawImage(
      frame,
      0,
      0,
      frame.width,
      frame.height,
      0,
      i * cellSize,
      cellSize,
      cellSize
    );
  });

  return out;
}
