import { PRINTER_WIDTH_PX } from "./catPrinter";
import { STRIP_COUNT } from "./photoStrip";

export type SurroundId =
  | "classic"
  | "film"
  | "hearts"
  | "noir"
  | "confetti";

export interface StripSurround {
  id: SurroundId;
  label: string;
  description: string;
  inspirationUrl?: string;
  inspirationLabel?: string;
}

/** Styles inspired by common photobooth strip templates found online. */
export const STRIP_SURROUNDS: StripSurround[] = [
  {
    id: "classic",
    label: "Classic booth",
    description: "White strip, bold black dividers",
    inspirationUrl: "https://tools.jlvextension.com/photo-strip-generator/",
    inspirationLabel: "Photo strip generator",
  },
  {
    id: "film",
    label: "35mm film",
    description: "Cream stock with sprocket holes",
    inspirationUrl: "https://www.vecteezy.com/free-vector/film-strip",
    inspirationLabel: "Film strip vectors",
  },
  {
    id: "hearts",
    label: "Love strip",
    description: "Wedding-style heart corners",
    inspirationUrl: "https://www.hgdesigns.co/freebie-photo-both-strip-kit/",
    inspirationLabel: "HG Designs strip kit",
  },
  {
    id: "noir",
    label: "Noir",
    description: "Black border, silver accent",
    inspirationUrl: "https://www.pngitem.com/middle/JoToJw_transparent-photo-booth-strip-template-hd-png-download/",
    inspirationLabel: "Booth strip template",
  },
  {
    id: "confetti",
    label: "Party",
    description: "Confetti dots on white",
    inspirationUrl: "https://www.vecteezy.com/free-png/photo-booth-frame",
    inspirationLabel: "Booth frame PNGs",
  },
];

const STRIP_W = PRINTER_WIDTH_PX;
const MARGIN = 14;
const GAP = 8;
const HEADER = 40;
const FOOTER = 28;
export const PHOTO = STRIP_W - MARGIN * 2;

export function stripContentHeight(): number {
  return HEADER + STRIP_COUNT * PHOTO + (STRIP_COUNT - 1) * GAP + FOOTER;
}

function slotY(index: number): number {
  return HEADER + index * (PHOTO + GAP);
}

