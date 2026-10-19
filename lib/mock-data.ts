import type { Playlist } from "@/types/music";

export const demoPlaylists: Playlist[] = [
  {
    id: "night-drive", name: "Night drive, no destination", description: "For the long way home.", owner: "you", image: "#8257d8",
    tracks: [
      { id: "t1", title: "Midnight City", artist: "M83", album: "Hurry Up, We're Dreaming", durationMs: 244000, matchStatus: "pending", selected: true },
      { id: "t2", title: "The Less I Know The Better", artist: "Tame Impala", album: "Currents", durationMs: 216000, matchStatus: "pending", selected: true },
      { id: "t3", title: "Space Song", artist: "Beach House", album: "Depression Cherry", durationMs: 320000, matchStatus: "pending", selected: true },
      { id: "t4", title: "A Real Hero", artist: "College & Electric Youth", album: "Drive (Original Motion Picture Soundtrack)", durationMs: 249000, matchStatus: "pending", selected: true },
      { id: "t5", title: "Sunset Lover", artist: "Petit Biscuit", album: "Presence", durationMs: 237000, matchStatus: "pending", selected: true },
      { id: "t6", title: "Intro", artist: "The xx", album: "xx", durationMs: 126000, matchStatus: "pending", selected: true },
      { id: "t7", title: "Open Eye Signal", artist: "Jon Hopkins", album: "Immunity", durationMs: 467000, matchStatus: "pending", selected: true },
      { id: "t8", title: "Nightcall", artist: "Kavinsky", album: "OutRun", durationMs: 258000, matchStatus: "pending", selected: true },
      { id: "t9", title: "Tadow", artist: "Masego & FKJ", album: "Lady Lady", durationMs: 305000, matchStatus: "pending", selected: true },
      { id: "t10", title: "Weightless", artist: "Marconi Union", album: "Weightless", durationMs: 510000, matchStatus: "pending", selected: true },
    ],
  },
  {
    id: "soft-focus", name: "Soft focus", description: "A little room to breathe.", owner: "you", image: "#b98660",
    tracks: [
      { id: "s1", title: "Cherry Wine", artist: "Hozier", album: "Take Me to Church EP", durationMs: 240000, matchStatus: "pending", selected: true },
      { id: "s2", title: "Moon Song", artist: "Phoebe Bridgers", album: "Punisher", durationMs: 270000, matchStatus: "pending", selected: true },
      { id: "s3", title: "Roslyn", artist: "Bon Iver & St. Vincent", album: "The Twilight Saga: New Moon", durationMs: 281000, matchStatus: "pending", selected: true },
      { id: "s4", title: "Holocene", artist: "Bon Iver", album: "Bon Iver, Bon Iver", durationMs: 336000, matchStatus: "pending", selected: true },
    ],
  },
];

export function formatDuration(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
}
