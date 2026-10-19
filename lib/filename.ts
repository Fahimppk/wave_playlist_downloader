const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

function cleanPart(value: string) {
  let part = value
    .normalize("NFC")
    .replace(/[\u0000-\u001f<>:"/\\|?*]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "")
    .slice(0, 100);
  if (!part || part === "." || part === "..") part = "Unknown";
  if (WINDOWS_RESERVED.test(part)) part = `_${part}`;
  return part;
}

export function safeDownloadFilename(artist: string, title: string, extension: string) {
  return `${cleanPart(artist)} - ${cleanPart(title)}.${extension.toLowerCase()}`;
}

export function uniqueFilename(filename: string, existing: Set<string>) {
  const lower = filename.toLocaleLowerCase();
  if (!existing.has(lower)) return filename;
  const dotIndex = filename.lastIndexOf(".");
  const base = dotIndex > 0 ? filename.slice(0, dotIndex) : filename;
  const extension = dotIndex > 0 ? filename.slice(dotIndex) : "";
  let suffix = 2;
  while (existing.has(`${base} (${suffix})${extension}`.toLocaleLowerCase())) suffix += 1;
  return `${base} (${suffix})${extension}`;
}
