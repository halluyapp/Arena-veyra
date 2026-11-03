import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Platform, BackHandler } from 'react-native';
import Video, { VideoRef, TextTrackType, SelectedTrackType, TextTracks } from 'react-native-video';
import * as FS from 'expo-file-system/legacy';
import { api } from './api';
import { Title, Episode, Media, Source, MEDIA_HEADERS, chooseSource, playbackKey, safeHttps } from './domain';
import { library } from './library';
import { Button, Message, styles } from './ui';
export function Player({ item, episode, localUri, onBack, onNext }: { item: Title; episode?: Episode; localUri?: string; onBack: () => void; onNext?: () => void }) {
  const video = useRef<VideoRef>(null);
  const [media, setMedia] = useState<Media>(); const [source, setSource] = useState<Source>();
  const [captions, setCaptions] = useState<TextTracks>([]);
  const [captionIndex, setCaptionIndex] = useState(-1); const [quality, setQuality] = useState(0);
  const [error, setError] = useState(''); const [loading, setLoading] = useState(true);
  const [paused, setPaused] = useState(false); const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0); const [attempt, setAttempt] = useState(0);
  const [buffering, setBuffering] = useState(false); const [muted, setMuted] = useState(false);
  const retryUsed = useRef(false); const positionRef = useRef(0); const durationRef = useRef(0);
  const savedPosition = useRef(library.snapshot().progress[playbackKey(item, episode)]?.seconds || 0);
  const lastPersist = useRef(0);
  useEffect(() => { const sub = BackHandler.addEventListener('hardwareBackPress', () => { onBack(); return true; }); return () => sub.remove(); }, [onBack]);
  useEffect(() => {
    let live = true; const temporary: string[] = [];
    const load = async () => {
      setLoading(true); setError(''); setSource(undefined); setCaptions([]);
      try {
        if (localUri) { if (live) setSource({ id: 'local', label: 'Offline', url: localUri }); return; }
        const resolved = await api.media(item, episode); resolved.sources.forEach(s => safeHttps(s.url));
        const chosen = chooseSource(resolved.sources, quality, Platform.isTV);
        if (!chosen) throw new Error('This title is not available to play.');
        if (live) { setMedia(resolved); setSource(chosen); }
        // Caption failures do not block the already-resolved video.
        const tracks = await Promise.all(resolved.subtitles.map(async (track, index) => {
          try {
            const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 12000);
            let response: Response;
            try { response = await fetch(safeHttps(track.url), { headers: MEDIA_HEADERS, signal: controller.signal }); } finally { clearTimeout(timeout); }
            if (!response.ok || Number(response.headers.get('content-length')) > 2 * 1024 * 1024) return null;
            const text = await response.text(); if (!live || text.length > 2 * 1024 * 1024 || !text.includes('-->')) return null;
            const vtt = text.trimStart().startsWith('WEBVTT'); const path = `${FS.cacheDirectory}caption-${Date.now()}-${index}.${vtt ? 'vtt' : 'srt'}`;
            temporary.push(path); await FS.writeAsStringAsync(path, text);
            if (!live) { await FS.deleteAsync(path, { idempotent: true }); return null; }
            return { title: track.label, language: track.lang.split('-')[0].toLowerCase() as TextTracks[number]['language'], type: vtt ? TextTrackType.VTT : TextTrackType.SUBRIP, uri: path };
          } catch { return null; }
        }));
        if (live) setCaptions(tracks.filter((t): t is NonNullable<typeof t> => Boolean(t)));
      } catch (e) { if (live) setError(e instanceof Error ? e.message : 'Playback could not start.'); }
      finally { if (live) setLoading(false); }
    };
    void load(); return () => { live = false; temporary.forEach(path => { void FS.deleteAsync(path, { idempotent: true }); }); };
  }, [item.id, episode?.seasonNumber, episode?.episodeNumber, localUri, attempt]);
  useEffect(() => () => { library.update(item, episode, positionRef.current, durationRef.current); }, [item.id, episode?.id]);
  const changeQuality = async (height: number) => {
    if (loading) return; setLoading(true); setError('');
    try { const resolved = await api.media(item, episode, height || undefined); const chosen = chooseSource(resolved.sources, height, Platform.isTV); if (!chosen) throw new Error(); safeHttps(chosen.url); savedPosition.current = positionRef.current; setQuality(height); setSource(chosen); }
    catch { setError('Could not change quality. Try again.'); } finally { setLoading(false); }
  };
  const seek = (delta: number) => { const next = Math.min(duration, Math.max(0, position + delta)); video.current?.seek(next); setPosition(next); };
  const retry = () => { savedPosition.current = positionRef.current; retryUsed.current = false; setAttempt(a => a + 1); };
  return <View style={styles.fill}>
    <View style={[styles.row, { paddingHorizontal: 20, paddingTop: 24 }]}><Button label="Back" onPress={onBack} /><Text style={styles.heading}>{item.title}{episode ? ` · S${episode.seasonNumber} E${episode.episodeNumber}` : ''}</Text>{localUri && <Text style={styles.muted}>OFFLINE</Text>}</View>
    <View style={{ flex: 1, minHeight: 220, backgroundColor: '#000' }}>
      {source && !error && <Video key={source.url} ref={video} source={{ uri: source.url, ...(localUri ? {} : { headers: MEDIA_HEADERS }) }} style={{ width: '100%', height: '100%' }} resizeMode="contain" controls paused={paused} muted={muted} textTracks={captions}
        selectedTextTrack={captionIndex < 0 ? { type: SelectedTrackType.DISABLED } : { type: SelectedTrackType.INDEX, value: captionIndex }}
        onLoad={({ duration: value }) => { setDuration(value); durationRef.current = value; setLoading(false); video.current?.seek(savedPosition.current < value - 15 ? savedPosition.current : 0); }} onBuffer={({ isBuffering }) => setBuffering(isBuffering)}
        onProgress={({ currentTime }) => { positionRef.current = currentTime; setPosition(currentTime); if (Date.now() - lastPersist.current > 5000) { lastPersist.current = Date.now(); library.update(item, episode, currentTime, durationRef.current); } }}
        onEnd={() => { library.update(item, episode, duration, duration); setPaused(true); }}
        onError={() => { if (!localUri && !retryUsed.current) { retryUsed.current = true; savedPosition.current = positionRef.current; setAttempt(a => a + 1); } else { setLoading(false); setError(localUri ? 'This saved file could not be played.' : 'Playback stopped. Retry to get a fresh stream.'); } }} />}
      {!source && loading && <Message title="Preparing your video…" loading />}{buffering && !error && <Text style={{ position: 'absolute', bottom: 20, left: 20, color: '#fff' }}>Buffering…</Text>}{error && <Message title="Unable to play" text={error} retry={retry} />}
    </View>
    <ScrollView style={{ maxHeight: 220 }} contentContainerStyle={{ padding: 20 }}>
      <View style={styles.row}><Button label={paused ? 'Play' : 'Pause'} onPress={() => setPaused(p => !p)} disabled={!source || Boolean(error)} primary /><Button label="−10 seconds" onPress={() => seek(-10)} /><Button label="+10 seconds" onPress={() => seek(10)} /><Button label={muted ? 'Unmute' : 'Mute'} onPress={() => setMuted(m => !m)} />{onNext && <Button label="Next episode" onPress={onNext} />}</View>
      {!localUri && <View style={styles.row}><Text style={styles.muted}>Quality</Text><Button label={quality === 0 ? 'Auto ✓' : 'Auto'} onPress={() => { void changeQuality(0); }} />{Array.from(new Set(media?.sources.map(s => s.height).filter((h): h is number => Boolean(h)))).sort((a,b) => b-a).map(h => <Button key={h} label={`${h}p${quality === h ? ' ✓' : ''}`} onPress={() => { void changeQuality(h); }} />)}</View>}
      {captions.length > 0 && <View style={styles.row}><Text style={styles.muted}>Captions</Text><Button label="Off" onPress={() => setCaptionIndex(-1)} />{captions.map((t,i) => <Button key={t.uri} label={`${t.title}${captionIndex === i ? ' ✓' : ''}`} onPress={() => setCaptionIndex(i)} />)}</View>}
    </ScrollView>
  </View>;
}
