/** Draw mirrored square crop from video, grayscale (no dither). */

export function toGrayscale(imageData: ImageData): void {
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const gray = Math.round(
      0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!
    );
    d[i] = gray;
    d[i + 1] = gray;
    d[i + 2] = gray;
  }
}

export function renderVideoFrame(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  size: number
): void {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const side = Math.min(vw, vh);
  const sx = (vw - side) / 2;
  const sy = (vh - side) / 2;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);

  ctx.save();
  ctx.translate(size, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, sx, sy, side, side, 0, 0, size, size);
  ctx.restore();

  const imageData = ctx.getImageData(0, 0, size, size);
  toGrayscale(imageData);
  ctx.putImageData(imageData, 0, 0);
}

/** Capture high-res grayscale frame (matches live preview, no dither). */
export function captureVideoToCanvas(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement
): void {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const side = Math.min(vw, vh);
  const sx = (vw - side) / 2;
  const sy = (vh - side) / 2;

  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, side, side);
  ctx.save();
  ctx.translate(side, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, sx, sy, side, side, 0, 0, side, side);
  ctx.restore();

  const imageData = ctx.getImageData(0, 0, side, side);
  toGrayscale(imageData);
  ctx.putImageData(imageData, 0, 0);
}
