"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine, ArrowLeft, AudioLines, Check, CheckCheck, ChevronDown, CircleHelp,
  Clock3, Disc3, Download, ExternalLink, Headphones, History, Info, Link2, ListMusic,
  LoaderCircle, Menu, MoreHorizontal, Music2, Pause, Play, Search, Settings2, ShieldCheck,
  SlidersHorizontal, Sparkles, X,
} from "lucide-react";
import { demoPlaylists, formatDuration } from "@/lib/mock-data";
import type { MatchStatus, Playlist, Track } from "@/types/music";
import type { JamendoSearchResponse } from "@/types/jamendo";
import type { QualityMode } from "@/lib/quality";
import { formatDetails, selectHighestQuality } from "@/lib/quality";
import { matchBand } from "@/lib/matching";
import { safeDownloadFilename, uniqueFilename } from "@/lib/filename";
import { queueEligibleTracks } from "@/lib/download-queue";
import type { DownloadQueueItem } from "@/types/download";
import type { DownloadHistoryEntry } from "@/types/download";
import { strToU8, zipSync } from "fflate";

type View = "library" | "playlist" | "downloads" | "history" | "settings";

const statusText: Record<MatchStatus, string> = { matched: "Good match", review: "Review match", searching: "Searching", unavailable: "Unavailable", pending: "Not searched" };

