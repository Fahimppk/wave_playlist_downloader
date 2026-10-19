import assert from "node:assert/strict";
import { test } from "node:test";
import { matchConfidence } from "@/lib/matching";
import { pageInfo } from "@/lib/pagination";
import { selectHighestQuality } from "@/lib/quality";
import { queueEligibleTracks } from "@/lib/download-queue";
import { safeDownloadFilename, uniqueFilename } from "@/lib/filename";
import type { JamendoCandidate } from "@/types/jamendo";
import type { Track } from "@/types/music";

function candidate(overrides: Partial<JamendoCandidate> = {}): JamendoCandidate {
  return {
    id: "12345", title: "Blue Skies", artist: "North Star", album: "Open Road", durationSeconds: 180,
    artworkUrl: null, previewUrl: null, jamendoUrl: null, licenseUrl: null, downloadAllowed: true,
    formats: ["flac", "ogg", "mp32", "mp31"], demo: false, ...overrides,
  };
}

function track(overrides: Partial<Track> = {}): Track {
  return {
    id: "spotify-track", title: "Blue Skies", artist: "North Star", album: "Open Road", durationMs: 180_000,
    matchStatus: "matched", selected: true, authorizedSource: true, selectedFormat: "flac", sourceMatch: candidate(), ...overrides,
  };
}

test("Spotify playlist links reject malformed, non-Spotify, and non-playlist URLs", async () => {
  const { spotifyPlaylistId } = await import("@/lib/spotify");
  assert.equal(spotifyPlaylistId("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M"), "37i9dQZF1DXcBWIGoYBM5M");
  assert.equal(spotifyPlaylistId("https://spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=abc"), "37i9dQZF1DXcBWIGoYBM5M");
  assert.equal(spotifyPlaylistId("https://evil.example/playlist/37i9dQZF1DXcBWIGoYBM5M"), null);
  assert.equal(spotifyPlaylistId("https://open.spotify.com/track/37i9dQZF1DXcBWIGoYBM5M"), null);
  assert.equal(spotifyPlaylistId("not a url"), null);
});

test("Spotify pagination reports next offset only when another page exists", () => {
  assert.deepEqual(pageInfo(0, 50, 122, true), { offset: 0, limit: 50, total: 122, nextOffset: 50 });
  assert.deepEqual(pageInfo(100, 50, 122, false), { offset: 100, limit: 50, total: 122, nextOffset: null });
  assert.equal(pageInfo(0, 50, 0, false).nextOffset, null);
});

test("match ranking gives exact metadata a strong score and unrelated recordings a weak score", () => {
  const exact = matchConfidence({ title: "Blue Skies", artist: "North Star", durationMs: 180_000 }, candidate());
  const unrelated = matchConfidence({ title: "Blue Skies", artist: "North Star", durationMs: 180_000 }, candidate({ title: "A Different Song", artist: "Somebody Else", durationSeconds: 245 }));
  assert.equal(exact, 100);
  assert.ok(unrelated < 65, `unrelated score was ${unrelated}`);
});

test("quality selection ranks only source-permitted formats and respects user restrictions", () => {
  const item = candidate();
  assert.equal(selectHighestQuality(item, "automatic"), "flac");
  assert.equal(selectHighestQuality(item, "lossless_only"), "flac");
  assert.equal(selectHighestQuality(item, "high_quality_lossy"), "mp32");
  assert.equal(selectHighestQuality(candidate({ formats: ["mp31"] }), "high_quality_lossy"), null);
  assert.equal(selectHighestQuality(candidate({ downloadAllowed: false }), "automatic"), null);
});

test("only confirmed, permitted, selected tracks with a chosen format enter the queue", () => {
  assert.equal(queueEligibleTracks([]).length, 0);
  assert.equal(queueEligibleTracks([track()]).length, 1);
  assert.equal(queueEligibleTracks([track({ authorizedSource: false })]).length, 0);
  assert.equal(queueEligibleTracks([track({ selectedFormat: null })]).length, 0);
  assert.equal(queueEligibleTracks([track({ selected: false })]).length, 0);
  assert.equal(queueEligibleTracks([track({ matchStatus: "pending" })]).length, 0);
});

test("filenames are sanitized and duplicate names receive a collision suffix", () => {
  const filename = safeDownloadFilename("CON", "Blue: Skies?", "FLAC");
  assert.equal(filename, "_CON - Blue Skies.flac");
  assert.equal(uniqueFilename(filename, new Set([filename.toLowerCase()])), "_CON - Blue Skies (2).flac");
  assert.equal(uniqueFilename(filename, new Set()), filename);
});
