import { hasBlobCredentials, uploadPublicBlob } from "@/lib/blobClient";
import { NextResponse } from "next/server";

function dataUrlToBuffer(dataUrl: string): { buffer: Buffer; contentType: string } | null {
  const match = /^data:(image\/[\w+.-]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) return null;

  const contentType = match[1]!.toLowerCase();
  const buffer = Buffer.from(match[2]!, "base64");
  return { buffer, contentType };
}

export async function POST(request: Request) {
  if (!hasBlobCredentials()) {
    return NextResponse.json(
      {
        error:
          "Blob storage is not configured for this environment. Add BLOB_READ_WRITE_TOKEN to Development on Vercel, or pull Preview env vars locally.",
      },
      { status: 503 }
    );
  }

  let body: { image?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = typeof body.image === "string" ? dataUrlToBuffer(body.image) : null;
  if (!parsed) {
    return NextResponse.json({ error: "Expected data:image URL" }, { status: 400 });
  }

  const ext =
    parsed.contentType.includes("png")
      ? "png"
      : parsed.contentType.includes("webp")
        ? "webp"
        : "jpg";

  const pathname = `strips/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;

  try {
    const blob = await uploadPublicBlob(pathname, parsed.buffer, {
      contentType: parsed.contentType,
    });
    return NextResponse.json({ url: blob.url });
  } catch (err) {
    console.error("Blob upload failed:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
