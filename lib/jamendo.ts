import type { JamendoCandidate, JamendoFormat } from "@/types/jamendo";

const API_BASE = "https://api.jamendo.com/v3.0";
const FORMATS: JamendoFormat[] = ["flac", "ogg", "mp32", "mp31"];

type JamendoRawTrack = {
  id: string;
  name: string;
  duration?: string | number;
  artist_name?: string;
  album_name?: string;
  image?: string;
  audio?: string;
  shareurl?: string;
  license_ccurl?: string;
  audiodownload_allowed?: boolean | "true" | "false";
};

type JamendoResponse = {
  headers?: { status?: string; error_message?: string; code?: number };
  results?: JamendoRawTrack[];
};

export class JamendoError extends Error {
  constructor(public code: string, public status: number, message: string) { super(message); }
}

function cleanText(value: unknown, max = 160) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function safeHttpsUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return url.toString();
    if (url.protocol === "http:" && url.hostname.toLowerCase() === "creativecommons.org") {
      url.protocol = "https:";
      return url.toString();
    }
    return null;
  } catch { return null; }
}

function allowedDownload(value: JamendoRawTrack["audiodownload_allowed"]) {
  return value === true || value === "true";
}

async function formatIsOffered(trackId: string, format: JamendoFormat, clientId: string) {
  const url = new URL(`${API_BASE}/tracks/file/`);
  url.search = new URLSearchParams({ client_id: clientId, id: trackId, audioformat: format, action: "download" }).toString();
  try {
    const response = await fetch(url, { method: "GET", redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(8000) });
    const location = response.headers.get("location");
    if (response.status < 300 || response.status >= 400 || !location) return false;
    const redirect = new URL(location, url);
    return redirect.protocol === "https:" && /^prod-\d+\.storage\.jamendo\.com$/i.test(redirect.hostname);
  } catch { return false; }
}

async function candidateFromRaw(raw: JamendoRawTrack, clientId: string): Promise<JamendoCandidate> {
  const downloadAllowed = allowedDownload(raw.audiodownload_allowed);
  const formats = downloadAllowed
    ? (await Promise.all(FORMATS.map(async (format) => await formatIsOffered(raw.id, format, clientId) ? format : null))).filter((format): format is JamendoFormat => format !== null)
    : [];
  const duration = Number(raw.duration);
  return {
    id: raw.id,
    title: cleanText(raw.name, 200) || "Untitled track",
    artist: cleanText(raw.artist_name, 160) || "Unknown artist",
    album: cleanText(raw.album_name, 160) || "Single",
    durationSeconds: Number.isFinite(duration) && duration >= 0 ? duration : null,
    artworkUrl: safeHttpsUrl(raw.image),
    previewUrl: safeHttpsUrl(raw.audio),
    jamendoUrl: safeHttpsUrl(raw.shareurl),
    licenseUrl: safeHttpsUrl(raw.license_ccurl),
    downloadAllowed: downloadAllowed && formats.length > 0,
    formats,
    demo: false,
  };
}

export async function searchJamendo(title: string, artist: string) {
  const clientId = process.env.JAMENDO_CLIENT_ID;
  if (!clientId) return null;

  const url = new URL(`${API_BASE}/tracks/`);
  url.search = new URLSearchParams({
    client_id: clientId,
    format: "json",
    limit: "5",
    namesearch: title,
    artist_name: artist,
    type: "single albumtrack",
    include: "licenses",
    audiodlformat: "mp32",
  }).toString();

  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(12_000) });
  if (!response.ok) {
    if (response.status === 429) throw new JamendoError("jamendo_rate_limited", 429, "Jamendo is rate limiting requests. Wait briefly and try again.");
    throw new JamendoError("jamendo_api_error", 502, "Jamendo could not complete the search. Try again later.");
  }
  const data = await response.json() as JamendoResponse;
  if (data.headers?.status !== "success") {
    throw new JamendoError("jamendo_api_error", 502, cleanText(data.headers?.error_message, 240) || "Jamendo returned an error.");
  }

  const results = (data.results ?? []).filter((track) => /^\d+$/.test(track.id) && cleanText(track.name) && cleanText(track.artist_name));
  const candidates = await Promise.all(results.map((track) => candidateFromRaw(track, clientId)));
  return candidates;
}

export async function prepareJamendoDownload(trackId: string, format: JamendoFormat) {
  const clientId = process.env.JAMENDO_CLIENT_ID;
  if (!clientId) throw new JamendoError("jamendo_not_configured", 503, "Jamendo is not configured.");
  if (!/^\d{1,20}$/.test(trackId) || !FORMATS.includes(format)) throw new JamendoError("invalid_download", 400, "Invalid Jamendo track or format.");

  const permissionUrl = new URL(`${API_BASE}/tracks/`);
  permissionUrl.search = new URLSearchParams({ client_id: clientId, format: "json", id: trackId, limit: "1" }).toString();
  const permissionResponse = await fetch(permissionUrl, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!permissionResponse.ok) throw new JamendoError("jamendo_api_error", 502, "Could not verify Jamendo download permission.");
  const permissionData = await permissionResponse.json() as JamendoResponse;
  if (permissionData.headers?.status !== "success") throw new JamendoError("jamendo_api_error", 502, permissionData.headers?.error_message || "Jamendo could not verify this track.");
  const providerTrack = permissionData.results?.find((track) => track.id === trackId);
  if (!providerTrack || !allowedDownload(providerTrack.audiodownload_allowed)) throw new JamendoError("download_not_authorized", 403, "Jamendo does not currently permit downloading this track.");

  const downloadEndpoint = new URL(`${API_BASE}/tracks/file/`);
  downloadEndpoint.search = new URLSearchParams({ client_id: clientId, id: trackId, audioformat: format, action: "download" }).toString();
  let response: Response;
  try {
    response = await fetch(downloadEndpoint, { redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new JamendoError("jamendo_download_unavailable", 502, "Jamendo could not prepare this download.");
  }
  const location = response.headers.get("location");
  if (response.status < 300 || response.status >= 400 || !location) throw new JamendoError("jamendo_format_unavailable", 404, "Jamendo no longer offers this format for the selected track.");
  const target = new URL(location, downloadEndpoint);
  if (target.protocol !== "https:" || !/^prod-\d+\.storage\.jamendo\.com$/i.test(target.hostname)) {
    throw new JamendoError("jamendo_redirect_rejected", 502, "Jamendo returned an unexpected download location.");
  }
  return target.toString();
}

export function makeJamendoMockCandidate(): JamendoCandidate {
  return {
    id: "mock-result",
    title: "Example search result",
    artist: "No live Jamendo data",
    album: "Demo only",
    durationSeconds: null,
    artworkUrl: null,
    previewUrl: null,
    jamendoUrl: null,
    licenseUrl: null,
    downloadAllowed: false,
    formats: [],
    demo: true,
  };
}
