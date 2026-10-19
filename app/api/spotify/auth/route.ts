import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { rateLimit, requestIp } from "@/lib/rate-limit";
import { isSpotifyConfigured } from "@/lib/spotify-session";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const limit = rateLimit(`spotify-auth:${requestIp(request)}`, 10, 15 * 60 * 1000);
  if (!limit.allowed) return NextResponse.json({ error: "Too many Spotify connection attempts. Try again shortly." }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  if (!isSpotifyConfigured()) return NextResponse.json({ error: "Spotify is not configured. Add the required server-side environment variables." }, { status: 503 });

  const state = randomBytes(24).toString("base64url");
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI!;
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.SPOTIFY_CLIENT_ID!,
    scope: "playlist-read-private",
    redirect_uri: redirectUri,
    state,
  });
  const response = NextResponse.redirect(`https://accounts.spotify.com/authorize?${params}`);
  response.cookies.set("wave_spotify_oauth_state", state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 600 });
  return response;
}
