import { NextResponse } from "next/server";
import { rateLimit, requestIp } from "@/lib/rate-limit";
import { setSpotifySession } from "@/lib/spotify-session";

export const runtime = "nodejs";
type TokenResponse = { access_token: string; refresh_token: string; expires_in: number };

function returnToApp(request: Request, status: string) {
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI;
  const origin = redirectUri ? new URL(redirectUri).origin : new URL(request.url).origin;
  const url = new URL("/", origin);
  url.searchParams.set("spotify", status);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const limit = rateLimit(`spotify-callback:${requestIp(request)}`, 20, 15 * 60 * 1000);
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  const expectedState = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith("wave_spotify_oauth_state="))?.slice("wave_spotify_oauth_state=".length);
  const clearAndReturn = (status: string) => {
    const response = returnToApp(request, status);
    response.cookies.delete("wave_spotify_oauth_state");
    return response;
  };
  if (!limit.allowed) return clearAndReturn("rate_limited");
  if (!state || !expectedState || state !== decodeURIComponent(expectedState)) return clearAndReturn("state_error");
  if (url.searchParams.get("error")) return clearAndReturn("cancelled");
  const code = url.searchParams.get("code");
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI;
  if (!code || !clientId || !clientSecret || !redirectUri) return clearAndReturn("config_error");

  try {
    const body = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
    const tokenResponse = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    });
    if (!tokenResponse.ok) return clearAndReturn("token_error");
    const token = await tokenResponse.json() as TokenResponse;
    await setSpotifySession({ accessToken: token.access_token, refreshToken: token.refresh_token, expiresAt: Date.now() + token.expires_in * 1000 });
    return clearAndReturn("connected");
  } catch {
    return clearAndReturn("token_error");
  }
}
