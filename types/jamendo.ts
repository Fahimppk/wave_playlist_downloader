export type JamendoFormat = "flac" | "ogg" | "mp32" | "mp31";

export type JamendoCandidate = {
  id: string;
  title: string;
  artist: string;
  album: string;
  durationSeconds: number | null;
  artworkUrl: string | null;
  previewUrl: string | null;
  jamendoUrl: string | null;
  licenseUrl: string | null;
  downloadAllowed: boolean;
  formats: JamendoFormat[];
  matchConfidence?: number;
  demo: boolean;
};

export type JamendoSearchResponse = {
  mode: "live" | "mock";
  candidates: JamendoCandidate[];
  message?: string;
};
