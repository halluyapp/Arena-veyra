import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  Alert,
  AppState,
  BackHandler,
  Image,
  ImageBackground,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import * as SecureStore from "expo-secure-store";
import { api, configured, request, ApiError } from "./api";
import { Title, Episode, Media } from "./domain";
import { Activation } from "./Activation";
import { Player } from "./Player";
import { Download, downloads } from "./downloads";
import { library } from "./library";
import { Button, Message, styles } from "./ui";
type Page =
  | "Home"
  | "Discover"
  | "Search"
  | "My List"
  | "Downloads"
  | "Settings";
type Route =
  | { kind: "details"; item: Title }
  | { kind: "player"; item: Title; episode?: Episode; localUri?: string };
export default function App() {
  const [page, setPage] = useState<Page>("Home");
  const [routes, setRoutes] = useState<Route[]>([]);
  const [authorized, setAuthorized] = useState(!Platform.isTV);
  const [notice, setNotice] = useState("");
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const notify = useCallback((message: string) => {
    setNotice(message);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 7000);
  }, []);
  const activate = useCallback(() => setAuthorized(true), []);
  const local = useSyncExternalStore(library.subscribe, library.snapshot);
  const records = useSyncExternalStore(downloads.subscribe, downloads.snapshot);
  const pop = useCallback(() => setRoutes((r) => r.slice(0, -1)), []);
  useEffect(() => {
    void library.init();
    void downloads
      .init()
      .catch(() =>
        notify("Downloads could not be restored. Check device storage."),
      );
    return () => clearTimeout(noticeTimer.current);
  }, [notify]);
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (routes.length) {
        pop();
        return true;
      }
      if (page !== "Home") {
        setPage("Home");
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [routes.length, page, pop]);
  useEffect(() => {
    if (!Platform.isTV || !authorized) return;
    let live = true;
    const validate = async () => {
      try {
        const data = await request("/devices/session");
        if (live && data.authorized !== true) setAuthorized(false);
      } catch (e) {
        if (live && e instanceof ApiError && [401, 403].includes(e.status))
          setAuthorized(false);
      }
    };
    const timer = setInterval(() => {
      void validate();
    }, 60000);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void validate();
    });
    return () => {
      live = false;
      clearInterval(timer);
      sub.remove();
    };
  }, [authorized]);
  const open = (item: Title) =>
    setRoutes((r) => [...r, { kind: "details", item }]);
  const play = (item: Title, episode?: Episode, localUri?: string) =>
    setRoutes((r) => [...r, { kind: "player", item, episode, localUri }]);
  const current = routes[routes.length - 1];
  if (Platform.isTV && !authorized)
    return <Activation onAuthorized={activate} />;
  if (current?.kind === "player") {
    const episodes = current.item.seasons?.flatMap((s) => s.episodes) || [];
    const index = episodes.findIndex(
      (e) =>
        e.seasonNumber === current.episode?.seasonNumber &&
        e.episodeNumber === current.episode?.episodeNumber,
    );
    const next = index >= 0 ? episodes[index + 1] : undefined;
    return (
      <Player
        key={`${current.item.id}:${current.episode?.id || "movie"}:${current.localUri || ""}`}
        {...current}
        onBack={pop}
        onNext={
          !current.localUri && next
            ? () =>
                setRoutes((r) => [
                  ...r.slice(0, -1),
                  { kind: "player", item: current.item, episode: next },
                ])
            : undefined
        }
      />
    );
  }
  const pages: Page[] = [
    "Home",
    "Discover",
    "Search",
    "My List",
    "Downloads",
    "Settings",
  ];
  return (
    <SafeAreaView
      style={[styles.fill, { paddingTop: Platform.isTV ? 15 : 28 }]}
    >
      <StatusBar style="light" />
      <View
        style={{ flex: 1, flexDirection: Platform.isTV ? "row" : "column" }}
      >
        <View
          style={
            Platform.isTV
              ? { width: 190, padding: 24, backgroundColor: "#111" }
              : { paddingHorizontal: 20 }
          }
        >
          <Text accessibilityRole="header" style={styles.brand}>
            VEYRA
          </Text>
          <ScrollView
            horizontal={!Platform.isTV}
            style={!Platform.isTV ? { maxHeight: 70 } : undefined}
            contentContainerStyle={{ gap: 5 }}
          >
            {pages.map((p) => (
              <Button
                key={p}
                label={p}
                primary={p === page && !current}
                onPress={() => {
                  setRoutes([]);
                  setPage(p);
                }}
              />
            ))}
          </ScrollView>
        </View>
        <View style={{ flex: 1 }}>
          {current?.kind === "details" ? (
            <Details
              item={current.item}
              onBack={pop}
              onPlay={play}
              notify={notify}
            />
          ) : page === "Home" || page === "Discover" ? (
            <Home onOpen={open} discover={page === "Discover"} />
          ) : page === "Search" ? (
            <Search onOpen={open} />
          ) : page === "My List" ? (
            <ScrollView contentContainerStyle={{ padding: 24 }}>
              <Text style={styles.heroTitle}>Your world, collected.</Text>
              <Rail title="My List" items={local.saved} onOpen={open} />
              <Text style={styles.heading}>Continue watching</Text>
              {Object.values(local.progress)
                .filter((p) => p.seconds > 20 && p.seconds < p.duration * 0.95)
                .sort((a, b) => b.updated - a.updated)
                .map((p) => (
                  <View
                    key={`${p.item.id}:${p.episode?.id || ""}`}
                    style={styles.panel}
                  >
                    <Text style={styles.subtitle}>
                      {p.item.title}
                      {p.episode
                        ? ` · S${p.episode.seasonNumber} E${p.episode.episodeNumber}`
                        : ""}
                    </Text>
                    <Button
                      label="Continue"
                      onPress={() => play(p.item, p.episode)}
                    />
                  </View>
                ))}
            </ScrollView>
          ) : page === "Downloads" ? (
            <DownloadScreen
              records={records}
              onPlay={async (r) => {
                const uri = await downloads.localUri(r);
                play(r.item, r.episode, uri);
              }}
              notify={notify}
            />
          ) : (
            <Settings
              onUnlink={async () => {
                await request("/devices/session", {}, { method: "DELETE" });
                await SecureStore.deleteItemAsync("veyra-device-token");
                setAuthorized(false);
              }}
              notify={notify}
            />
          )}
        </View>
      </View>
      {notice ? (
        <View
          accessibilityLiveRegion="polite"
          style={{ padding: 18, backgroundColor: "#38111e" }}
        >
          <Text style={styles.body}>{notice}</Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
}
function message(e: unknown) {
  return e instanceof Error ? e.message : "Something went wrong. Try again.";
}
function Card({
  item,
  onOpen,
}: {
  item: Title;
  onOpen: (item: Title) => void;
}) {
  const [focus, setFocus] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.title}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      onPress={() => onOpen(item)}
      style={{
        width: Platform.isTV ? 175 : 140,
        marginRight: 15,
        borderRadius: 12,
        padding: 4,
        borderWidth: 2,
        borderColor: focus ? "#fff" : "transparent",
        backgroundColor: focus ? "#38111e" : "transparent",
      }}
    >
      {item.poster ? (
        <Image
          source={{ uri: item.poster }}
          style={{ width: "100%", aspectRatio: 2 / 3, borderRadius: 8 }}
        />
      ) : (
        <View
          style={{
            aspectRatio: 2 / 3,
            backgroundColor: "#202020",
            borderRadius: 8,
          }}
        />
      )}
      <Text
        numberOfLines={2}
        style={[styles.body, { fontWeight: "600", marginBottom: 2 }]}
      >
        {item.title}
      </Text>
      <Text style={styles.muted}>
        {[
          item.year,
          item.type === "series"
            ? "Series"
            : item.type === "movie"
              ? "Movie"
              : "",
          item.rating,
        ]
          .filter(Boolean)
          .join(" · ")}
      </Text>
    </Pressable>
  );
}
function Rail({
  title,
  items,
  onOpen,
}: {
  title: string;
  items: Title[];
  onOpen: (item: Title) => void;
}) {
  return (
    <View style={{ marginVertical: 12 }}>
      <Text style={styles.heading}>{title}</Text>
      {items.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {items.map((item) => (
            <Card key={item.id} item={item} onOpen={onOpen} />
          ))}
        </ScrollView>
      ) : (
        <Text style={styles.muted}>Nothing here yet.</Text>
      )}
    </View>
  );
}
function Home({
  onOpen,
  discover,
}: {
  onOpen: (item: Title) => void;
  discover: boolean;
}) {
  const [data, setData] = useState<{
    hero: Title[];
    rails: { id: string; title: string; items: Title[] }[];
  }>();
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    setError("");
    setData(undefined);
    api
      .home(c.signal)
      .then((d) => {
        if (!c.signal.aborted) setData(d as any);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(message(e));
      });
    return () => c.abort();
  }, [version]);
  if (error)
    return (
      <Message
        title="Unable to load your catalog"
        text={error}
        retry={() => setVersion((v) => v + 1)}
      />
    );
  if (!data) return <Message title="Finding your next watch…" loading />;
  if (!data.hero.length && !data.rails.length)
    return (
      <Message
        title="Nothing to show yet"
        text="The catalog has no available titles right now."
        retry={() => setVersion((v) => v + 1)}
      />
    );
  const hero = data.hero[0];
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
      {!discover && hero && (
        <ImageBackground
          source={
            hero.backdrop || hero.poster
              ? { uri: hero.backdrop || hero.poster }
              : undefined
          }
          style={{
            minHeight: Platform.isTV ? 370 : 420,
            justifyContent: "flex-end",
            backgroundColor: "#171717",
          }}
        >
          <View style={{ padding: 28, backgroundColor: "rgba(0,0,0,0.65)" }}>
            <Text
              style={[styles.muted, { color: "#fa456b", letterSpacing: 3 }]}
            >
              IN THE SPOTLIGHT
            </Text>
            <Text style={styles.heroTitle}>{hero.title}</Text>
            <Text numberOfLines={3} style={[styles.body, { maxWidth: 650 }]}>
              {hero.description}
            </Text>
            <View style={styles.row}>
              <Button
                label="Explore title"
                primary
                onPress={() => onOpen(hero)}
              />
              <Button label="+ My List" onPress={() => library.toggle(hero)} />
            </View>
          </View>
        </ImageBackground>
      )}
      <View style={{ paddingHorizontal: 24 }}>
        {discover && (
          <Text style={styles.heroTitle}>Discover your next obsession.</Text>
        )}
        {discover && data.hero.length > 0 && (
          <Rail title="Featured" items={data.hero} onOpen={onOpen} />
        )}
        {data.rails.map((r) => (
          <Rail key={r.id} {...r} onOpen={onOpen} />
        ))}
      </View>
    </ScrollView>
  );
}
function Search({ onOpen }: { onOpen: (item: Title) => void }) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Title[]>([]);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    if (!query.trim()) {
      setItems([]);
      setMore(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    const timer = setTimeout(() => {
      api
        .search(query.trim(), page, c.signal)
        .then((d) => {
          if (c.signal.aborted) return;
          setItems((old) =>
            page === 1
              ? (d.items as any)
              : ([
                  ...old,
                  ...d.items.filter(
                    (i: any) => !old.some((o) => o.id === i.id),
                  ),
                ] as any),
          );
          setMore(d.pager.hasMore);
        })
        .catch((e) => {
          if (!c.signal.aborted) setError(message(e));
        })
        .finally(() => {
          if (!c.signal.aborted) setLoading(false);
        });
    }, 350);
    return () => {
      clearTimeout(timer);
      c.abort();
    };
  }, [query, page, retry]);
  return (
    <ScrollView
      contentContainerStyle={{ padding: 24 }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.heroTitle}>Find your next watch.</Text>
      <TextInput
        accessibilityLabel="Search movies and series"
        placeholder="Movies, series and more"
        placeholderTextColor="#96969b"
        value={query}
        onChangeText={(q) => {
          setQuery(q);
          setPage(1);
          setItems([]);
        }}
        style={styles.input}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {error ? (
        <Message
          title="Search unavailable"
          text={error}
          retry={() => setRetry((r) => r + 1)}
        />
      ) : (
        <>
          <View
            style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 20 }}
          >
            {items.map((item) => (
              <Card key={item.id} item={item} onOpen={onOpen} />
            ))}
          </View>
          {loading ? (
            <Message title="Searching…" loading />
          ) : query.trim() && !items.length ? (
            <Message title="No matches" text="Try another title." />
          ) : !query.trim() ? (
            <Message
              title="What are you in the mood for?"
              text="Search the live catalog by title."
            />
          ) : null}
          {more && !loading && (
            <Button label="Load more" onPress={() => setPage((p) => p + 1)} />
          )}
        </>
      )}
    </ScrollView>
  );
}
function Details({
  item,
  onBack,
  onPlay,
  notify,
}: {
  item: Title;
  onBack: () => void;
  onPlay: (item: Title, episode?: Episode) => void;
  notify: (message: string) => void;
}) {
  const [detail, setDetail] = useState<Title>();
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [season, setSeason] = useState(0);
  const [downloadEpisode, setDownloadEpisode] = useState<Episode>();
  const [options, setOptions] = useState<Media>();
  const [preparing, setPreparing] = useState(false);
  const local = useSyncExternalStore(library.subscribe, library.snapshot);
  useEffect(() => {
    let live = true;
    setError("");
    api
      .details(item)
      .then((d) => {
        if (!d) throw new Error("This title is unavailable.");
        if (live) setDetail(d.title as any);
      })
      .catch((e) => {
        if (live) setError(message(e));
      });
    return () => {
      live = false;
    };
  }, [item.id, version]);
  const prepare = async (episode?: Episode) => {
    if (!detail || preparing) return;
    if (detail.type === "series" && !episode) {
      notify("Choose an episode to download.");
      return;
    }
    setPreparing(true);
    try {
      const media = await api.media(detail, episode);
      if (!media.sources.length)
        throw new Error("No download qualities are available.");
      setDownloadEpisode(episode);
      setOptions(media);
    } catch (e) {
      notify(message(e));
    } finally {
      setPreparing(false);
    }
  };
  if (error)
    return (
      <Message
        title="Unable to load this title"
        text={error}
        retry={() => setVersion((v) => v + 1)}
      />
    );
  if (!detail) return <Message title="Loading title…" loading />;
  const episodes = detail.seasons?.[season]?.episodes || [];
  const saved = local.saved.some((t) => t.id === detail.id);
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
      <ImageBackground
        source={
          detail.backdrop || detail.poster
            ? { uri: detail.backdrop || detail.poster }
            : undefined
        }
        style={{
          minHeight: 320,
          justifyContent: "flex-end",
          backgroundColor: "#171717",
        }}
      >
        <View style={{ padding: 28, backgroundColor: "rgba(0,0,0,.65)" }}>
          <Button label="Back" onPress={onBack} />
          <Text style={styles.heroTitle}>{detail.title}</Text>
          <Text style={styles.muted}>
            {[detail.year, detail.rating, ...(detail.genres || [])]
              .filter(Boolean)
              .join(" · ")}
          </Text>
          <View style={styles.row}>
            <Button
              label={detail.type === "series" ? "Play first episode" : "Play"}
              disabled={detail.type === "series" && !episodes.length}
              primary
              onPress={() =>
                onPlay(
                  detail,
                  detail.type === "series" ? episodes[0] : undefined,
                )
              }
            />
            <Button
              label={saved ? "✓ In My List" : "+ My List"}
              onPress={() => library.toggle(detail)}
            />
            <Button
              label={preparing ? "Preparing…" : "Download"}
              disabled={preparing}
              onPress={() => {
                void prepare(
                  detail.type === "series" ? episodes[0] : undefined,
                );
              }}
            />
          </View>
        </View>
      </ImageBackground>
      <View style={{ padding: 24 }}>
        <Text style={styles.body}>
          {detail.description || "No description is available."}
        </Text>
        {Boolean(detail.cast?.length) && (
          <>
            <Text style={styles.heading}>Cast</Text>
            <Text style={styles.body}>
              {detail.cast!.map((c) => c.name).join(" · ")}
            </Text>
          </>
        )}
        {detail.type === "series" && (
          <>
            <Text style={styles.heading}>Episodes</Text>
            <View style={styles.row}>
              {detail.seasons?.map((s, i) => (
                <Button
                  key={s.seasonNumber}
                  label={`${s.label || `Season ${s.seasonNumber}`}${season === i ? " ✓" : ""}`}
                  onPress={() => setSeason(i)}
                />
              ))}
            </View>
            {episodes.length ? (
              episodes.map((ep) => (
                <View key={ep.id} style={styles.panel}>
                  <Text style={styles.subtitle}>
                    {ep.title || `Episode ${ep.episodeNumber}`}
                  </Text>
                  <View style={styles.row}>
                    <Button
                      label="Play episode"
                      primary
                      onPress={() => onPlay(detail, ep)}
                    />
                    <Button
                      label="Download"
                      disabled={preparing}
                      onPress={() => {
                        void prepare(ep);
                      }}
                    />
                  </View>
                </View>
              ))
            ) : (
              <Text style={styles.muted}>No episodes are available.</Text>
            )}
          </>
        )}
      </View>
      <Modal
        visible={Boolean(options)}
        transparent
        animationType="fade"
        onRequestClose={() => setOptions(undefined)}
      >
        <View
          style={[
            styles.fill,
            styles.center,
            { backgroundColor: "rgba(0,0,0,.9)", padding: 32 },
          ]}
        >
          <Text style={styles.heading}>Download quality</Text>
          <Text style={styles.muted}>
            Saved privately inside VEYRA. Network required until complete.
          </Text>
          {options?.sources.map((source) => (
            <Button
              key={source.id}
              label={`${source.label}${source.sizeBytes ? ` · ${(source.sizeBytes / 1024 / 1024).toFixed(0)} MB` : ""}`}
              onPress={() => {
                setOptions(undefined);
                void downloads
                  .queue(detail, downloadEpisode, source.height || 0)
                  .then(() => notify("Download added."))
                  .catch((e) => notify(message(e)));
              }}
            />
          ))}
          <Button label="Cancel" onPress={() => setOptions(undefined)} />
        </View>
      </Modal>
    </ScrollView>
  );
}
function DownloadScreen({
  records,
  onPlay,
  notify,
}: {
  records: Download[];
  onPlay: (r: Download) => Promise<void>;
  notify: (s: string) => void;
}) {
  const act = (promise: Promise<unknown>) => {
    void promise.catch((e) => notify(message(e)));
  };
  return (
    <ScrollView contentContainerStyle={{ padding: 24 }}>
      <Text style={styles.heroTitle}>Made for offline.</Text>
      <Text style={styles.muted}>
        Private downloads. Real progress. Your next watch, wherever you are.
      </Text>
      {!records.length && (
        <Message
          title="Your downloads live here"
          text="Choose a quality from a title or episode to save it inside VEYRA."
        />
      )}
      {records.map((r) => (
        <View key={r.id} style={styles.panel}>
          <Text style={styles.heading}>{r.item.title}</Text>
          <Text style={styles.muted}>
            {r.episode
              ? `S${r.episode.seasonNumber} E${r.episode.episodeNumber} · `
              : ""}
            {r.quality ? `${r.quality}p · ` : ""}
            {r.state}
          </Text>
          <Text style={styles.body}>
            {(r.bytes / 1024 / 1024).toFixed(1)} MB
            {r.expected
              ? ` / ${(r.expected / 1024 / 1024).toFixed(1)} MB · ${Math.min(100, Math.floor((r.bytes / r.expected) * 100))}%`
              : ""}
          </Text>
          {r.expected > 0 && (
            <View
              accessibilityRole="progressbar"
              accessibilityValue={{
                min: 0,
                max: 100,
                now: Math.min(100, Math.floor((r.bytes / r.expected) * 100)),
              }}
              style={{ height: 5, backgroundColor: "#333", borderRadius: 3 }}
            >
              <View
                style={{
                  height: 5,
                  backgroundColor: "#e5093f",
                  width: `${Math.min(100, (r.bytes / r.expected) * 100)}%`,
                }}
              />
            </View>
          )}
          {r.error && <Text style={styles.body}>{r.error}</Text>}
          <View style={styles.row}>
            {r.state === "completed" ? (
              <Button
                label="Play offline"
                primary
                onPress={() => act(onPlay(r))}
              />
            ) : r.state === "downloading" ? (
              <Button
                label="Pause"
                onPress={() => act(downloads.pause(r.id))}
              />
            ) : ["paused", "failed"].includes(r.state) ? (
              <Button
                label={r.state === "failed" ? "Retry" : "Resume"}
                onPress={() => act(downloads.resume(r.id))}
              />
            ) : null}
            <Button
              label="Remove"
              disabled={r.state === "removing"}
              onPress={() => act(downloads.remove(r.id))}
            />
          </View>
        </View>
      ))}
    </ScrollView>
  );
}
function Settings({
  onUnlink,
  notify,
}: {
  onUnlink: () => Promise<void>;
  notify: (s: string) => void;
}) {
  return (
    <ScrollView contentContainerStyle={{ padding: 28 }}>
      <Text style={styles.heroTitle}>Settings</Text>
      <View style={styles.panel}>
        <Text style={styles.heading}>Private by design</Text>
        <Text style={styles.body}>
          Downloads stay inside VEYRA. Your list and watch progress stay on this
          device.
        </Text>
        <Text style={styles.muted}>
          API: {configured ? "Configured" : "Not configured"} · Device:{" "}
          {Platform.isTV ? "Android TV" : "Android phone"}
        </Text>
      </View>
      <View style={styles.panel}>
        <Text style={styles.heading}>Downloads & notifications</Text>
        <Text style={styles.body}>
          Download progress uses Android notifications, not remote push. Android
          may interrupt background work. Completed files remain available
          offline.
        </Text>
      </View>
      {Platform.isTV && (
        <Button
          label="Unlink this TV"
          onPress={() =>
            Alert.alert(
              "Unlink this TV?",
              "You will need to activate it again.",
              [
                { text: "Cancel" },
                {
                  text: "Unlink",
                  onPress: () => {
                    void onUnlink().catch((e) => notify(message(e)));
                  },
                },
              ],
            )
          }
        />
      )}
    </ScrollView>
  );
}
