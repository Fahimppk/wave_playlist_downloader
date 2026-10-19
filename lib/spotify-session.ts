import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "wave_spotify_session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 180;

export type SpotifySession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

function encryptionKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters.");
  return createHash("sha256").update(secret).digest();
}

function seal(value: SpotifySession) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}

function unseal(value: string): SpotifySession | null {
  try {
    const [ivPart, tagPart, encryptedPart] = value.split(".");
    if (!ivPart || !tagPart || !encryptedPart) return null;
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivPart, "base64url"));
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedPart, "base64url")), decipher.final()]);
    const session = JSON.parse(decrypted.toString("utf8")) as SpotifySession;
    if (typeof session.accessToken !== "string" || typeof session.refreshToken !== "string" || typeof session.expiresAt !== "number") return null;
    return session;
  } catch {
    return null;
  }
}

export async function getSpotifySession() {
  const cookieStore = await cookies();
  const value = cookieStore.get(COOKIE_NAME)?.value;
  return value ? unseal(value) : null;
}

export async function setSpotifySession(session: SpotifySession) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, seal(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
}

export async function clearSpotifySession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export function isSpotifyConfigured() {
  return Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET && process.env.SPOTIFY_REDIRECT_URI && process.env.SESSION_SECRET?.length && process.env.SESSION_SECRET.length >= 32);
}
