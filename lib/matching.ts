import type { JamendoCandidate } from "@/types/jamendo";

function normalize(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(feat\.?|featuring|ft\.?)\b.*$/g, " ")
    .replace(/\b(remaster(?:ed)?|radio edit|live version|mono|stereo|official audio|lyrics?)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function editSimilarity(a: string, b: string) {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let row = 1; row <= a.length; row += 1) {
    const current = [row];
    for (let col = 1; col <= b.length; col += 1) {
      current[col] = Math.min(current[col - 1] + 1, previous[col] + 1, previous[col - 1] + (a[row - 1] === b[col - 1] ? 0 : 1));
    }
    for (let col = 0; col <= b.length; col += 1) previous[col] = current[col];
  }
  return 1 - previous[b.length] / Math.max(a.length, b.length);
}

function tokenSimilarity(a: string, b: string) {
  const left = new Set(a.split(" ").filter(Boolean));
  const right = new Set(b.split(" ").filter(Boolean));
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  return (2 * intersection) / (left.size + right.size);
}

function textSimilarity(left: string, right: string) {
  const a = normalize(left);
  const b = normalize(right);
  if (a === b && a) return 1;
  return editSimilarity(a, b) * 0.7 + tokenSimilarity(a, b) * 0.3;
}

export function matchConfidence(source: { title: string; artist: string; durationMs?: number }, candidate: JamendoCandidate) {
  const titleScore = textSimilarity(source.title, candidate.title);
  const artistScore = textSimilarity(source.artist, candidate.artist);
  const durationScore = source.durationMs && candidate.durationSeconds
    ? Math.max(0, 1 - Math.abs(source.durationMs / 1000 - candidate.durationSeconds) / 45)
    : 0.5;
  const title = normalize(source.title);
  const candidateTitle = normalize(candidate.title);
  const artist = normalize(source.artist);
  const candidateArtist = normalize(candidate.artist);
  const exactTitleArtist = title && title === candidateTitle && artist && artist === candidateArtist;
  const score = exactTitleArtist ? 1 : titleScore * 0.64 + artistScore * 0.33 + durationScore * 0.03;
  return Math.round(Math.max(0, Math.min(1, score)) * 100);
}

export function matchBand(confidence: number) {
  if (confidence >= 85) return "strong" as const;
  if (confidence >= 65) return "possible" as const;
  return "weak" as const;
}
