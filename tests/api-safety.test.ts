import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { rateLimit } from "@/lib/rate-limit";
import { JamendoError, prepareJamendoDownload, searchJamendo } from "@/lib/jamendo";
import { isSpotifyConfigured } from "@/lib/spotify-session";
import { spotifyApiError } from "@/lib/spotify";

const originalFetch = globalThis.fetch;

test("missing Spotify and Jamendo credentials leave integrations unconfigured", async () => {
  const saved = { id: process.env.SPOTIFY_CLIENT_ID, secret: process.env.SPOTIFY_CLIENT_SECRET, redirect: process.env.SPOTIFY_REDIRECT_URI, session: process.env.SESSION_SECRET, jamendo: process.env.JAMENDO_CLIENT_ID };
  delete process.env.SPOTIFY_CLIENT_ID;
  delete process.env.SPOTIFY_CLIENT_SECRET;
  delete process.env.SPOTIFY_REDIRECT_URI;
  delete process.env.SESSION_SECRET;
  delete process.env.JAMENDO_CLIENT_ID;
  try {
    assert.equal(isSpotifyConfigured(), false);
    assert.equal(await searchJamendo("Blue Skies", "North Star"), null);
  } finally {
    if (saved.id) process.env.SPOTIFY_CLIENT_ID = saved.id;
    if (saved.secret) process.env.SPOTIFY_CLIENT_SECRET = saved.secret;
    if (saved.redirect) process.env.SPOTIFY_REDIRECT_URI = saved.redirect;
    if (saved.session) process.env.SESSION_SECRET = saved.session;
    if (saved.jamendo) process.env.JAMENDO_CLIENT_ID = saved.jamendo;
  }
});

test("request rate limiter blocks calls above the configured threshold", () => {
  const key = `rate-test-${randomUUID()}`;
  assert.equal(rateLimit(key, 2, 60_000).allowed, true);
  assert.equal(rateLimit(key, 2, 60_000).allowed, true);
  const limited = rateLimit(key, 2, 60_000);
  assert.equal(limited.allowed, false);
  assert.ok(limited.retryAfter > 0);
});

test("Spotify API distinguishes quota exhaustion from ordinary request throttling", async () => {
  const quotaError = await spotifyApiError(new Response(JSON.stringify({ error: { reason: "QUOTA_EXCEEDED" } }), { status: 429 }));
  const rateError = await spotifyApiError(new Response(JSON.stringify({ error: { reason: "RATE_LIMITED" } }), { status: 429 }));
  assert.equal(quotaError.code, "spotify_quota_exceeded");
  assert.equal(rateError.code, "spotify_rate_limited");
});

test("Spotify playlist endpoint rejects invalid URLs before any API call", async () => {
  const { GET } = await import("@/app/api/spotify/playlist/route");
  const response = await GET(new Request("http://localhost:3000/api/spotify/playlist?url=https%3A%2F%2Fevil.example%2Fplaylist%2Fabc"));
  assert.equal(response.status, 400);
  const data = await response.json() as { code?: string };
  assert.equal(data.code, "invalid_playlist_url");
});

test("Jamendo route returns clearly labeled non-downloadable mock data without credentials", async () => {
  const originalClientId = process.env.JAMENDO_CLIENT_ID;
  delete process.env.JAMENDO_CLIENT_ID;
  try {
    const { POST } = await import("@/app/api/jamendo/search/route");
    const response = await POST(new Request("http://localhost:3000/api/jamendo/search", {
      method: "POST", headers: { Origin: "http://localhost:3000", "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Blue Skies", artist: "North Star" }),
    }));
    assert.equal(response.status, 200);
    const data = await response.json() as { mode?: string; candidates?: { demo: boolean; downloadAllowed: boolean }[] };
    assert.equal(data.mode, "mock");
    assert.equal(data.candidates?.[0].demo, true);
    assert.equal(data.candidates?.[0].downloadAllowed, false);
  } finally {
    if (originalClientId) process.env.JAMENDO_CLIENT_ID = originalClientId;
  }
});

test("Jamendo rejects a track if its current response denies downloading", async () => {
  const originalClientId = process.env.JAMENDO_CLIENT_ID;
  process.env.JAMENDO_CLIENT_ID = "test-client";
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ headers: { status: "success" }, results: [{ id: "12345", audiodownload_allowed: false }] }), { status: 200 });
  };
  try {
    await assert.rejects(prepareJamendoDownload("12345", "flac"), (error: unknown) => error instanceof JamendoError && error.code === "download_not_authorized");
    assert.equal(calls, 1, "the file endpoint must not be called for a forbidden track");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalClientId) process.env.JAMENDO_CLIENT_ID = originalClientId;
    else delete process.env.JAMENDO_CLIENT_ID;
  }
});

test("Jamendo reports a missing format and an interrupted file check without downloading it", async () => {
  const originalClientId = process.env.JAMENDO_CLIENT_ID;
  process.env.JAMENDO_CLIENT_ID = "test-client";
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) return new Response(JSON.stringify({ headers: { status: "success" }, results: [{ id: "12345", audiodownload_allowed: true }] }), { status: 200 });
    return new Response(null, { status: 404 });
  };
  try {
    await assert.rejects(prepareJamendoDownload("12345", "flac"), (error: unknown) => error instanceof JamendoError && error.code === "jamendo_format_unavailable");
    globalThis.fetch = async () => {
      calls += 1;
      if (calls === 3) return new Response(JSON.stringify({ headers: { status: "success" }, results: [{ id: "12345", audiodownload_allowed: true }] }), { status: 200 });
      throw new TypeError("network interrupted");
    };
    await assert.rejects(prepareJamendoDownload("12345", "flac"), (error: unknown) => error instanceof JamendoError && error.code === "jamendo_download_unavailable");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalClientId) process.env.JAMENDO_CLIENT_ID = originalClientId;
    else delete process.env.JAMENDO_CLIENT_ID;
  }
});
