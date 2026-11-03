import AsyncStorage from '@react-native-async-storage/async-storage';
import { Title, Episode, playbackKey } from './domain';
export type Progress = { item: Title; episode?: Episode; seconds: number; duration: number; updated: number };
export type Library = { saved: Title[]; progress: Record<string, Progress> };
const KEY = 'veyra-native-library:v1';
let current: Library = { saved: [], progress: {} };
let writes = Promise.resolve();
const listeners = new Set<() => void>();
export const library = {
  subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
  snapshot: () => current,
  async init() { try { const raw = await AsyncStorage.getItem(KEY); if (raw) { const value = JSON.parse(raw); current = { saved: Array.isArray(value.saved) ? value.saved : [], progress: value.progress || {} }; listeners.forEach(fn => fn()); } } catch { /* safe empty local library */ } },
  commit() { const encoded = JSON.stringify(current); writes = writes.then(() => AsyncStorage.setItem(KEY, encoded)).catch(() => {}); listeners.forEach(fn => fn()); },
  toggle(item: Title) { current = { ...current, saved: current.saved.some(t => t.id === item.id) ? current.saved.filter(t => t.id !== item.id) : [item, ...current.saved] }; this.commit(); },
  update(item: Title, episode: Episode | undefined, seconds: number, duration: number) {
    if (!Number.isFinite(seconds) || !Number.isFinite(duration) || duration <= 0) return;
    current = { ...current, progress: { ...current.progress, [playbackKey(item, episode)]: { item, episode, seconds, duration, updated: Date.now() } } }; this.commit();
  },
};
