"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BluetoothCatPrinter } from "@/lib/bluetoothPrinter";
import { imageFileToBitmap } from "@/lib/imageToBitmap";

type Step = "connect" | "image" | "print";

export default function PrinterApp() {
  const printerRef = useRef(new BluetoothCatPrinter());
  const [supported, setSupported] = useState(true);
  const [step, setStep] = useState<Step>("connect");
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [rows, setRows] = useState<Uint8Array[] | null>(null);
  const [height, setHeight] = useState(0);
  const [energy, setEnergy] = useState(51);
  const [speed, setSpeed] = useState(1);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState(0);
  const [log, setLog] = useState<string[]>([]);

  useEffect(() => {
    setSupported(BluetoothCatPrinter.isSupported());
  }, []);

  const appendLog = useCallback((line: string) => {
    setLog((prev) => [line, ...prev].slice(0, 20));
  }, []);

  const connect = async () => {
    setBusy(true);
    setStatus("Opening Bluetooth picker…");
    try {
      const name = await printerRef.current.connect((data) => {
        const hex = Array.from(new Uint8Array(data.buffer))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join(" ");
        appendLog(`← ${hex}`);
      });
      setDeviceName(name);
      setStatus(`Connected to ${name}`);
      appendLog(`Connected: ${name}`);
      await printerRef.current.sendInit();
      appendLog("Init sequence sent");
      setStep("image");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("cancelled") && !msg.includes("canceled")) {
        setStatus(msg);
      } else {
        setStatus("");
      }
    } finally {
      setBusy(false);
    }
  };

  const disconnect = () => {
    printerRef.current.disconnect();
    setDeviceName(null);
    setStep("connect");
    setStatus("Disconnected");
    setPreviewUrl(null);
    setRows(null);
  };

  const onFile = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    setStatus("Processing image…");
    try {
      const result = await imageFileToBitmap(file);
      setPreviewUrl(result.previewUrl);
      setRows(result.rows);
      setHeight(result.height);
      setStatus(`Ready: ${result.width}×${result.height}px, ${result.rows.length} lines`);
      setStep("print");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const print = async () => {
    if (!rows?.length) return;
    setBusy(true);
    setProgress(0);
    setStatus("Printing…");
    try {
      await printerRef.current.printRows(
        rows,
        { energy, speed, feedAfter: 0x60 },
        (msg, pct) => {
          setStatus(msg);
          setProgress(pct);
        }
      );
      setStatus("Print job finished");
      appendLog("Print complete");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setProgress(100);
    }
  };

  if (!supported) {
    return (
      <main className="mx-auto max-w-lg p-8">
        <h1 className="text-2xl font-semibold">Cat Printer</h1>
        <p className="mt-4 text-red-700">
          Web Bluetooth is not available in this browser. Use Chrome or Edge on
          desktop (or Android Chrome) over HTTPS or localhost.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-lg px-6 py-10">
      <header className="mb-8 border-b border-ink/10 pb-6">
        <h1 className="text-3xl font-semibold tracking-tight">Cat Printer</h1>
        <p className="mt-2 text-sm text-ink/70">
          Pick a Bluetooth thermal printer, choose an image, and print. Protocol
          matches the SC03 / GB0X family from your trace capture.
        </p>
      </header>

      <section className="space-y-6">
        <div className="rounded-xl border border-ink/15 bg-white p-5 shadow-sm">
          <h2 className="font-mono text-xs uppercase tracking-wider text-ink/50">
            1 · Bluetooth
          </h2>
          {deviceName ? (
            <div className="mt-3 flex items-center justify-between gap-4">
              <p className="font-medium">{deviceName}</p>
              <button
                type="button"
                onClick={disconnect}
                className="text-sm text-ink/60 underline hover:text-ink"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={connect}
              className="mt-3 w-full rounded-lg bg-ink px-4 py-3 text-sm font-medium text-paper transition hover:bg-ink/90 disabled:opacity-50"
            >
              Choose printer
            </button>
          )}
        </div>

        <div
          className={`rounded-xl border border-ink/15 bg-white p-5 shadow-sm ${
            step === "connect" ? "opacity-40 pointer-events-none" : ""
          }`}
        >
          <h2 className="font-mono text-xs uppercase tracking-wider text-ink/50">
            2 · Image
          </h2>
          <label className="mt-3 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-ink/20 px-4 py-8 transition hover:border-ink/40">
            <span className="text-sm text-ink/70">Tap to select image</span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={busy || step === "connect"}
              onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            />
          </label>
          {previewUrl && (
            <img
              src={previewUrl}
              alt="Print preview"
              className="mt-4 w-full rounded border border-ink/10"
            />
          )}
        </div>

        <div
          className={`rounded-xl border border-ink/15 bg-white p-5 shadow-sm ${
            step !== "print" ? "opacity-40 pointer-events-none" : ""
          }`}
        >
          <h2 className="font-mono text-xs uppercase tracking-wider text-ink/50">
            3 · Print
          </h2>
          <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
            <label className="flex flex-col gap-1">
              <span className="text-ink/60">Energy (0–255)</span>
              <input
                type="range"
                min={0}
                max={255}
                value={energy}
                onChange={(e) => setEnergy(Number(e.target.value))}
              />
              <span className="font-mono">{energy}</span>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-ink/60">Speed</span>
              <input
                type="range"
                min={1}
                max={5}
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
              />
              <span className="font-mono">{speed}</span>
            </label>
          </div>
          {height > 0 && (
            <p className="mt-2 text-xs text-ink/50">{height} scanlines @ 384px</p>
          )}
          <button
            type="button"
            disabled={busy || !rows?.length}
            onClick={print}
            className="mt-4 w-full rounded-lg bg-ink px-4 py-3 text-sm font-medium text-paper transition hover:bg-ink/90 disabled:opacity-50"
          >
            Print
          </button>
          {busy && progress > 0 && (
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink/10">
              <div
                className="h-full bg-ink transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>

        {status && (
          <p className="text-center text-sm text-ink/80" role="status">
            {status}
          </p>
        )}

        {log.length > 0 && (
          <details className="rounded-lg border border-ink/10 bg-ink/[0.02] p-3 text-xs font-mono text-ink/60">
            <summary className="cursor-pointer">BLE log</summary>
            <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto">
              {log.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          </details>
        )}
      </section>
    </main>
  );
}
