"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BracketButton } from "@/components/brand/Brand";
import { useCamera } from "@/components/booth/hooks";
import { fetchDebug, restartCameraFeed, type DebugInfo } from "./staffApi";

type Notice = { tone: "ok" | "error" | "busy"; text: string };

const NOTICE_TONE: Record<Notice["tone"], string> = {
  ok: "text-[#1FA36A]",
  error: "text-sh-orange",
  busy: "text-sh-black/70",
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-[1rem] text-[1rem]">
      <span className="text-sh-black/60">{label}</span>
      <span className="text-right font-semibold">{children}</span>
    </div>
  );
}

function StateText({ state }: { state: string }) {
  return <span className={state === "active" ? "text-[#1FA36A]" : "text-sh-orange"}>{state}</span>;
}

/** Live view straight from the browser camera, so staff can check the feed without a guest run. */
function CameraPreview() {
  const camera = useCamera(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const stream = camera.state.status === "live" ? camera.state.stream : null;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    if (stream) void video.play().catch(() => {});
  }, [stream]);

  const label =
    camera.state.status === "error"
      ? camera.state.message
      : camera.state.status === "live"
        ? null
        : camera.state.status === "reconnecting"
          ? "Reconnecting…"
          : "Starting camera…";

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-card bg-sh-black">
      <video ref={videoRef} className="absolute inset-0 h-full w-full -scale-x-100 object-cover" playsInline muted />
      {label && (
        <div className="absolute inset-0 flex items-center justify-center p-[1rem] text-center text-[1rem] font-medium text-sh-white/80">
          {label}
        </div>
      )}
      <button
        type="button"
        onClick={camera.restart}
        className="absolute bottom-[0.5rem] right-[0.5rem] rounded-[0.6rem] bg-sh-white/90 px-[0.8rem] py-[0.4rem] text-[0.9rem] font-semibold text-sh-black"
      >
        Reopen in browser
      </button>
    </div>
  );
}

/**
 * Debug tab: where to ssh in, the Wi-Fi the booth is on (with a jump to the Wi-Fi tab),
 * and the camera feed: its state, a full restart of photobooth-webcam, and a live preview.
 */