function drawHeart(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  ctx.beginPath();
  ctx.moveTo(12, 21);
  ctx.bezierCurveTo(4, 14, 0, 8, 0, 4);
  ctx.bezierCurveTo(0, 0, 4, 0, 8, 4);
  ctx.bezierCurveTo(10, 0, 14, 0, 16, 4);
  ctx.bezierCurveTo(16, 8, 12, 14, 12, 21);
  ctx.fill();
  ctx.restore();
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  id: SurroundId,
  w: number,
  h: number
): void {
  switch (id) {
    case "classic":
      ctx.fillStyle = "#ffffff";
      break;
    case "film":
      ctx.fillStyle = "#f4e9d8";
      break;
    case "hearts":
      ctx.fillStyle = "#fff8fa";
      break;
    case "noir":
      ctx.fillStyle = "#0a0a0a";
      break;
    case "confetti":
      ctx.fillStyle = "#ffffff";
      break;
  }
  ctx.fillRect(0, 0, w, h);

  if (id === "film") {
    ctx.fillStyle = "#2a2118";
    for (let y = 6; y < h; y += 22) {
      ctx.fillRect(4, y, 8, 12);
      ctx.fillRect(w - 12, y, 8, 12);
    }
  }
  if (id === "confetti") {
    const colors = ["#ff3366", "#ffd166", "#06d6a0", "#118ab2", "#9b5de5"];
    for (let i = 0; i < 55; i++) {
      ctx.fillStyle = colors[i % colors.length]!;
      ctx.beginPath();
      ctx.arc((i * 47 + 13) % w, (i * 31 + 7) % h, 2 + (i % 3), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawForeground(
  ctx: CanvasRenderingContext2D,
  id: SurroundId,
  w: number,
  h: number
): void {
  const titleColor =
    id === "noir" || id === "film" ? "#d4d4d4" : id === "hearts" ? "#c73a5e" : "#111";

  ctx.strokeStyle = id === "noir" ? "#d4d4d4" : id === "hearts" ? "#e84a6f" : "#111";
  ctx.lineWidth = id === "classic" ? 4 : 2;
  ctx.strokeRect(
    id === "classic" ? 2 : 8,
    id === "classic" ? 2 : 8,
    w - (id === "classic" ? 4 : 16),
    h - (id === "classic" ? 4 : 16)
  );

  ctx.font =
    id === "film"
      ? "bold 13px monospace"
      : id === "hearts"
        ? "italic 14px Georgia, serif"
        : "bold 15px Georgia, serif";
  ctx.fillStyle = titleColor;
  ctx.textAlign = "center";
  const titles: Record<SurroundId, string> = {
    classic: "",
    film: "",
    hearts: "",
    noir: "",
    confetti: "",
  };
  ctx.fillText(titles[id], w / 2, 26);

  for (let i = 0; i < STRIP_COUNT; i++) {
    const sy = slotY(i);
    ctx.lineWidth = id === "classic" ? 2 : 1.5;
    ctx.strokeRect(MARGIN, sy, PHOTO, PHOTO);
  }

  if (id === "classic") {
    for (let i = 0; i < STRIP_COUNT - 1; i++) {
      const y = slotY(i) + PHOTO + GAP / 2;
      ctx.beginPath();
      ctx.moveTo(MARGIN, y);
      ctx.lineTo(w - MARGIN, y);
      ctx.stroke();
    }
    ctx.font = "11px Georgia, serif";
    ctx.fillStyle = "#444";
    ctx.fillText("★ ★ ★", w / 2, h - 10);
  }

  if (id === "hearts") {
    ctx.fillStyle = "#e84a6f";
    for (let i = 0; i < STRIP_COUNT - 1; i++) {
      drawHeart(ctx, w / 2 - 6, slotY(i) + PHOTO + GAP / 2 - 6, 12);
    }
    for (let i = 0; i < 4; i++) {
      drawHeart(ctx, 16 + i * 88, 6, 7);
    }
  }

  if (id === "noir") {
    ctx.fillStyle = "#888";
    ctx.font = "10px monospace";
    ctx.fillText("EST. 2026", w / 2, h - 12);
  }
}

/** Compose 4 photos with decorative surround for thermal print. */
export function composeStripWithSurround(
  frames: HTMLCanvasElement[],
  surroundId: SurroundId
): HTMLCanvasElement {
  const h = stripContentHeight();
  const out = document.createElement("canvas");
  out.width = STRIP_W;
  out.height = h;
  const ctx = out.getContext("2d")!;

  drawBackground(ctx, surroundId, STRIP_W, h);
  for (let i = 0; i < STRIP_COUNT; i++) {
    ctx.drawImage(
      frames[i]!,
      0,
      0,
      frames[i]!.width,
      frames[i]!.height,
      MARGIN,
      slotY(i),
      PHOTO,
      PHOTO
    );
  }
  drawForeground(ctx, surroundId, STRIP_W, h);

  return out;
}

/** Small preview for the surround picker UI. */
export function renderSurroundPreview(
  surroundId: SurroundId,
  width = 120
): string {
  const scale = width / STRIP_W;
  const h = Math.round(stripContentHeight() * scale);
  const c = document.createElement("canvas");
  c.width = width;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.scale(scale, scale);
  drawBackground(ctx, surroundId, STRIP_W, stripContentHeight());
  for (let i = 0; i < STRIP_COUNT; i++) {
    ctx.fillStyle = "#bbb";
    ctx.fillRect(MARGIN, slotY(i), PHOTO, PHOTO);
  }
  drawForeground(ctx, surroundId, STRIP_W, stripContentHeight());
  return c.toDataURL("image/png");
}
