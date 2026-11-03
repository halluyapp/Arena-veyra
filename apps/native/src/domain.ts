export type Episode = { id: string; seasonNumber: number; episodeNumber: number; title?: string; label?: string };
export type Season = { seasonNumber: number; label?: string; episodes: Episode[] };
export type Title = {
  id: string; subjectId?: string; detailPath?: string; provider?: string;
  title: string; type?: string; poster?: string; backdrop?: string;
  description?: string; year?: string; rating?: string; genres?: string[];
  seasons?: Season[]; cast?: { id?: string; name: string; character?: string }[];
};
export type Source = { id: string; label: string; height?: number; url: string; sizeBytes?: number; expiresAt?: number };
export type Caption = { id: string; lang: string; label: string; url: string };
export type Media = { sources: Source[]; subtitles: Caption[]; expiresAt?: number };
export const MEDIA_HEADERS = Object.freeze({
  Referer: 'https://www.moviebox.ph/',
  Origin: 'https://www.moviebox.ph',
  'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
});
export function coordinates(item: Title, episode?: Episode) {
  if (!item.subjectId || !item.detailPath) throw new Error('This title is missing playback information.');
  if (item.type === 'series' && (!episode || episode.seasonNumber < 1 || episode.episodeNumber < 1)) {
    throw new Error('Choose an episode first.');
  }
  return { subjectId: item.subjectId, detailPath: item.detailPath,
    season: episode?.seasonNumber ?? 0, episode: episode?.episodeNumber ?? 0 };
}
export function playbackKey(item: Title, episode?: Episode) {
  return `${item.id}:s${episode?.seasonNumber ?? 0}:e${episode?.episodeNumber ?? 0}`;
}
export function chooseSource(sources: Source[], quality: number, tv: boolean) {
  const sorted = [...sources].sort((a, b) => (b.height ?? 0) - (a.height ?? 0));
  if (quality) return sorted.find(s => s.height === quality) ?? sorted[0];
  return tv ? sorted[0] : sorted.find(s => s.height === 480) ?? sorted.find(s => s.height === 360) ?? sorted[0];
}
export function safeHttps(value: unknown): string {
  if (typeof value !== 'string') throw new Error('The service returned an invalid URL.');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('A secure URL is required.');
  return url.toString();
}
export function validateCompleted(size: number, expected: number, signature: number[]) {
  return size > 0 && (!expected || size === expected) &&
    signature.length >= 8 && String.fromCharCode(...signature.slice(4, 8)) === 'ftyp';
}
