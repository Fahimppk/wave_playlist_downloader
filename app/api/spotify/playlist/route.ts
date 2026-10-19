import { NextResponse } from "next/server";
import { rateLimit, requestIp } from "@/lib/rate-limit";
import { spotifyApiError, spotifyFetch, spotifyPlaylistId, SpotifyError } from "@/lib/spotify";
import { pageInfo } from "@/lib/pagination";

export const runtime = "nodejs";
const PAGE_SIZE = 50;

type SpotifyTrack = { id: string | null; name: string; duration_ms: number; artists: { name: string }[]; album: { name: string; images?: { url: string }[] } };
type SpotifyPlaylist = { id: string; name: string; description: string | null; owner: { display_name: string | null; id: string }; images: { url: string }[]; external_urls: { spotify: string }; public: boolean | null; items?: { total: number } };
type SpotifyItems = { items: { item: SpotifyTrack | null; is_local?: boolean }[]; total: number; next: string | null };

function errorResponse(error: unknown) {
  if (error instanceof SpotifyError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  return NextResponse.json({ error: "Spotify could not complete the request.", code: "spotify_api_error" }, { status: 502 });
}

export async function GET(request: Request) {
  const limit = rateLimit(`spotify-playlist:${requestIp(request)}`, 30, 60 * 1000);
  if (!limit.allowed) return NextResponse.json({ error: "Too many playlist requests. Try again shortly.", code: "rate_limited" }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  const url = new URL(request.url);
  const playlistId = spotifyPlaylistId(url.searchParams.get("url"));
  const offsetText = url.searchParams.get("offset") ?? "0";
  const offset = Number(offsetText);
  if (!playlistId) return NextResponse.json({ error: "Enter a valid Spotify playlist URL.", code: "invalid_playlist_url" }, { status: 400 });
  if (!Number.isInteger(offset) || offset < 0 || offset > 100_000) return NextResponse.json({ error: "Invalid playlist page offset.", code: "invalid_offset" }, { status: 400 });

  try {
    const detailResponse = await spotifyFetch(`https://api.spotify.com/v1/playlists/${playlistId}?fields=id,name,description,owner,images,external_urls,public,items.total`);
    if (!detailResponse.ok) throw await spotifyApiError(detailResponse);
    const playlist = await detailResponse.json() as SpotifyPlaylist;
    const itemsResponse = await spotifyFetch(`https://api.spotify.com/v1/playlists/${playlistId}/items?limit=${PAGE_SIZE}&offset=${offset}&additional_types=track&fields=items(item(id,name,duration_ms,artists(name),album(name,images)),is_local),total,next`);
    if (!itemsResponse.ok) throw await spotifyApiError(itemsResponse);
    const items = await itemsResponse.json() as SpotifyItems;
    const tracks = items.items.map(({ item, is_local }, index) => item ? {
      id: item.id ?? `local-${offset + index}`,
      title: item.name,
      artist: item.artists.map((artist) => artist.name).join(", ") || "Unknown artist",
      album: item.album.name || "Unknown album",
      durationMs: item.duration_ms,
      matchStatus: "pending" as const,
      selected: true,
      spotifyUrl: item.id ? `https://open.spotify.com/track/${item.id}` : undefined,
      isLocal: Boolean(is_local),
    } : null).filter((track) => track !== null);
    return NextResponse.json({
      playlist: {
        id: playlist.id,
        name: playlist.name,
        description: playlist.description ?? "",
        owner: playlist.owner.display_name ?? playlist.owner.id,
        image: playlist.images[0]?.url ?? "",
        spotifyUrl: playlist.external_urls.spotify,
        tracks,
      },
      pagination: pageInfo(offset, PAGE_SIZE, items.total, Boolean(items.next)),
      skippedItems: items.items.length - tracks.length,
      notice: "Spotify metadata only. This does not provide Spotify audio or confirm that another source has authorized a recording.",
    });
  } catch (error) {
    return errorResponse(error);
  }
}
