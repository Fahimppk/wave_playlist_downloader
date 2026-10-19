import { NextResponse } from "next/server";
import { clearSpotifySession } from "@/lib/spotify-session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  await clearSpotifySession();
  return NextResponse.json({ disconnected: true });
}
