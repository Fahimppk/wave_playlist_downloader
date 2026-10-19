import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wave — Playlist Downloader",
  description: "Find authorized audio sources for your playlists.",
};

export const viewport: Viewport = { themeColor: "#10120f", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
