import type { Track } from "@/types/music";

export function queueEligibleTracks(tracks: Track[]) {
  return tracks.filter((track) => Boolean(
    track.selected &&
    track.matchStatus === "matched" &&
    track.authorizedSource &&
    track.selectedFormat &&
    track.sourceMatch?.downloadAllowed,
  ));
}
