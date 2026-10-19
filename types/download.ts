import type { JamendoFormat } from "@/types/jamendo";

export type DownloadStatus = "queued" | "preparing" | "sent" | "confirmed" | "failed" | "cancelled";

export type DownloadQueueItem = {
  id: string;
  trackId: string;
  title: string;
  artist: string;
  jamendoId: string;
  format: JamendoFormat;
  filename: string;
  status: DownloadStatus;
  error?: string;
};

export type DownloadHistoryEntry = {
  id: string;
  title: string;
  artist: string;
  filename: string;
  format: JamendoFormat;
  confirmedAt: string;
  status: "confirmed_saved_by_user";
};
