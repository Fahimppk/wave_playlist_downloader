import { NextResponse } from "next/server";
import { getSpotifySession, isSpotifyConfigured } from "@/lib/spotify-session";

export const runtime = "nodejs";

export async function GET() {
  const configured = isSpotifyConfigured();
  const session = configured ? await getSpotifySession() : null;
  return NextResponse.json({ configured, connected: Boolean(session), mode: configured ? "spotify" : "mock" });
}
