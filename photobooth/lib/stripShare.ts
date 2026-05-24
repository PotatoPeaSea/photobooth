import QRCode from "qrcode";

const BLOB_HOST = ".public.blob.vercel-storage.com";

export function isAllowedShareUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" && parsed.hostname.endsWith(BLOB_HOST)
    );
  } catch {
    return false;
  }
}

export async function uploadStripShare(imageDataUrl: string): Promise<string> {
  const res = await fetch("/api/share", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: imageDataUrl }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "Share upload failed");
  }
  const { url } = (await res.json()) as { url: string };
  return url;
}

/** Booth save page — nicer on mobile than opening the raw blob URL. */
export function buildShareViewUrl(origin: string, blobUrl: string): string {
  return `${origin}/view?u=${encodeURIComponent(blobUrl)}`;
}

export async function createStripShareQr(
  imageDataUrl: string,
  origin: string
): Promise<string> {
  const blobUrl = await uploadStripShare(imageDataUrl);
  const viewUrl = buildShareViewUrl(origin, blobUrl);
  return QRCode.toDataURL(viewUrl, {
    margin: 1,
    width: 112,
    errorCorrectionLevel: "M",
  });
}
