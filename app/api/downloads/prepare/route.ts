import { NextResponse } from "next/server";
import { prepareJamendoDownload, JamendoError } from "@/lib/jamendo";
import { rateLimit, requestIp } from "@/lib/rate-limit";
import { safeDownloadFilename } from "@/lib/filename";
import type { JamendoFormat } from "@/types/jamendo";

export const runtime = "nodejs";
const FORMATS = new Set<JamendoFormat>(["flac", "ogg", "mp32", "mp31"]);

export async function POST(request: Request) {
  const limited = rateLimit(`download-prepare:${requestIp(request)}`, 20, 60 * 1000);
  if (!limited.allowed) return NextResponse.json({ error: "Too many download requests. Wait briefly and try again.", code: "rate_limited" }, { status: 429, headers: { "Retry-After": String(limited.retryAfter) } });
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return NextResponse.json({ error: "Request origin is not allowed.", code: "invalid_origin" }, { status: 403 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Expected JSON request data.", code: "invalid_request" }, { status: 400 }); }
  const input = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const id = typeof input.jamendoId === "string" ? input.jamendoId : "";
  const format = typeof input.format === "string" ? input.format as JamendoFormat : null;
  const artist = typeof input.artist === "string" ? input.artist.slice(0, 200) : "";
  const title = typeof input.title === "string" ? input.title.slice(0, 200) : "";
  if (!/^\d{1,20}$/.test(id) || !format || !FORMATS.has(format) || !artist.trim() || !title.trim()) return NextResponse.json({ error: "A confirmed Jamendo track, permitted format, artist, and title are required.", code: "invalid_download" }, { status: 400 });

  try {
    const url = await prepareJamendoDownload(id, format);
    const filename = safeDownloadFilename(artist, title, format === "mp31" || format === "mp32" ? "mp3" : format);
    return NextResponse.json({ url, filename, format, transfer: "browser-direct" }, { headers: { "Cache-Control": "no-store, private" } });
  } catch (error) {
    if (error instanceof JamendoError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    return NextResponse.json({ error: "Jamendo could not prepare the download.", code: "jamendo_download_error" }, { status: 502 });
  }
}
