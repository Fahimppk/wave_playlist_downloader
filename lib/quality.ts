import type { JamendoCandidate, JamendoFormat } from "@/types/jamendo";

export type QualityMode = "automatic" | "lossless_only" | "high_quality_lossy";

const ORDER: JamendoFormat[] = ["flac", "mp32", "ogg", "mp31"];
const HIGH_QUALITY_LOSSY: JamendoFormat[] = ["mp32", "ogg"];

export function selectHighestQuality(candidate: JamendoCandidate, mode: QualityMode = "automatic"): JamendoFormat | null {
  if (!candidate.downloadAllowed) return null;
  const permittedFormats = new Set(candidate.formats);
  const priority = mode === "lossless_only" ? ["flac"] : mode === "high_quality_lossy" ? HIGH_QUALITY_LOSSY : ORDER;
  return priority.find((format) => permittedFormats.has(format as JamendoFormat)) as JamendoFormat | undefined ?? null;
}

export function formatDetails(format: JamendoFormat) {
  if (format === "flac") return { label: "FLAC", type: "Lossless", bitrate: "Not provided", sampleRate: "Unknown", bitDepth: "Unknown" };
  if (format === "mp31") return { label: "MP3", type: "Lossy", bitrate: "96 kbps (source-declared)", sampleRate: "Unknown", bitDepth: "Not applicable" };
  if (format === "mp32") return { label: "MP3 VBR", type: "Lossy", bitrate: "VBR · bitrate unknown", sampleRate: "Unknown", bitDepth: "Not applicable" };
  return { label: "OGG", type: "Lossy", bitrate: "Unknown", sampleRate: "Unknown", bitDepth: "Not applicable" };
}
