import { clearSpotifySession, getSpotifySession, setSpotifySession, type SpotifySession } from "@/lib/spotify-session";

type TokenResponse = { access_token: string; refresh_token?: string; expires_in: number };

export class SpotifyError extends Error {
  constructor(public code: string, public status: number, message: string) { super(message); }
}

function credentials() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new SpotifyError("spotify_not_configured", 503, "Spotify API credentials are not configured.");
  return { clientId, clientSecret };
}

async function refreshSession(session: SpotifySession): Promise<SpotifySession> {
  const { clientId, clientSecret } = credentials();
  const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: session.refreshToken });
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  if (!response.ok) {
    await clearSpotifySession();
    throw new SpotifyError("spotify_reauthorization_required", 401, "Spotify authorization expired. Connect Spotify again.");
  }
  const token = await response.json() as TokenResponse;
  const updated = { accessToken: token.access_token, refreshToken: token.refresh_token ?? session.refreshToken, expiresAt: Date.now() + token.expires_in * 1000 };
  await setSpotifySession(updated);
  return updated;
}

export async function spotifyFetch(url: string): Promise<Response> {
  let session = await getSpotifySession();
  if (!session) throw new SpotifyError("spotify_not_connected", 401, "Connect your Spotify account to import this playlist.");
  if (session.expiresAt < Date.now() + 60_000) session = await refreshSession(session);
  let response = await fetch(url, { headers: { Authorization: `Bearer ${session.accessToken}` }, cache: "no-store" });
  if (response.status === 401) {
    session = await refreshSession(session);
    response = await fetch(url, { headers: { Authorization: `Bearer ${session.accessToken}` }, cache: "no-store" });
  }
  return response;
}

export async function spotifyApiError(response: Response) {
  if (response.status === 401) return new SpotifyError("spotify_reauthorization_required", 401, "Spotify authorization expired. Connect Spotify again.");
  if (response.status === 403) return new SpotifyError("spotify_playlist_forbidden", 403, "Spotify only provides playlist items to the playlist owner or a collaborator. Check playlist access and your Spotify app permissions.");
  if (response.status === 404) return new SpotifyError("spotify_playlist_not_found", 404, "Playlist not found or unavailable to this Spotify account.");
  if (response.status === 429) {
    const payload = await response.json().catch(() => null) as { error?: { reason?: string } } | null;
    if (payload?.error?.reason === "QUOTA_EXCEEDED") return new SpotifyError("spotify_quota_exceeded", 429, "Spotify's development-mode quota is exhausted. Wait for it to reset or check the app's quota mode.");
    return new SpotifyError("spotify_rate_limited", 429, "Spotify is rate limiting requests. Wait briefly and try again.");
  }
  return new SpotifyError("spotify_api_error", 502, "Spotify could not complete the request. Try again later.");
}

export function spotifyPlaylistId(input: unknown) {
  if (typeof input !== "string") return null;
  try {
    const url = new URL(input.trim());
    if (!(["open.spotify.com", "spotify.com", "www.spotify.com"].includes(url.hostname.toLowerCase()))) return null;
    const match = url.pathname.match(/^\/(?:intl-[a-z]{2}\/)?playlist\/([A-Za-z0-9]{22})\/?$/i);
    return match?.[1] ?? null;
  } catch { return null; }
}
