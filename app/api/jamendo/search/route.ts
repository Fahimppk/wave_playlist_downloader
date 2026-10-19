import { NextResponse } from "next/server";
import { searchJamendo, JamendoError, makeJamendoMockCandidate } from "@/lib/jamendo";
import { rateLimit, requestIp } from "@/lib/rate-limit";
import { matchConfidence } from "@/lib/matching";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const limited = rateLimit(`jamendo-search:${requestIp(request)}`, 8, 60 * 1000);
  if (!limited.allowed) return NextResponse.json({ error: "Too many Jamendo searches. Wait briefly and try again.", code: "rate_limited" }, { status: 429, headers: { "Retry-After": String(limited.retryAfter) } });

  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return NextResponse.json({ error: "Request origin is not allowed.", code: "invalid_origin" }, { status: 403 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Expected JSON request data.", code: "invalid_request" }, { status: 400 }); }
  const track = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const title = typeof track.title === "string" ? track.title.trim() : "";
  const artist = typeof track.artist === "string" ? track.artist.trim() : "";
  const durationMs = typeof track.durationMs === "number" && Number.isFinite(track.durationMs) && track.durationMs > 0 ? track.durationMs : undefined;
  if (!title || title.length > 200 || !artist || artist.length > 200) return NextResponse.json({ error: "Track title and artist are required (up to 200 characters each).", code: "invalid_track" }, { status: 400 });

  if (!process.env.JAMENDO_CLIENT_ID) {
    return NextResponse.json({ mode: "mock", candidates: [makeJamendoMockCandidate()], message: "Jamendo is not configured. This example is mock data; permission and formats were not checked." });
  }

  try {
    const candidates = await searchJamendo(title, artist);
    const scoredCandidates = (candidates ?? []).map((candidate) => ({ ...candidate, matchConfidence: matchConfidence({ title, artist, durationMs }, candidate) })).sort((a, b) => (b.matchConfidence ?? 0) - (a.matchConfidence ?? 0));
    return NextResponse.json({ mode: "live", candidates: scoredCandidates, message: "Similarity scores compare metadata only. Confirm the recording before adding a source; formats are listed only when Jamendo's download permission and file endpoint confirm them." });
  } catch (error) {
    if (error instanceof JamendoError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    return NextResponse.json({ error: "Jamendo search failed. Try again later.", code: "jamendo_api_error" }, { status: 502 });
  }
}