export default function Home() {
  const [playlists, setPlaylists] = useState<Playlist[]>(demoPlaylists);
  const [activePlaylistId, setActivePlaylistId] = useState(demoPlaylists[0].id);
  const [view, setView] = useState<View>("library");
  const [url, setUrl] = useState("");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [urlError, setUrlError] = useState("");
  const [importing, setImporting] = useState(false);
  const [filter, setFilter] = useState("All tracks");
  const [quality, setQuality] = useState("Automatic · highest quality");
  const [mobileNav, setMobileNav] = useState(false);
  const [downloadQueue, setDownloadQueue] = useState<DownloadQueueItem[]>([]);
  const [downloadHistory, setDownloadHistory] = useState<DownloadHistoryEntry[]>([]);
  const downloadQueueRef = useRef<DownloadQueueItem[]>([]);
  const [queueRunning, setQueueRunning] = useState(false);
  const [queuePaused, setQueuePaused] = useState(false);
  const pauseQueueRef = useRef(false);
  const [handoffBatchSize, setHandoffBatchSize] = useState(3);
  const [spotifyConfigured, setSpotifyConfigured] = useState(false);
  const [spotifyConnected, setSpotifyConnected] = useState(false);
  const [jamendoConfigured, setJamendoConfigured] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [jamendoResults, setJamendoResults] = useState<Record<string, JamendoSearchResponse>>({});
  const [openJamendoTrackId, setOpenJamendoTrackId] = useState<string | null>(null);
  const [searchingJamendoTrackId, setSearchingJamendoTrackId] = useState<string | null>(null);

  useEffect(() => {
    const loadStatus = () => fetch("/api/spotify/status").then((response) => response.json()).then((data: { configured?: boolean; connected?: boolean }) => {
      setSpotifyConfigured(Boolean(data.configured)); setSpotifyConnected(Boolean(data.connected));
    }).catch(() => { setSpotifyConfigured(false); setSpotifyConnected(false); });
    void loadStatus();
    fetch("/api/jamendo/status").then((response) => response.json()).then((data: { configured?: boolean }) => setJamendoConfigured(Boolean(data.configured))).catch(() => setJamendoConfigured(false));
    const params = new URLSearchParams(window.location.search);
    const authStatus = params.get("spotify");
    if (authStatus) {
      const messages: Record<string, string> = { connected: "Spotify connected. You can import playlists you own or collaborate on.", cancelled: "Spotify connection was cancelled.", state_error: "Spotify sign-in could not be verified. Please try again.", token_error: "Spotify authorization failed. Check your app settings and redirect URI.", config_error: "Spotify environment configuration is incomplete.", rate_limited: "Too many connection attempts. Wait a moment and try again." };
      setNotice(messages[authStatus] ?? "Spotify connection could not be completed.");
      window.setTimeout(() => setNotice(""), 5000);
      window.history.replaceState({}, "", window.location.pathname);
      void loadStatus();
    }
  }, []);

  useEffect(() => {
    try {
      const savedHistory = localStorage.getItem("wave_download_history_v1");
      const savedSettings = localStorage.getItem("wave_settings_v1");
      if (savedHistory) {
        const parsed = JSON.parse(savedHistory) as DownloadHistoryEntry[];
        if (Array.isArray(parsed)) setDownloadHistory(parsed.filter((item) => item && typeof item.id === "string" && typeof item.title === "string" && typeof item.artist === "string" && typeof item.filename === "string" && typeof item.confirmedAt === "string" && item.status === "confirmed_saved_by_user" && ["flac", "ogg", "mp32", "mp31"].includes(item.format)).slice(0, 500));
      }
      if (savedSettings) {
        const parsed = JSON.parse(savedSettings) as { quality?: string; handoffBatchSize?: number };
        if (["Automatic · highest quality", "Lossless only", "High-quality lossy"].includes(parsed.quality ?? "")) setQuality(parsed.quality!);
        if ([1, 2, 3, 5].includes(parsed.handoffBatchSize ?? 0)) setHandoffBatchSize(parsed.handoffBatchSize!);
      }
    } catch { /* Keep the app usable if local storage is unavailable or malformed. */ }
  }, []);

  const activePlaylist = playlists.find((playlist) => playlist.id === activePlaylistId) ?? playlists[0];
  const updateTracks = (updater: (tracks: Track[]) => Track[]) => setPlaylists((items) => items.map((p) => p.id === activePlaylistId ? { ...p, tracks: updater(p.tracks) } : p));
  const filteredTracks = useMemo(() => activePlaylist.tracks.filter((track) => {
    const matchesQuery = `${track.title} ${track.artist} ${track.album}`.toLowerCase().includes(query.toLowerCase());
    const matchesFilter = filter === "All tracks" || (filter === "Available" && track.matchStatus === "matched") || (filter === "Needs review" && track.matchStatus === "review") || (filter === "Unavailable" && track.matchStatus === "unavailable");
    return matchesQuery && matchesFilter;
  }), [activePlaylist, filter, query]);
  const selectedCount = queueEligibleTracks(activePlaylist.tracks).length;
  const matchedCount = activePlaylist.tracks.filter((t) => t.matchStatus === "matched" && t.authorizedSource && t.selectedFormat).length;

  function showNotice(message: string) { setNotice(message); window.setTimeout(() => setNotice(""), 3200); }
  function updateDownloadQueue(updater: (items: DownloadQueueItem[]) => DownloadQueueItem[]) {
    setDownloadQueue((items) => {
      const updated = updater(items);
      downloadQueueRef.current = updated;
      return updated;
    });
  }
  async function importFromSpotify(playlistUrl: string, offset = 0) {
    const response = await fetch(`/api/spotify/playlist?${new URLSearchParams({ url: playlistUrl, offset: String(offset) })}`);
    const data = await response.json();
    if (!response.ok) {
      if (data.code === "spotify_not_connected" || data.code === "spotify_reauthorization_required") setSpotifyConnected(false);
      throw new Error(data.error ?? "Could not load the Spotify playlist.");
    }
    const incoming = data.playlist as Playlist;
    if (offset === 0) {
      const playlist: Playlist = { ...incoming, sourceMode: "spotify", totalTracks: data.pagination.total, nextOffset: data.pagination.nextOffset };
      setPlaylists((items) => [playlist, ...items.filter((item) => item.id !== playlist.id)]);
      setActivePlaylistId(playlist.id); setView("playlist"); setUrl("");
      showNotice(`Loaded ${playlist.tracks.length} of ${data.pagination.total} Spotify playlist tracks.${data.skippedItems ? ` ${data.skippedItems} unavailable item(s) were omitted.` : ""}`);
    } else {
      setPlaylists((items) => items.map((playlist) => playlist.id === activePlaylistId ? { ...playlist, tracks: [...playlist.tracks, ...incoming.tracks], nextOffset: data.pagination.nextOffset } : playlist));
      showNotice(`Loaded ${incoming.tracks.length} more tracks.`);
    }
  }
  async function disconnectSpotify() {
    try {
      const response = await fetch("/api/spotify/disconnect", { method: "POST" });
      if (!response.ok) throw new Error("Could not disconnect Spotify.");
      setSpotifyConnected(false); showNotice("Spotify disconnected.");
    } catch (error) { showNotice(error instanceof Error ? error.message : "Could not disconnect Spotify."); }
  }
  async function searchJamendoTrack(track: Track) {
    setOpenJamendoTrackId(track.id);
    setSearchingJamendoTrackId(track.id);
    try {
      const response = await fetch("/api/jamendo/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: track.title, artist: track.artist, durationMs: track.durationMs }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Jamendo search failed.");
      setJamendoResults((items) => ({ ...items, [track.id]: data as JamendoSearchResponse }));
    } catch (error) { showNotice(error instanceof Error ? error.message : "Jamendo search failed."); }
    finally { setSearchingJamendoTrackId(null); }
  }
  function currentQualityMode(): QualityMode {
    if (quality === "Lossless only") return "lossless_only";
    if (quality === "High-quality lossy") return "high_quality_lossy";
    return "automatic";
  }
  function confirmJamendoMatch(trackId: string, candidate: JamendoSearchResponse["candidates"][number]) {
    const format = selectHighestQuality(candidate, currentQualityMode());
    updateTracks((tracks) => tracks.map((track) => track.id === trackId ? {
      ...track,
      matchStatus: "matched",
      matchConfidence: candidate.matchConfidence,
      source: "Jamendo",
      sourceMatch: candidate,
      authorizedSource: candidate.downloadAllowed,
      selectedFormat: format,
    } : track));
    showNotice(format ? `Confirmed ${candidate.title} · ${formatDetails(format).label} selected.` : "Source match confirmed; no format fits your current quality setting.");
  }
  function changeQuality(value: string) {
    setQuality(value);
    const mode: QualityMode = value === "Lossless only" ? "lossless_only" : value === "High-quality lossy" ? "high_quality_lossy" : "automatic";
    setPlaylists((items) => items.map((playlist) => ({
      ...playlist,
      tracks: playlist.tracks.map((track) => track.sourceMatch ? { ...track, selectedFormat: selectHighestQuality(track.sourceMatch, mode) } : track),
    })));
    try { localStorage.setItem("wave_settings_v1", JSON.stringify({ quality: value, handoffBatchSize })); } catch { /* Optional device-local preference. */ }
  }
  function changeHandoffBatchSize(value: number) {
    setHandoffBatchSize(value);
    try { localStorage.setItem("wave_settings_v1", JSON.stringify({ quality, handoffBatchSize: value })); } catch { /* Optional device-local preference. */ }
  }
  function addSelectedToDownloadQueue() {
    const existingItems = downloadQueueRef.current.filter((item) => item.status !== "cancelled");
    const knownTrackIds = new Set(existingItems.map((item) => item.trackId));
    const filenames = new Set(existingItems.map((item) => item.filename.toLocaleLowerCase()));
    const selectedTracks = queueEligibleTracks(activePlaylist.tracks).filter((track) => track.sourceMatch);
    let duplicateCount = 0;
    const newItems: DownloadQueueItem[] = [];
    for (const [index, track] of selectedTracks.entries()) {
      if (knownTrackIds.has(track.id)) { duplicateCount += 1; continue; }
      const ext = track.selectedFormat === "mp31" || track.selectedFormat === "mp32" ? "mp3" : track.selectedFormat!;
      const baseName = safeDownloadFilename(track.artist, track.title, ext);
      const filename = uniqueFilename(baseName, filenames);
      filenames.add(filename.toLocaleLowerCase());
      knownTrackIds.add(track.id);
      newItems.push({ id: `${track.id}-${Date.now()}-${index}`, trackId: track.id, title: track.title, artist: track.artist, jamendoId: track.sourceMatch!.id, format: track.selectedFormat!, filename, status: "queued" });
    }
    updateDownloadQueue((items) => [...items, ...newItems]);
    if (newItems.length) showNotice(`${newItems.length} track(s) added to the browser download queue.${duplicateCount ? ` ${duplicateCount} duplicate(s) were skipped.` : ""}`);
    else showNotice(duplicateCount ? "Those tracks are already in the download queue." : "No selected tracks have a confirmed, permitted source and compatible format.");
    nav("downloads");
  }
  async function startDownloadQueue() {
    if (queueRunning) return;
    pauseQueueRef.current = false;
    setQueuePaused(false);
    setQueueRunning(true);
    while (!pauseQueueRef.current) {
      const batch = downloadQueueRef.current.filter((item) => item.status === "queued").slice(0, handoffBatchSize);
      if (!batch.length) break;
      await Promise.all(batch.map(async (item) => {
        updateDownloadQueue((items) => items.map((queued) => queued.id === item.id ? { ...queued, status: "preparing", error: undefined } : queued));
        try {
          const response = await fetch("/api/downloads/prepare", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jamendoId: item.jamendoId, format: item.format, artist: item.artist, title: item.title }) });
          const data = await response.json() as { url?: string; filename?: string; error?: string };
          if (!response.ok || !data.url || !data.filename) throw new Error(data.error ?? "Download preparation failed.");
          const directUrl = new URL(data.url);
          if (directUrl.protocol !== "https:" || !/^prod-\d+\.storage\.jamendo\.com$/i.test(directUrl.hostname)) throw new Error("Jamendo returned an unexpected file host.");
          const anchor = document.createElement("a");
          anchor.href = directUrl.toString();
          anchor.download = item.filename;
          anchor.rel = "noopener noreferrer";
          anchor.referrerPolicy = "no-referrer";
          anchor.style.display = "none";
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
          updateDownloadQueue((items) => items.map((queued) => queued.id === item.id ? { ...queued, status: "sent" } : queued));
        } catch (error) {
          updateDownloadQueue((items) => items.map((queued) => queued.id === item.id ? { ...queued, status: "failed", error: error instanceof Error ? error.message : "Download could not be prepared." } : queued));
        }
      }));
      if (!pauseQueueRef.current && downloadQueueRef.current.some((item) => item.status === "queued")) await new Promise((resolve) => window.setTimeout(resolve, 700));
    }
    setQueueRunning(false);
    setQueuePaused(pauseQueueRef.current);
  }
  function pauseDownloadQueue() {
    pauseQueueRef.current = true;
    setQueuePaused(true);
  }
  function retryFailedDownloads() {
    updateDownloadQueue((items) => items.map((item) => item.status === "failed" ? { ...item, status: "queued", error: undefined } : item));
    window.setTimeout(() => void startDownloadQueue(), 0);
  }
  function cancelPendingDownloads() {
    pauseQueueRef.current = true;
    setQueuePaused(true);
    updateDownloadQueue((items) => items.map((item) => item.status === "queued" ? { ...item, status: "cancelled" } : item));
  }
  function confirmBrowserDownloadSaved(id: string) {
    const confirmed = window.confirm("Confirm that this file finished downloading successfully and is present in your browser's Downloads folder.");
    if (!confirmed) return;
    updateDownloadQueue((items) => items.map((item) => item.id === id && item.status === "sent" ? { ...item, status: "confirmed" } : item));
    const queueItem = downloadQueueRef.current.find((item) => item.id === id);
    if (queueItem) {
      const historyEntry: DownloadHistoryEntry = { id: queueItem.id, title: queueItem.title, artist: queueItem.artist, filename: queueItem.filename, format: queueItem.format, confirmedAt: new Date().toISOString(), status: "confirmed_saved_by_user" };
      setDownloadHistory((items) => {
        const updated = [historyEntry, ...items.filter((item) => item.id !== historyEntry.id)].slice(0, 500);
        try { localStorage.setItem("wave_download_history_v1", JSON.stringify(updated)); } catch { /* Downloads remain usable if local history cannot be saved. */ }
        return updated;
      });
    }
    showNotice("Marked as complete based on your confirmation.");
  }
  function clearDownloadHistory() {
    if (!window.confirm("Clear saved download history from this device?")) return;
    setDownloadHistory([]);
    try { localStorage.removeItem("wave_download_history_v1"); } catch { /* No-op if storage is unavailable. */ }
  }
  function importPlaylist(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setUrlError("");
    const match = url.trim().match(/(?:open\.)?spotify\.com\/(?:intl-[a-z]{2}\/)?playlist\/([A-Za-z0-9]+)(?:\?.*)?$/i);
    if (!match) { setUrlError("Enter a valid Spotify playlist link to try the demo import."); return; }
    if (spotifyConfigured) {
      if (!spotifyConnected) { setUrlError("Connect Spotify before importing playlist metadata."); return; }
      setImporting(true);
      void importFromSpotify(url.trim()).catch((error: unknown) => setUrlError(error instanceof Error ? error.message : "Could not load the playlist.")).finally(() => setImporting(false));
      return;
    }
    setImporting(true);
    window.setTimeout(() => {
      const base = demoPlaylists[match[1].length % demoPlaylists.length];
      const imported: Playlist = { ...base, id: `demo-${match[1]}`, name: "Your imported playlist", description: "Demo preview · Spotify metadata is not connected yet.", sourceMode: "mock", totalTracks: base.tracks.length, nextOffset: null, tracks: base.tracks.map((track) => ({ ...track, id: `${track.id}-${match[1]}` })) };
      setPlaylists((items) => [imported, ...items.filter((item) => item.id !== imported.id)]);
      setActivePlaylistId(imported.id); setView("playlist"); setImporting(false); setUrl("");
      showNotice("Demo playlist loaded. No Spotify API credentials are configured.");
    }, 650);
  }

  function openPlaylist(id: string) { setActivePlaylistId(id); setQuery(""); setFilter("All tracks"); setView("playlist"); }
  function nav(viewName: View) { setView(viewName); setMobileNav(false); }

  return <main className="app-shell">
    <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
      <a className="brand" href="#home" onClick={(e) => { e.preventDefault(); nav("library"); }}><span className="brand-mark"><AudioLines size={20} strokeWidth={2.4} /></span><span>wave<span className="brand-dot">.</span></span></a>
      <div className="sidebar-label">WORKSPACE</div>
      <nav className="main-nav" aria-label="Main navigation">
        <button className={`nav-item ${view === "library" ? "active" : ""}`} onClick={() => nav("library")}><Disc3 size={18}/><span>Import playlist</span></button>
        <button className={`nav-item ${view === "downloads" ? "active" : ""}`} onClick={() => nav("downloads")}><ArrowDownToLine size={18}/><span>Download manager</span>{downloadQueue.length > 0 && <span className="nav-count">{downloadQueue.filter((item) => item.status === "queued" || item.status === "preparing").length}</span>}</button>
        <button className={`nav-item ${view === "history" ? "active" : ""}`} onClick={() => nav("history")}><History size={18}/><span>Download history</span></button>
      </nav>
      <div className="playlist-nav-head"><span className="sidebar-label">YOUR PLAYLISTS</span><button aria-label="Import playlist" onClick={() => nav("library")} className="tiny-plus">+</button></div>
      <div className="playlist-nav">{playlists.slice(0, 5).map((p, i) => <button key={p.id} className={`playlist-nav-item ${view === "playlist" && p.id === activePlaylistId ? "selected" : ""}`} onClick={() => openPlaylist(p.id)}><span className={`mini-cover cover-${i % 4}`}><Music2 size={12}/></span><span className="nav-playlist-name">{p.name}</span></button>)}</div>
      <div className="sidebar-bottom"><div className="sidebar-divider"/><button className={`nav-item ${view === "settings" ? "active" : ""}`} onClick={() => nav("settings")}><Settings2 size={18}/><span>Settings</span></button><div className="profile"><div className="avatar">W</div><div className="profile-copy"><strong>Wave listener</strong><span>Personal workspace</span></div><MoreHorizontal size={18} className="profile-more"/></div></div>
    </aside>

    <section className="main-area">
      <header className="topbar"><button className="mobile-menu icon-button" aria-label="Open navigation" onClick={() => setMobileNav(!mobileNav)}><Menu size={21}/></button><div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><strong>{view === "library" ? "Import playlist" : view === "playlist" ? activePlaylist.name : view === "downloads" ? "Download manager" : view === "history" ? "Download history" : "Settings"}</strong></div><div className="topbar-right"><span className={`demo-badge ${spotifyConnected || jamendoConfigured ? "api-badge" : ""}`}><span className="demo-dot"/>{spotifyConnected ? "SPOTIFY CONNECTED" : jamendoConfigured ? "JAMENDO API READY" : spotifyConfigured ? "CONNECT SPOTIFY" : "MOCK MODE"}</span><button className="help-button" onClick={() => showNotice("Spotify provides playlist metadata only. Jamendo results are checked for explicit download permission. Wave never accesses Spotify audio.")}><CircleHelp size={17}/><span>Help</span></button></div></header>

      {view === "library" && <div className="page-content">
        <div className="welcome-row"><div><div className="eyebrow"><span className="eyebrow-line"/> YOUR MUSIC, YOUR WAY</div><h1>Bring your playlists<br className="mobile-break"/> to <span className="text-gradient">Wave.</span></h1><p className="hero-subtitle">Find authorized downloads for the music you love.<br className="desktop-break"/> No shortcuts, just the good stuff.</p></div><div className="hero-art" aria-hidden="true"><div className="art-ring ring-one"/><div className="art-ring ring-two"/><div className="art-disc"><div className="disc-glare"/><div className="disc-center"><AudioLines size={26}/></div></div><span className="art-star star-a">✳</span><span className="art-star star-b">✳</span></div></div>
        <div className="import-card"><div className="import-card-top"><div className="import-icon"><Link2 size={19}/></div><div><h2>Import a playlist</h2><p>Paste a Spotify playlist link to get started</p></div><span className="step-pill">01 <span>/ 03</span></span></div>
          <div className={`spotify-connection ${spotifyConfigured ? spotifyConnected ? "connected" : "" : "mock-mode"}`}>{spotifyConfigured ? spotifyConnected ? <><span className="connection-dot"/> Spotify connected <a href="/api/spotify/auth">Reconnect</a></> : <><span>Connect your account to import playlist metadata.</span><a className="connect-link" href="/api/spotify/auth">Connect Spotify <ExternalLink size={13}/></a></> : <><span><Info size={14}/> Spotify credentials not configured. Imports use sample data.</span><span className="mock-label">MOCK IMPORT</span></>}</div>
          <form className="import-form" onSubmit={importPlaylist}><label htmlFor="playlist-url">PLAYLIST URL</label><div className={`input-wrap ${urlError ? "input-error" : ""}`}><Link2 size={17}/><input id="playlist-url" type="url" placeholder="https://open.spotify.com/playlist/..." value={url} onChange={(e) => { setUrl(e.target.value); setUrlError(""); }} /><button type="submit" disabled={importing || !url.trim()}>{importing ? <><LoaderCircle size={16} className="spin"/> Loading</> : <>Import playlist <ArrowLeft size={15} className="button-arrow"/></>}</button></div>{urlError && <p className="field-error" role="alert">{urlError}</p>}</form>
          <div className="privacy-note"><ShieldCheck size={15}/><span>Your listening stays yours. Wave never accesses Spotify audio.</span><button type="button" aria-label="About privacy" onClick={() => showNotice("We use playlist metadata only. No Spotify audio is accessed.")}><Info size={14}/></button></div>
        </div>
        <div className="section-heading"><div><h2>Pick up where you left off</h2><p>Your recently added playlists</p></div><button className="text-button" onClick={() => showNotice("Your playlist library is up to date.")}>View all <ArrowLeft size={14} className="button-arrow"/></button></div>
        <div className="playlist-grid">{playlists.slice(0, 3).map((p, i) => <button key={p.id} className="playlist-card" onClick={() => openPlaylist(p.id)}>{p.sourceMode === "spotify" && p.image ? <span className="playlist-cover spotify-cover"><img src={p.image} alt=""/></span> : <span className={`playlist-cover cover-${i % 4}`}><span className="cover-sun"/><span className="cover-wave wave-one"/><span className="cover-wave wave-two"/><span className="cover-caption">{i === 0 ? "AFTER HOURS" : i === 1 ? "SLOW DOWN" : "YOUR MIX"}</span></span>}<span className="playlist-info"><strong>{p.name}</strong><span>{p.totalTracks ?? p.tracks.length} tracks <i>·</i> {p.sourceMode === "spotify" ? "Spotify" : "Demo data"}</span></span><span className="card-play"><Play size={15} fill="currentColor"/></span></button>)}</div>
        <div className="source-note"><Sparkles size={15}/><span><strong>Made for the music.</strong> Wave searches sources that explicitly permit downloads. A matching title doesn&apos;t always mean the same recording.</span></div>
      </div>}

      {view === "playlist" && <div className="page-content playlist-page">
        <button className="back-link" onClick={() => nav("library")}><ArrowLeft size={15}/> Back to library</button>
        <div className="playlist-hero">{activePlaylist.sourceMode === "spotify" && activePlaylist.image ? <div className="playlist-hero-cover spotify-cover"><img src={activePlaylist.image} alt=""/></div> : <div className="playlist-hero-cover"><span className="cover-sun"/><span className="cover-wave wave-one"/><span className="cover-wave wave-two"/><span className="cover-caption">AFTER HOURS</span></div>}<div className="playlist-hero-copy"><span className="eyebrow">SPOTIFY PLAYLIST <span className="status-demo">· {activePlaylist.sourceMode === "spotify" ? "LIVE METADATA" : "DEMO DATA"}</span></span><h1>{activePlaylist.name}</h1><p>{activePlaylist.description}</p><div className="playlist-meta"><span>{activePlaylist.owner}</span><i>·</i><span>{activePlaylist.totalTracks ?? activePlaylist.tracks.length} tracks</span><i>·</i>{activePlaylist.spotifyUrl ? <a href={activePlaylist.spotifyUrl} target="_blank" rel="noreferrer">Open in Spotify <ExternalLink size={11}/></a> : <span>Demo import</span>}</div></div><button className="hero-more icon-button" aria-label="Playlist options" onClick={() => showNotice("Playlist options are coming with the next milestone.")}><MoreHorizontal size={21}/></button></div>
        <div className="match-summary"><div className="summary-icon"><Sparkles size={17}/></div><div className="summary-copy"><strong>{matchedCount ? `${matchedCount} provider-checked download options` : "Search for authorized Jamendo sources"}</strong><span>Results stay unconfirmed until you check the recording identity and source permission.</span></div><button className="summary-link" onClick={() => { const firstTrack = activePlaylist.tracks[0]; if (firstTrack) void searchJamendoTrack(firstTrack); }}>Search a track <ArrowLeft size={14} className="button-arrow"/></button></div>
        <div className="track-toolbar"><div className="track-toolbar-title"><h2>Tracks <span>{activePlaylist.totalTracks ?? activePlaylist.tracks.length}</span></h2><div className="search-box"><Search size={15}/><input aria-label="Search tracks" placeholder="Search tracks" value={query} onChange={(e) => setQuery(e.target.value)}/>{query && <button aria-label="Clear search" onClick={() => setQuery("")}><X size={14}/></button>}</div></div><div className="track-controls"><label className="filter-select"><SlidersHorizontal size={15}/><select aria-label="Filter tracks" value={filter} onChange={(e) => setFilter(e.target.value)}><option>All tracks</option><option>Available</option><option>Needs review</option><option>Unavailable</option></select><ChevronDown size={14}/></label><button className="quality-control" onClick={() => showNotice("Quality selection options are part of a later milestone.")}><AudioLines size={15}/><span>{quality}</span><ChevronDown size={14}/></button></div></div>
        <div className="track-table-wrap"><table className="track-table"><thead><tr><th className="check-col"><button className={`select-all ${activePlaylist.tracks.every(t => t.selected) ? "checked" : ""}`} aria-label="Select all tracks" onClick={() => { const all = activePlaylist.tracks.every(t => t.selected); updateTracks((tracks) => tracks.map((t) => ({...t, selected: !all}))); }}><Check size={12}/></button></th><th className="number-col">#</th><th>TRACK</th><th>ALBUM</th><th>SOURCE MATCH</th><th className="duration-col"><Clock3 size={15}/></th></tr></thead><tbody>{filteredTracks.map((track) => { const index = activePlaylist.tracks.findIndex(t => t.id === track.id); return <tr key={track.id} className={track.selected ? "row-selected" : ""}><td><button aria-label={`${track.selected ? "Deselect" : "Select"} ${track.title}`} className={`row-check ${track.selected ? "checked" : ""}`} onClick={() => updateTracks((tracks) => tracks.map((t) => t.id === track.id ? {...t, selected: !t.selected} : t))}>{track.selected && <Check size={12}/>}</button></td><td className="track-number">{String(index + 1).padStart(2, "0")}</td><td><div className="track-name-cell"><span className={`track-art art-${index % 5}`}><Music2 size={14}/></span><span className="track-text"><strong>{track.spotifyUrl ? <a href={track.spotifyUrl} target="_blank" rel="noreferrer">{track.title}</a> : track.title}</strong><span>{track.artist}</span></span></div></td><td className="album-cell">{track.album}</td><td><MatchBadge status={track.matchStatus} confidence={track.matchConfidence}/><button className="match-action" onClick={() => { if (openJamendoTrackId === track.id && jamendoResults[track.id]) { setOpenJamendoTrackId(null); return; } void searchJamendoTrack(track); }}>{searchingJamendoTrackId === track.id ? <><LoaderCircle size={11} className="spin"/> Searching</> : <><Search size={11}/> Search Jamendo</>}</button>{track.selectedFormat && <span className="chosen-format">Selected · {formatDetails(track.selectedFormat).label}</span>}</td><td className="duration-cell">{formatDuration(track.durationMs)}</td></tr>; })}</tbody></table>{filteredTracks.length === 0 && <div className="no-results">No tracks match your search.</div>}</div>
        {openJamendoTrackId && <JamendoResultPanel trackTitle={activePlaylist.tracks.find((track) => track.id === openJamendoTrackId)?.title ?? "Track"} result={jamendoResults[openJamendoTrackId]} loading={searchingJamendoTrackId === openJamendoTrackId} qualityMode={currentQualityMode()} confirmedId={activePlaylist.tracks.find((track) => track.id === openJamendoTrackId)?.sourceMatch?.id} onConfirm={(candidate) => confirmJamendoMatch(openJamendoTrackId, candidate)} onClose={() => setOpenJamendoTrackId(null)}/> }
        {activePlaylist.nextOffset !== null && activePlaylist.nextOffset !== undefined && activePlaylist.spotifyUrl && <button className="load-more" disabled={loadingMore} onClick={() => { setLoadingMore(true); void importFromSpotify(activePlaylist.spotifyUrl!, activePlaylist.nextOffset!).catch((error: unknown) => showNotice(error instanceof Error ? error.message : "Could not load more tracks.")).finally(() => setLoadingMore(false)); }}>{loadingMore ? <><LoaderCircle size={14} className="spin"/> Loading tracks…</> : <>Load more tracks <span>({activePlaylist.tracks.length} of {activePlaylist.totalTracks})</span></>}</button>}
        <div className="playlist-footer"><span><CheckCheck size={15}/> {selectedCount} available tracks selected</span><button className="primary-button" onClick={addSelectedToDownloadQueue}><Download size={16}/> Download {selectedCount} tracks <ArrowLeft size={15} className="button-arrow"/></button></div>
        <div className="disclaimer"><Info size={14}/><span>{activePlaylist.sourceMode === "spotify" ? "Spotify supplied playlist metadata only. No Spotify audio is accessed. Jamendo candidates are suggestions; check the recording and explicit permission before download." : "Sample playlist tracks contain no Jamendo match claims. Configure Jamendo credentials for live source results; mock results are never downloadable."}</span></div>
      </div>}

      {view === "downloads" && <div className="page-content">
        <div className="page-heading"><div className="eyebrow"><span className="eyebrow-line"/> YOUR QUEUE</div><h1>Download manager</h1><p>Wave sends authorized Jamendo files to your browser.</p></div>
        <div className="download-summary">
          <div><span>QUEUED</span><strong>{downloadQueue.filter((item) => item.status === "queued" || item.status === "preparing").length}</strong></div>
          <div><span>SENT TO BROWSER</span><strong>{downloadQueue.filter((item) => item.status === "sent").length}</strong></div>
          <div><span>CONFIRMED SAVED</span><strong>{downloadQueue.filter((item) => item.status === "confirmed").length}</strong></div>
          <div><span>NEEDS RETRY</span><strong>{downloadQueue.filter((item) => item.status === "failed").length}</strong></div>
        </div>
        <div className="manager-card">
          <div className="manager-head"><div><h2>Current downloads</h2><p>Browser transfers run outside Wave. Transfer progress and pause/resume are controlled by your browser.</p></div><div className="queue-actions">
            {queueRunning ? <button className="outline-button" onClick={pauseDownloadQueue}><Pause size={14}/> Pause queue</button> : downloadQueue.some((item) => item.status === "queued") ? <button className="primary-button small-primary" onClick={() => void startDownloadQueue()}><Play size={14}/> {queuePaused ? "Resume queue" : "Start queue"}</button> : null}
            {downloadQueue.some((item) => item.status === "queued") && <button className="outline-button" onClick={cancelPendingDownloads}>Cancel queued</button>}
            {downloadQueue.some((item) => item.status === "failed") && !queueRunning && <button className="outline-button" onClick={retryFailedDownloads}>Retry failed</button>}
            {!downloadQueue.length && <button className="outline-button" onClick={() => nav("playlist")}><ListMusic size={15}/> Browse playlist</button>}
          </div></div>
          {!downloadQueue.length ? <div className="empty-state"><div className="empty-icon"><ArrowDownToLine size={23}/></div><strong>No active downloads</strong><p>Confirm a permitted Jamendo source, then add tracks from a playlist.</p><button className="text-button" onClick={() => nav("playlist")}>Go to playlist <ArrowLeft size={14} className="button-arrow"/></button></div> : <>
            <div className="queue-progress"><div><span>Browser handoff</span><span>{downloadQueue.filter((item) => item.status === "sent" || item.status === "confirmed").length} of {downloadQueue.length} sent · completion needs your confirmation</span></div><div className="progress-track"><span style={{ width: `${downloadQueue.length ? (downloadQueue.filter((item) => item.status === "sent" || item.status === "confirmed").length / downloadQueue.length) * 100 : 0}%` }}/></div></div>
            <div className="queue-list">{downloadQueue.map((item, index) => <div key={item.id} className="queue-row"><span className={`track-art art-${index % 5}`}><Music2 size={14}/></span><span className="queue-title"><strong>{item.title}</strong><span>{item.artist} · {item.filename}</span></span><span className={`queue-status queue-${item.status}`}><span className="status-dot"/> {item.status === "preparing" ? "Checking" : item.status === "sent" ? "Sent · unverified" : item.status === "confirmed" ? "Confirmed saved" : item.status === "failed" ? "Failed" : item.status === "cancelled" ? "Cancelled" : "Queued"}</span><span className="queue-size">{formatDetails(item.format).label} · {formatDetails(item.format).type}</span><div className="queue-row-actions">{item.status === "sent" && <button className="confirm-saved" onClick={() => confirmBrowserDownloadSaved(item.id)}>Confirm saved</button>}{item.status === "failed" && <button className="confirm-saved" onClick={() => { updateDownloadQueue((items) => items.map((queued) => queued.id === item.id ? { ...queued, status: "queued", error: undefined } : queued)); window.setTimeout(() => void startDownloadQueue(), 0); }}>Retry</button>}{item.error && <span className="queue-error" title={item.error}><Info size={13}/></span>}</div></div>)}</div>
            <div className="demo-callout"><Info size={15}/><span>Jamendo's official file endpoint redirects the browser to its authorized file host. Wave cannot read cross-origin transfer progress or pause that native download. Items stay “Sent · unverified” until you confirm the file completed in your browser. Files are not stored on Wave's server.</span></div>
          </>}
        </div>
      </div>}

      {view === "history" && <div className="page-content">
        <div className="page-heading"><div className="eyebrow"><span className="eyebrow-line"/> YOUR ACTIVITY</div><h1>Download history</h1><p>Files you confirmed as saved on this device.</p></div>
        {downloadHistory.length > 0 ? <>
          <div className="manager-card history-card"><div className="manager-head"><div><h2>Confirmed downloads</h2><p>Stored in this browser only. Wave does not keep the audio files.</p></div><button className="outline-button" onClick={clearDownloadHistory}>Clear history</button></div>
            <div className="queue-list history-list">{downloadHistory.map((item) => <div key={item.id} className="queue-row"><span className="track-art art-1"><Check size={14}/></span><span className="queue-title"><strong>{item.title}</strong><span>{item.artist} · {item.filename}</span></span><span className="history-status">Saved · {new Date(item.confirmedAt).toLocaleDateString()}</span><span className="queue-size">{formatDetails(item.format).label}</span></div>)}</div>
          </div>
          <CompletedArchiveBuilder history={downloadHistory}/>
        </> : <div className="manager-card"><div className="empty-state history-empty"><div className="empty-icon"><History size={23}/></div><strong>Nothing here yet</strong><p>Confirm a browser download as saved to add it here.</p><button className="outline-button" onClick={() => nav("library")}>Import a playlist <ArrowLeft size={14} className="button-arrow"/></button></div></div>}
        <div className="settings-footnote"><Info size={14}/> History and preferences stay in this browser's local storage. Clearing browser data removes them.</div>
      </div>}

      {view === "settings" && <div className="page-content"><div className="page-heading"><div className="eyebrow"><span className="eyebrow-line"/> MAKE IT YOURS</div><h1>Settings</h1><p>Choose how Wave prepares your downloads.</p></div><div className="settings-card"><div className="setting-row"><div className="setting-icon"><AudioLines size={18}/></div><div className="setting-copy"><strong>Audio quality</strong><span>Choose your preferred quality for authorized sources.</span></div><label className="setting-select"><select value={quality} onChange={(e) => changeQuality(e.target.value)}><option>Automatic · highest quality</option><option>Lossless only</option><option>High-quality lossy</option></select><ChevronDown size={14}/></label></div><div className="setting-row"><div className="setting-icon"><Download size={18}/></div><div className="setting-copy"><strong>Browser handoff batch size</strong><span>Controls how many authorized links Wave starts together. Your browser controls actual transfers.</span></div><label className="setting-select"><select value={`${handoffBatchSize} at a time`} onChange={(e) => changeHandoffBatchSize(Number.parseInt(e.target.value, 10))}><option>1 at a time</option><option>2 at a time</option><option>3 at a time</option><option>5 at a time</option></select><ChevronDown size={14}/></label></div><div className="setting-row"><div className="setting-icon"><ShieldCheck size={18}/></div><div className="setting-copy"><strong>Authorized sources only</strong><span>Downloads must be explicitly permitted by the source.</span></div><span className="on-pill"><Check size={12}/> Always on</span></div></div><div className="settings-footnote"><Info size={14}/> Settings are saved locally in this browser.</div></div>}
    </section>
    {mobileNav && <button className="nav-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)}/>}
    {notice && <div role="status" className="toast"><Check size={16}/>{notice}<button aria-label="Dismiss" onClick={() => setNotice("")}><X size={15}/></button></div>}
  </main>;
}

