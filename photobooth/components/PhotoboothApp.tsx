"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BluetoothCatPrinter } from "@/lib/bluetoothPrinter";
import { canvasToBitmap } from "@/lib/canvasToBitmap";
import { captureVideoToCanvas, renderVideoFrame } from "@/lib/renderFrame";
import { STRIP_COUNT } from "@/lib/photoStrip";
import { DITHER_PATTERNS, ditherImageData, type DitherId } from "@/lib/dither";
import {
  composeStripWithSurround,
  renderSurroundPreview,
  STRIP_SURROUNDS,
  type SurroundId,
} from "@/lib/stripSurrounds";
import StripShareQr from "@/components/StripShareQr";

const PREVIEW_SIZE = 440;
/** Preview canvas + border-4 + p-1 — side panels align to this height */
const PREVIEW_FRAME_H = PREVIEW_SIZE + 16 + 8;

export default function PhotoboothApp() {
  const printerRef = useRef(new BluetoothCatPrinter());
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const frameCanvasRef = useRef<HTMLCanvasElement>(null);
  const framesRef = useRef<HTMLCanvasElement[]>([]);
  const lastPrintRowsRef = useRef<Uint8Array[] | null>(null);
  const animRef = useRef<number>(0);

  const [supported, setSupported] = useState(true);
  const [cameraOk, setCameraOk] = useState(false);
  const [printerName, setPrinterName] = useState<string | null>(null);
  const [surroundId, setSurroundId] = useState<SurroundId>("classic");
  const [ditherId, setDitherId] = useState<DitherId>("floydSteinberg");
  const [previewDither, setPreviewDither] = useState(false);
  const [busy, setBusy] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);
  const [lastShot, setLastShot] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [thumbs, setThumbs] = useState<string[]>([]);

  const [surroundPreviews, setSurroundPreviews] = useState<
    Partial<Record<SurroundId, string>>
  >({});

  useEffect(() => {
    const map: Partial<Record<SurroundId, string>> = {};
    for (const s of STRIP_SURROUNDS) {
      map[s.id] = renderSurroundPreview(s.id);
    }
    setSurroundPreviews(map);
  }, []);

  const capturedCount = thumbs.length;
  const nextPhoto = capturedCount + 1;
  const stripComplete = capturedCount >= STRIP_COUNT;
  const stripStarted = capturedCount > 0;

  const resetStrip = useCallback(() => {
    framesRef.current = [];
    setThumbs([]);
  }, []);

  const drawPreview = useCallback(() => {
    const video = videoRef.current;
    const canvas = previewCanvasRef.current;
    if (!video || !canvas || video.readyState < 2) {
      animRef.current = requestAnimationFrame(drawPreview);
      return;
    }

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    if (video.videoWidth === 0 || video.videoHeight === 0) {
      animRef.current = requestAnimationFrame(drawPreview);
      return;
    }

    canvas.width = PREVIEW_SIZE;
    canvas.height = PREVIEW_SIZE;
    renderVideoFrame(ctx, video, PREVIEW_SIZE);

    if (previewDither) {
      const imageData = ctx.getImageData(0, 0, PREVIEW_SIZE, PREVIEW_SIZE);
      ditherImageData(imageData, ditherId);
      ctx.putImageData(imageData, 0, 0);
    }

    animRef.current = requestAnimationFrame(drawPreview);
  }, [previewDither, ditherId]);

  useEffect(() => {
    setSupported(BluetoothCatPrinter.isSupported());
  }, []);

  useEffect(() => {
    let stream: MediaStream | null = null;

    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play();
          setCameraOk(true);
          animRef.current = requestAnimationFrame(drawPreview);
        }
      } catch {
        /* camera unavailable */
      }
    }

    startCamera();

    return () => {
      cancelAnimationFrame(animRef.current);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [drawPreview]);

  const connectPrinter = async () => {
    setBusy(true);
    try {
      const name = await printerRef.current.connect();
      await printerRef.current.sendInit();
      setPrinterName(name);
    } catch {
      /* user cancelled or connect failed */
    } finally {
      setBusy(false);
    }
  };

  const flashShot = () => {
    setFlash(true);
    setTimeout(() => setFlash(false), 280);
  };

  const printRows = async (rows: Uint8Array[]) => {
    await printerRef.current.printRows(
      rows,
      { energy: 51, speed: 1, feedAfter: 0xe0 },
      (_msg, pct) => setProgress(pct)
    );
  };

  const printStrip = async (frames: HTMLCanvasElement[]) => {
    const strip = composeStripWithSurround(frames, surroundId);
    const bitmap = canvasToBitmap(strip, ditherId);
    setLastShot(bitmap.grayscalePreviewUrl);
    lastPrintRowsRef.current = bitmap.rows;
    await printRows(bitmap.rows);
    resetStrip();
  };

  const reprintLast = async (copies: number) => {
    const rows = lastPrintRowsRef.current;
    if (!printerRef.current.connected || !rows || busy) return;

    setBusy(true);
    try {
      for (let i = 0; i < copies; i++) {
        await printRows(rows);
      }
    } catch {
      /* reprint failed */
    } finally {
      setBusy(false);
      setProgress(0);
    }
  };

  const shutter = async () => {
    if (!printerRef.current.connected) return;
    if (!cameraOk || busy || stripComplete) return;

    const video = videoRef.current;
    const frameCanvas = frameCanvasRef.current;
    if (!video || !frameCanvas) return;

    setBusy(true);

    try {
      for (let n = 3; n >= 1; n--) {
        setCountdown(n);
        await new Promise((r) => setTimeout(r, 700));
      }
      setCountdown(null);

      flashShot();
      captureVideoToCanvas(frameCanvas, video);

      const copy = document.createElement("canvas");
      copy.width = frameCanvas.width;
      copy.height = frameCanvas.height;
      copy.getContext("2d")!.drawImage(frameCanvas, 0, 0);
      framesRef.current.push(copy);
      setThumbs((prev) => [...prev, copy.toDataURL("image/jpeg", 0.82)]);

      const newCount = framesRef.current.length;
      if (newCount < STRIP_COUNT) {
        setBusy(false);
        return;
      }

      await printStrip(framesRef.current);
    } catch {
      /* capture/print failed */
    } finally {
      setBusy(false);
      setProgress(0);
      setCountdown(null);
    }
  };

  if (!supported) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8 text-center">
        <p className="text-booth-accent">
          Use Chrome or Edge (HTTPS or localhost) for camera and Bluetooth.
        </p>
      </main>
    );
  }

  return (
    <main className="relative flex h-dvh flex-col overflow-hidden bg-booth-bg text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,#000_95%)]" />

      <header className="relative z-10 flex shrink-0 items-center justify-center border-b border-white/10 px-4 py-3">
        {printerName ? (
          <button
            type="button"
            onClick={() => {
              printerRef.current.disconnect();
              setPrinterName(null);
              resetStrip();
            }}
            className="shrink-0 rounded-full border border-white/20 px-3 py-1.5 text-xs text-white/70"
          >
            {printerName} · disconnect
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={connectPrinter}
            className="shrink-0 rounded-full bg-booth-accent px-4 py-1.5 text-xs font-medium text-white"
          >
            Connect printer
          </button>
        )}
      </header>

      <div className="relative z-10 flex min-h-0 w-full flex-1 items-center justify-center overflow-y-auto px-3 py-4 lg:px-6">
        <div className="grid w-full max-w-6xl grid-cols-1 justify-items-center gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-start lg:justify-items-stretch lg:gap-x-6 lg:gap-y-4">
        {/* Left — strip progress (same height as preview frame) */}
        <aside className="flex w-full max-w-[440px] flex-col gap-2 lg:w-36 lg:max-w-none lg:justify-self-end">
          <p className="font-mono text-[10px] uppercase tracking-widest text-white/40">
            Your strip
          </p>

          <div
            className="flex flex-col rounded-lg border border-white/15 bg-black/40 p-2"
            style={{ height: PREVIEW_FRAME_H }}
          >
            <p className="mb-1.5 shrink-0 text-center text-xs font-medium text-booth-glow">
              {stripComplete
                ? "Printing…"
                : `Photo ${Math.min(nextPhoto, STRIP_COUNT)} of ${STRIP_COUNT}`}
            </p>
            <div className="flex min-h-0 flex-1 flex-col gap-1">
              {Array.from({ length: STRIP_COUNT }, (_, i) => {
                const isDone = i < capturedCount;
                const isCurrent = i === capturedCount && !stripComplete;
                return (
                  <div
                    key={i}
                    className={`relative min-h-0 flex-1 overflow-hidden rounded border transition ${
                      isCurrent
                        ? "border-booth-accent ring-2 ring-booth-accent/40"
                        : isDone
                          ? "border-booth-glow/50"
                          : "border-white/10"
                    }`}
                  >
                    <div className="h-full w-full bg-white/5">
                      {thumbs[i] ? (
                        <img
                          src={thumbs[i]}
                          alt={`Photo ${i + 1}`}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center font-mono text-sm text-white/20">
                          {i + 1}
                        </div>
                      )}
                    </div>
                    {isCurrent && (
                      <span className="absolute bottom-0 left-0 right-0 bg-booth-accent/90 py-0.5 text-center text-[9px] font-medium uppercase tracking-wide">
                        Now
                      </span>
                    )}
                    {isDone && (
                      <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-booth-glow text-[10px] font-bold text-booth-bg">
                        ✓
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {stripStarted && !busy && (
            <button
              type="button"
              onClick={resetStrip}
              className="w-full rounded-lg border border-white/15 py-1.5 text-[10px] text-white/60 hover:bg-white/5"
            >
              Start over
            </button>
          )}
        </aside>

        {/* Center — preview + shutter */}
        <div className="flex w-full max-w-[440px] flex-col items-center gap-2 lg:justify-self-center">
          <p className="w-full font-mono text-[10px] uppercase tracking-widest text-white/40 lg:text-center">
            {previewDither ? "Live preview · dithered" : "Live preview"}
          </p>

          <div className="relative w-full">
            <div className="rounded-sm border-4 border-white/90 bg-black p-1 shadow-[0_0_40px_rgba(255,51,102,0.25)]">
              <canvas
                ref={previewCanvasRef}
                width={PREVIEW_SIZE}
                height={PREVIEW_SIZE}
                className="block w-full"
              />
            </div>
            {countdown !== null && (
              <div
                key={countdown}
                className="absolute inset-0 flex items-center justify-center text-8xl font-bold text-booth-glow animate-countdown"
              >
                {countdown}
              </div>
            )}
            {flash && (
              <div className="pointer-events-none absolute inset-0 bg-white animate-flash" />
            )}
          </div>

          <video ref={videoRef} className="hidden" playsInline muted />
          <canvas ref={frameCanvasRef} className="hidden" />

          <div className="flex flex-col items-center gap-4 pt-2">
          <button
            type="button"
            disabled={busy || !cameraOk || stripComplete}
            onClick={shutter}
            aria-label={`Capture photo ${nextPhoto}`}
            className="group flex h-[72px] w-[72px] items-center justify-center rounded-full border-4 border-white bg-booth-accent shadow-[0_0_24px_rgba(255,51,102,0.5)] transition enabled:hover:scale-105 enabled:active:scale-95 disabled:opacity-40"
          >
            <span className="h-12 w-12 rounded-full border-2 border-white/80 bg-white/20 transition group-enabled:group-hover:bg-white/30" />
          </button>
          {busy && progress > 0 && (
            <div className="h-1 w-48 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full bg-booth-glow transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
          </div>
        </div>

        {/* Right — strip surrounds (same height as preview frame) */}
        <aside className="flex w-full max-w-[440px] flex-col gap-2 lg:w-52 lg:max-w-none lg:justify-self-start">
          <p className="font-mono text-[10px] uppercase tracking-widest text-white/40">
            Strip surround
          </p>

          <div
            className="flex flex-col overflow-hidden rounded-lg border border-white/15 bg-black/40"
            style={{ height: PREVIEW_FRAME_H }}
          >
            <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2">
            {STRIP_SURROUNDS.map((s) => (
              <button
                key={s.id}
                type="button"
                disabled={busy || stripStarted}
                onClick={() => setSurroundId(s.id)}
                className={`flex w-full gap-2 rounded-md border p-1.5 text-left transition ${
                  surroundId === s.id
                    ? "border-booth-glow bg-booth-glow/10"
                    : "border-transparent hover:bg-white/5 disabled:opacity-40"
                }`}
              >
                {surroundPreviews[s.id] ? (
                  <img
                    src={surroundPreviews[s.id]}
                    alt=""
                    className="h-14 w-8 shrink-0 rounded border border-white/10 object-cover object-top"
                  />
                ) : (
                  <div className="h-14 w-8 shrink-0 rounded border border-white/10 bg-white/10" />
                )}
                <div className="min-w-0">
                  <p
                    className={`text-xs font-medium ${
                      surroundId === s.id ? "text-booth-glow" : "text-white/90"
                    }`}
                  >
                    {s.label}
                  </p>
                  <p className="mt-0.5 text-[10px] leading-snug text-white/45">
                    {s.description}
                  </p>
                </div>
              </button>
            ))}
            </div>

            <div className="shrink-0 space-y-1 border-t border-white/10 p-2">
              {stripStarted && (
                <p className="text-[10px] text-white/35">
                  Surround locked for this strip
                </p>
              )}

              {lastShot && (
                <div className="space-y-2">
                  <p className="text-[10px] uppercase tracking-wide text-white/40">
                    Last print
                  </p>
                  <div className="flex items-start gap-2">
                    <img
                      src={lastShot}
                      alt="Last strip"
                      className="min-w-0 max-h-28 flex-1 rounded border border-white/15 object-contain"
                    />
                    <StripShareQr imageDataUrl={lastShot} />
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      disabled={busy || !printerName}
                      onClick={() => reprintLast(1)}
                      className="flex-1 rounded-md border border-white/20 py-1.5 text-[10px] text-white/80 hover:bg-white/5 disabled:opacity-40"
                    >
                      Print again
                    </button>
                    <button
                      type="button"
                      disabled={busy || !printerName}
                      onClick={() => reprintLast(2)}
                      className="rounded-md border border-white/20 px-2 py-1.5 text-[10px] text-white/80 hover:bg-white/5 disabled:opacity-40"
                    >
                      ×2
                    </button>
                    <button
                      type="button"
                      disabled={busy || !printerName}
                      onClick={() => reprintLast(3)}
                      className="rounded-md border border-white/20 px-2 py-1.5 text-[10px] text-white/80 hover:bg-white/5 disabled:opacity-40"
                    >
                      ×3
                    </button>
                    <button
                      type="button"
                      disabled={busy || !printerName}
                      onClick={() => reprintLast(4)}
                      className="rounded-md border border-white/20 px-2 py-1.5 text-[10px] text-white/80 hover:bg-white/5 disabled:opacity-40"
                    >
                      ×4
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </aside>
        </div>
      </div>

      <footer className="relative z-10 shrink-0 border-t border-white/10 px-4 py-3">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-2">
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
            <p className="font-mono text-[10px] uppercase tracking-widest text-white/40">
              Dither pattern
            </p>
            {stripStarted && (
              <p className="text-[10px] text-white/35">
                Locked for this strip
              </p>
            )}
            <button
                type="button"
                role="switch"
                aria-checked={previewDither}
                disabled={!cameraOk}
                onClick={() => setPreviewDither((on) => !on)}
                className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition disabled:opacity-40 ${
                  previewDither
                    ? "border-booth-glow bg-booth-glow/10 text-booth-glow"
                    : "border-white/15 text-white/70 hover:bg-white/5"
                }`}
              >
                <span
                  className={`relative h-4 w-7 shrink-0 rounded-full transition ${
                    previewDither ? "bg-booth-glow" : "bg-white/20"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition ${
                      previewDither ? "left-3.5" : "left-0.5"
                    }`}
                  />
                </span>
                Preview on feed
              </button>
          </div>
          <div className="flex w-full justify-center gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {DITHER_PATTERNS.map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={busy || stripStarted}
                onClick={() => {
                  setDitherId(p.id);
                  if (!previewDither) setPreviewDither(true);
                }}
                title={p.description}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-left transition ${
                  ditherId === p.id
                    ? "border-booth-glow bg-booth-glow/10 text-booth-glow"
                    : "border-white/15 text-white/75 hover:bg-white/5 disabled:opacity-40"
                }`}
              >
                <span className="block text-xs font-medium">{p.label}</span>
              </button>
            ))}
          </div>
        </div>
      </footer>
    </main>
  );
}