export default function DebugTab({
  pin,
  visible,
  onOpenWifi,
}: {
  pin: string;
  /** Opened tabs stay mounted while hidden; the preview closes so the camera isn't held open. */
  visible: boolean;
  onOpenWifi: () => void;
}) {
  const [info, setInfo] = useState<DebugInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [restarting, setRestarting] = useState(false);
  const [preview, setPreview] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetchDebug(pin);
    setLoading(false);
    if (res.ok) {
      setInfo(res.data);
      setLoadError(null);
    } else {
      setLoadError(res.error);
    }
  }, [pin]);

  useEffect(() => {
    if (visible) void load();
    else setPreview(false);
  }, [visible, load]);

  async function restart() {
    // The preview holds the camera device open; close it so the restarted feed starts clean.
    setPreview(false);
    setRestarting(true);
    setNotice({ tone: "busy", text: "Restarting the camera feed…" });
    const res = await restartCameraFeed(pin);
    setRestarting(false);
    if (res.ok) setNotice({ tone: res.data.ok ? "ok" : "error", text: res.data.message });
    else setNotice({ tone: "error", text: res.error });
    void load();
  }

  const net = info?.network;
  const cam = info?.camera;
  const ipv4 = net?.addresses.filter((a) => a.family === "IPv4") ?? [];
  const ipv6 = net?.addresses.filter((a) => a.family === "IPv6") ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[0.8rem] overflow-y-auto" data-testid="debug-tab">
      <div className="flex items-center justify-between gap-[1rem]">
        {loadError ? (
          <p role="alert" className="text-[0.95rem] font-semibold text-sh-orange">
            {loadError}
          </p>
        ) : (
          <span />
        )}
        <BracketButton variant="secondary" onClick={() => void load()} disabled={loading}>
          {loading ? "Refreshing" : "Refresh"}
        </BracketButton>
      </div>

      <div className="grid gap-[0.8rem] md:grid-cols-2">
        <section aria-labelledby="debug-ssh" className="flex flex-col gap-[0.6rem] rounded-card bg-sh-black/[0.05] p-[1.1rem]">
          <h2 id="debug-ssh" className="type-display text-[1.6rem] leading-none">
            SSH
          </h2>
          {net ? (
            <>
              {ipv4.length === 0 && <p className="text-[1rem] font-semibold text-sh-orange">No network address</p>}
              {ipv4.map((a) => (
                <div key={a.iface + a.address}>
                  <p className="select-all font-mono text-[1.35rem] font-bold leading-tight">
                    ssh {net.user}@{a.address}
                  </p>
                  <p className="text-[0.85rem] text-sh-black/60">{a.iface}</p>
                </div>
              ))}
              <p className="select-all font-mono text-[1rem]">
                ssh {net.user}@{net.hostname}.local
              </p>
              {ipv6.map((a) => (
                <p key={a.iface + a.address} className="break-all font-mono text-[0.8rem] text-sh-black/60">
                  {a.iface}: {a.address}
                </p>
              ))}
              <Row label="SSH service">
                <StateText state={net.ssh} />
              </Row>
            </>
          ) : (
            <p className="text-sh-black/60">{loading ? "Loading…" : "No data"}</p>
          )}
        </section>

        <section aria-labelledby="debug-wifi" className="flex flex-col gap-[0.6rem] rounded-card bg-sh-black/[0.05] p-[1.1rem]">
          <h2 id="debug-wifi" className="type-display text-[1.6rem] leading-none">
            Wi-Fi
          </h2>
          <Row label="Connected to">
            {net ? net.wifi ?? <span className="text-sh-orange">Not connected</span> : "…"}
          </Row>
          <div>
            <BracketButton onClick={onOpenWifi}>Connect to Wi-Fi</BracketButton>
          </div>
        </section>
      </div>

      <section aria-labelledby="debug-camera" className="flex flex-col gap-[0.6rem] rounded-card bg-sh-black/[0.05] p-[1.1rem]">
        <h2 id="debug-camera" className="type-display text-[1.6rem] leading-none">
          Camera
        </h2>
        {cam && (
          <div className="grid gap-x-[2rem] gap-y-[0.3rem] md:grid-cols-3">
            <Row label="Feed service">
              <StateText state={cam.service} />
            </Row>
            <Row label="Source">{cam.canonOnUsb ? "Canon DSLR" : "Pi Camera"}</Row>
            <Row label={cam.device}>
              {cam.deviceExists ? "present" : <span className="text-sh-orange">missing</span>}
            </Row>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-[0.6rem]">
          <BracketButton onClick={() => void restart()} disabled={restarting}>
            {restarting ? "Restarting" : "Reinitialize camera"}
          </BracketButton>
          <BracketButton variant="secondary" onClick={() => setPreview((on) => !on)} disabled={restarting}>
            {preview ? "Hide preview" : "Test camera"}
          </BracketButton>
        </div>
        {notice && (
          <p role="status" className={`text-[1rem] font-semibold ${NOTICE_TONE[notice.tone]}`}>
            {notice.text}
          </p>
        )}
        {preview && <CameraPreview />}
        {cam && cam.log.length > 0 && (
          <details>
            <summary className="cursor-pointer text-[0.95rem] font-semibold">Webcam log</summary>
            <pre className="mt-[0.4rem] max-h-[12rem] overflow-auto whitespace-pre-wrap rounded-[0.6rem] bg-sh-black p-[0.7rem] font-mono text-[0.75rem] text-sh-white/90">
              {cam.log.join("\n")}
            </pre>
          </details>
        )}
      </section>
    </div>
  );
}
