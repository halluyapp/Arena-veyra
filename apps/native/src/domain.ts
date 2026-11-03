export type Episode = {
  id: string;
  seasonNumber: number;
  episodeNumber: number;
  title?: string;
  label?: string;
};
export type Season = {
  seasonNumber: number;
  label?: string;
  episodes: Episode[];
};
export type Title = {
  id: string;
  subjectId?: string;
  detailPath?: string;
  provider?: string;
  title: string;
  type?: string;
  poster?: string;
  backdrop?: string;
  description?: string;
  year?: string;
  rating?: string;
  genres?: string[];
  seasons?: Season[];
  cast?: { id?: string; name: string; character?: string }[];
};
export type Source = {
  id: string;
  label: string;
  height?: number;
  url: string;
  sizeBytes?: number;
  expiresAt?: number;
};
export type Caption = { id: string; lang: string; label: string; url: string };
export type Media = {
  sources: Source[];
  subtitles: Caption[];
  expiresAt?: number;
};
export const MEDIA_HEADERS = Object.freeze({
  Referer: "https://www.moviebox.ph/",
  Origin: "https://www.moviebox.ph",
  "User-Agent":
    "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
});
export function coordinates(item: Title, episode?: Episode) {
  if (!item.subjectId || !item.detailPath)
    throw new Error("This title is missing playback information.");
  if (
    item.type === "series" &&
    (!episode || episode.seasonNumber < 1 || episode.episodeNumber < 1)
  ) {
    throw new Error("Choose an episode first.");
  }
  return {
    subjectId: item.subjectId,
    detailPath: item.detailPath,
    season: episode?.seasonNumber ?? 0,
    episode: episode?.episodeNumber ?? 0,
  };
}
export function playbackKey(item: Title, episode?: Episode) {
  return `${item.id}:s${episode?.seasonNumber ?? 0}:e${episode?.episodeNumber ?? 0}`;
}
export function chooseSource(sources: Source[], quality: number, tv: boolean) {
  const sorted = [...sources].sort((a, b) => (b.height ?? 0) - (a.height ?? 0));
  if (quality) return sorted.find((s) => s.height === quality) ?? sorted[0];
  return tv
    ? sorted[0]
    : (sorted.find((s) => s.height === 480) ??
        sorted.find((s) => s.height === 360) ??
        sorted[0]);
}
export function safeHttps(value: unknown): string {
  if (typeof value !== "string")
    throw new Error("The service returned an invalid URL.");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password)
    throw new Error("A secure URL is required.");
  return url.toString();
}
export function validateCompleted(
  size: number,
  expected: number,
  signature: number[],
) {
  return (
    size > 0 &&
    (!expected || size === expected) &&
    signature.length >= 8 &&
    String.fromCharCode(...signature.slice(4, 8)) === "ftyp"
  );
}
/** Validate top-level MP4 atoms without loading video payload into JS memory. */
export async function validateMp4Atoms(
  size: number,
  read: (offset: number, length: number) => Promise<Uint8Array>,
) {
  let offset = 0;
  let ftyp = false;
  let moov = false;
  let mdat = false;
  const u32 = (b: Uint8Array, n: number) =>
    b[n] * 2 ** 24 + b[n + 1] * 2 ** 16 + b[n + 2] * 256 + b[n + 3];
  for (let count = 0; offset < size && count < 4096; count++) {
    if (size - offset < 8) return false;
    const bytes = await read(offset, Math.min(16, size - offset));
    if (bytes.length < 8) return false;
    const kind = String.fromCharCode(...bytes.slice(4, 8));
    let length = u32(bytes, 0);
    let header = 8;
    if (length === 1) {
      if (bytes.length < 16) return false;
      length = u32(bytes, 8) * 2 ** 32 + u32(bytes, 12);
      header = 16;
    } else if (length === 0) length = size - offset;
    if (
      !Number.isSafeInteger(length) ||
      length < header ||
      offset + length > size
    )
      return false;
    if (kind === "ftyp") ftyp = true;
    if (kind === "moov" && length > header) moov = true;
    if (kind === "mdat" && length > header) mdat = true;
    offset += length;
  }
  return offset === size && ftyp && moov && mdat;
}
/** A URI-safe, reversible filename; never pass percent-escaped URI text as a native path. */
export function privateFilename(id: string) {
  const encoded = encodeURIComponent(id)
    .replace(/_/g, "%5F")
    .replace(/%/g, "_");
  if (encoded.length > 220)
    throw new Error("This download identifier is too long to save safely.");
  return `${encoded}.mp4`;
}
