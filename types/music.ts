import type { JamendoCandidate, JamendoFormat } from "@/types/jamendo";

export type MatchStatus = "matched" | "review" | "searching" | "unavailable" | "pending";
export type Track = {
  id: string;
  title: string;
  artist: string;
  album: string;
  durationMs: number;
  matchStatus: MatchStatus;
  matchConfidence?: number;
  source?: string;
  spotifyUrl?: string;
  isLocal?: boolean;
  authorizedSource?: boolean;
  selectedFormat?: JamendoFormat | null;
  sourceMatch?: JamendoCandidate;
  selected: boolean;
};

export type Playlist = {
  id: string;
  name: string;
  description: string;
  owner: string;
  image: string;
  spotifyUrl?: string;
  totalTracks?: number;
  nextOffset?: number | null;
  sourceMode?: "spotify" | "mock";
  tracks: Track[];
};