function MatchBadge({ status, confidence }: { status: MatchStatus; confidence?: number }) {
  return <span className={`match-badge badge-${status}`}><span className="match-dot"/>{statusText[status]}{confidence && <span className="confidence">{confidence}%</span>}</span>;
}

function JamendoResultPanel({ trackTitle, result, loading, qualityMode, confirmedId, onConfirm, onClose }: {
  trackTitle: string;
  result?: JamendoSearchResponse;
  loading: boolean;
  qualityMode: QualityMode;
  confirmedId?: string;
  onConfirm: (candidate: JamendoSearchResponse["candidates"][number]) => void;
  onClose: () => void;
}) {
  return (
    <section className="jamendo-results" aria-live="polite">
      <div className="jamendo-results-head">
        <div>
          <span className="eyebrow">AUTHORIZED SOURCE SEARCH</span>
          <h3>Jamendo results for “{trackTitle}”</h3>
        </div>
        <button className="icon-button" aria-label="Close Jamendo results" onClick={onClose}><X size={16}/></button>
      </div>
      {loading && <div className="jamendo-loading"><LoaderCircle size={17} className="spin"/> Searching Jamendo and checking available formats…</div>}
      {!loading && result && (
        <>
          <div className={`jamendo-mode ${result.mode}`}>
            {result.mode === "mock" ? "MOCK DATA · NO SOURCE PERMISSIONS CHECKED" : "LIVE JAMENDO API RESULTS"}
          </div>
          {result.message && <p className="jamendo-message">{result.message}</p>}
          {result.candidates.length === 0 ? (
            <div className="jamendo-empty">No Jamendo candidates found for this title and artist.</div>
          ) : (
            <div className="jamendo-candidate-list">
              {result.candidates.map((candidate) => {
                const suggestedFormat = selectHighestQuality(candidate, qualityMode);
                const details = suggestedFormat ? formatDetails(suggestedFormat) : null;
                const confirmed = candidate.id === confirmedId;
                return (
                  <article key={candidate.id} className="jamendo-candidate">
                    {candidate.artworkUrl && <img src={candidate.artworkUrl} alt="" className="jamendo-art"/>}
                    <div className="jamendo-candidate-info">
                      <strong>{candidate.title}</strong>
                      <span>{candidate.artist} <i>·</i> {candidate.album}</span>
                      <div className="jamendo-meta">
                        {candidate.durationSeconds === null ? "Duration unknown" : formatDuration(candidate.durationSeconds * 1000)}
                        {candidate.jamendoUrl && <><i>·</i><a href={candidate.jamendoUrl} target="_blank" rel="noreferrer">Open on Jamendo <ExternalLink size={11}/></a></>}
                        {candidate.licenseUrl && <><i>·</i><a href={candidate.licenseUrl} target="_blank" rel="noreferrer">License <ExternalLink size={11}/></a></>}
                      </div>
                      {candidate.matchConfidence === undefined ? (
                        <div className="confidence-note">Demo candidate · no match score</div>
                      ) : (
                        <div className={`confidence-note confidence-${matchBand(candidate.matchConfidence)}`}>
                          <strong>{candidate.matchConfidence}% metadata similarity</strong>
                          <span>{matchBand(candidate.matchConfidence)} suggestion · listen and confirm recording identity</span>
                        </div>
                      )}
                      {candidate.formats.length > 0 && (
                        <div className="format-list"><span>PROVIDER FORMATS</span>{candidate.formats.map((format) => <b key={format}>{format.toUpperCase()}</b>)}</div>
                      )}
                      {details && <div className="quality-detail"><Sparkles size={12}/><span>{details.label} · {details.type} · {details.bitrate} · sample rate {details.sampleRate}</span></div>}
                      {candidate.downloadAllowed && !suggestedFormat && <div className="quality-detail">No available format fits the current quality setting.</div>}
                      {candidate.previewUrl && <audio controls preload="none" src={candidate.previewUrl}>Audio preview is unavailable in this browser.</audio>}
                    </div>
                    <div className="candidate-actions">
                      <span className={`permission-pill ${candidate.downloadAllowed ? "permitted" : "not-permitted"}`}>
                        {candidate.demo ? "Demo only" : candidate.downloadAllowed ? "Download permitted" : "Not downloadable"}
                      </span>
                      <button className="confirm-match-button" disabled={!candidate.downloadAllowed || candidate.demo || confirmed} onClick={() => onConfirm(candidate)}>
                        {confirmed ? <><Check size={12}/> Confirmed</> : "Confirm source"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
      {!loading && !result && <div className="jamendo-empty">Preparing search…</div>}
    </section>
  );
}


function CompletedArchiveBuilder({ history }: { history: DownloadHistoryEntry[] }) {
  const [files, setFiles] = useState<File[]>([]);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");
  const filesByName = new Map(files.map((file) => [file.name.toLocaleLowerCase(), file]));
  const included = history.filter((entry) => filesByName.has(entry.filename.toLocaleLowerCase()));

  async function createArchive() {
    if (!included.length) {
      setMessage("Choose the completed audio files from your Downloads folder first.");
      return;
    }
    const totalBytes = included.reduce((sum, entry) => sum + (filesByName.get(entry.filename.toLocaleLowerCase())?.size ?? 0), 0);
    if (totalBytes > 400 * 1024 * 1024) {
      setMessage("This browser ZIP builder is limited to 400 MiB per archive. Select fewer completed files.");
      return;
    }
    setCreating(true);
    setMessage("");
    try {
      const zipEntries: Record<string, Uint8Array> = {};
      const manifest = {
        createdAt: new Date().toISOString(),
        note: "Files were selected by the user and paired with Wave's user-confirmed history. Wave does not verify local file contents.",
        tracks: history.map((entry) => ({
          title: entry.title,
          artist: entry.artist,
          filename: entry.filename,
          format: entry.format,
          status: entry.status,
          userConfirmedAt: entry.confirmedAt,
          includedInArchive: filesByName.has(entry.filename.toLocaleLowerCase()),
        })),
      };
      await Promise.all(included.map(async (entry) => {
        const file = filesByName.get(entry.filename.toLocaleLowerCase());
        if (file) zipEntries[entry.filename] = new Uint8Array(await file.arrayBuffer());
      }));
      zipEntries["manifest.json"] = strToU8(JSON.stringify(manifest, null, 2));
      const archive = zipSync(zipEntries, { level: 0 });
      const blob = new Blob([archive], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `wave-downloads-${new Date().toISOString().slice(0, 10)}.zip`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setMessage(`Created a ZIP with ${included.length} audio file(s) and a manifest. Unselected history items are listed as excluded.`);
    } catch (error) {
      setMessage(error instanceof Error ? `Could not create ZIP: ${error.message}` : "Could not create ZIP in this browser.");
    } finally { setCreating(false); }
  }

  return <section className="archive-builder">
    <div className="archive-heading"><div><h2>Build a ZIP archive</h2><p>Select completed files from your device. Audio stays in your browser.</p></div><span className="archive-limit">400 MiB max</span></div>
    <label className="file-picker">Choose completed audio files<input type="file" accept=".flac,.ogg,.mp3,audio/*" multiple onChange={(event) => { setFiles(Array.from(event.target.files ?? [])); setMessage(""); }}/></label>
    <div className="archive-status">{files.length} file(s) selected · {included.length} match confirmed history · {history.length - included.length} will be excluded</div>
    <button className="primary-button" disabled={creating || !included.length} onClick={() => void createArchive()}>{creating ? <><LoaderCircle size={15} className="spin"/> Creating ZIP…</> : <><Download size={15}/> Create ZIP with {included.length} track(s)</>}</button>
    {message && <p className="archive-message" role="status">{message}</p>}
    <p className="archive-disclaimer">Wave matches selected files by filename only; it cannot verify their audio contents. Only items you previously confirmed as downloaded can be included.</p>
  </section>;
}
