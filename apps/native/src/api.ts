import * as SecureStore from 'expo-secure-store';
import { coordinates, safeHttps, Title, Episode, Media } from './domain';
import { readHome, readPaged, readDetails, readMedia, readDownload } from '../../../src/services/api/normalize';
const BASE = (process.env.EXPO_PUBLIC_VEYRA_API_BASE_URL || '').trim().replace(/\/+$/, '');
export const configured = Boolean(BASE);
export class ApiError extends Error {
  constructor(message: string, public status = 0, public code = '') { super(message); }
}
export async function request(path: string, params: Record<string, unknown> = {}, options: { method?: string; body?: unknown; signal?: AbortSignal; authenticated?: boolean } = {}) {
  if (!BASE) throw new ApiError('Connect VEYRA to its deployed API to browse and activate devices.');
  safeHttps(BASE);
  const url = new URL(`${BASE}/api/veyra${path}`);
  for (const [key, value] of Object.entries(params)) if (value !== undefined) url.searchParams.set(key, String(value));
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) controller.abort();
  const timer = setTimeout(abort, 20_000);
  try {
    const token = options.authenticated === false ? null : await SecureStore.getItemAsync('veyra-device-token');
    const response = await fetch(url.toString(), { method: options.method || 'GET',
      headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: options.body ? JSON.stringify(options.body) : undefined, signal: controller.signal });
    let payload: any;
    try { payload = await response.json(); } catch { throw new ApiError('The service returned an unreadable response.', response.status); }
    if (!response.ok || payload.status === false) throw new ApiError('The service could not complete this request. Please try again.', response.status, payload.error?.code);
    return payload.data ?? payload;
  } finally { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); }
}
export const api = {
  home: async (signal?: AbortSignal) => readHome(await request('/home', {}, { signal })),
  search: async (query: string, page: number, signal?: AbortSignal) => readPaged(await request('/search', { query, page }, { signal })),
  details: async (item: Title) => readDetails(await request('/details', { subjectId: item.subjectId, detailPath: item.detailPath })),
  media: async (item: Title, episode?: Episode, quality?: number): Promise<Media> => {
    const data = await request(quality ? '/stream' : '/media', { ...coordinates(item, episode), ...(quality ? { quality } : {}) });
    const normalized = readMedia(data);
    return { ...normalized, subtitles: normalized.subtitles as CaptionCompat[] } as Media;
  },
  download: async (item: Title, episode?: Episode, quality?: number) => {
    const data = await request('/download', { ...coordinates(item, episode), ...(quality ? { quality } : {}) });
    const normalized = readDownload(data);
    if (!normalized) throw new ApiError('This title is not available to download.');
    return { ...normalized, expiresAt: data.expiresAt };
  },
};
type CaptionCompat = { id: string; lang: string; label: string; url: string };
