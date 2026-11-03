import { toByteArray } from 'base64-js';
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FS from "expo-file-system/legacy";
import {
  createDownloadTask,
  getExistingDownloadTasks,
  setConfig,
  completeHandler,
} from "@kesha-antonov/react-native-background-downloader";
import type { DownloadTask } from "@kesha-antonov/react-native-background-downloader";
import { PermissionsAndroid, Platform } from "react-native";
import { api } from "./api";
import {
  type Title,
  type Episode,
  MEDIA_HEADERS,
  playbackKey,
  safeHttps,
  validateCompleted,
  validateMp4Atoms,
  privateFilename,
} from "./domain";
export type Download = {
  id: string;
  item: Title;
  episode?: Episode;
  quality: number;
  state:
    | "queued"
    | "downloading"
    | "paused"
    | "failed"
    | "completed"
    | "removing";
  bytes: number;
  expected: number;
  path: string;
  error?: string;
  expiresAt?: number;
};
const KEY = "veyra-native-downloads:v1";
const directory = `${FS.documentDirectory}downloads/`;
class Downloads {
  records: Download[] = [];
  tasks = new Map<string, DownloadTask>();
  listeners = new Set<() => void>();
  private initialized?: Promise<void>;
  private saving = Promise.resolve();
  private locks = new Set<string>();
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  snapshot = () => this.records;
  emit() {
    const encoded = JSON.stringify(this.records);
    this.saving = this.saving
      .then(() => AsyncStorage.setItem(KEY, encoded))
      .catch(() => {});
    this.listeners.forEach((fn) => fn());
  }
  patch(id: string, changes: Partial<Download>) {
    this.records = this.records.map((r) =>
      r.id === id ? { ...r, ...changes } : r,
    );
    this.emit();
  }
  init() {
    return (this.initialized ??= this.restore().catch((error) => {
      this.initialized = undefined;
      throw error;
    }));
  }
  private async restore() {
    await FS.makeDirectoryAsync(directory, { intermediates: true });
    setConfig({
      headers: MEDIA_HEADERS,
      showNotificationsEnabled: true,
      showCompletionNotification: false,
      showCancelAction: false,
      maxParallelDownloads: 2,
      progressInterval: 1000,
    });
    const raw = await AsyncStorage.getItem(KEY);
    try {
      this.records = raw ? JSON.parse(raw) : [];
    } catch {
      this.records = [];
    }
    this.records = (Array.isArray(this.records) ? this.records : []).filter(
      (r) => r.id && r.item?.id && r.path?.startsWith(directory),
    );
    const tasks = await getExistingDownloadTasks();
    for (const record of this.records) {
      if (record.state === "removing") {
        await FS.deleteAsync(record.path, { idempotent: true });
        continue;
      }
      const task = tasks.find((t) => t.id === record.id);
      if (record.state === "completed") {
        if (!(await this.valid(record))) {
          record.state = "failed";
          record.error =
            "The saved file is missing or incomplete. Download it again.";
        }
      } else if (task) {
        this.attach(task);
        if (task.state === "DONE") await this.finish(record.id);
        else
          record.state =
            task.state === "DOWNLOADING" ? "downloading" : "paused";
      } else {
        // Native completion may have happened while JavaScript was stopped.
        if (await this.valid(record)) record.state = "completed";
        else record.state = "paused";
      }
    }
    this.records = this.records.filter((r) => r.state !== "removing");
    this.emit();
  }
  private async valid(record: Download) {
    try {
      const info = await FS.getInfoAsync(record.path);
      if (!info.exists || info.isDirectory) return false;
      const prefix = await FS.readAsStringAsync(record.path, {
        encoding: FS.EncodingType.Base64,
        position: 0,
        length: 12,
      });
      // Only decode twelve bytes, never the entire movie.
      const bytes = Array.from(toByteArray(prefix));
      if (!validateCompleted(info.size, record.expected, bytes)) return false;
      return await validateMp4Atoms(info.size, async (position, length) => {
        const data = await FS.readAsStringAsync(record.path, {
          encoding: FS.EncodingType.Base64,
          position,
          length,
        });
        return toByteArray(data);
      });
    } catch {
      return false;
    }
  }
  async localUri(record: Download) {
    if (record.state !== "completed" || !(await this.valid(record)))
      throw new Error("The offline file is not available. Download it again.");
    return record.path;
  }
  private async finish(id: string) {
    const record = this.records.find((r) => r.id === id);
    if (!record || record.state === "removing") return;
    if (await this.valid(record)) {
      if (this.records.find((r) => r.id === id)?.state === "removing") return;
      const info = await FS.getInfoAsync(record.path);
      this.patch(id, {
        state: "completed",
        bytes: info.exists && !info.isDirectory ? info.size : record.bytes,
        error: "",
      });
    } else
      this.patch(id, {
        state: "failed",
        error: "The saved video is incomplete or invalid. Retry the download.",
      });
    this.tasks.delete(id);
    completeHandler(id);
  }
  private attach(task: DownloadTask) {
    this.tasks.set(task.id, task);
    task
      .begin(({ expectedBytes, headers }) => {
        const record = this.records.find((r) => r.id === task.id);
        if (
          !record ||
          record.state === "removing" ||
          this.tasks.get(task.id) !== task
        )
          return;
        const type =
          Object.entries(headers).find(
            ([k]) => k.toLowerCase() === "content-type",
          )?.[1] || "";
        if (/text\/|json/i.test(type)) {
          void task.stop();
          this.patch(task.id, {
            state: "failed",
            error: "The server returned a page instead of a video.",
          });
          return;
        }
        if (
          record.expected &&
          expectedBytes > 0 &&
          record.expected !== expectedBytes
        ) {
          void task.stop();
          this.patch(task.id, {
            state: "failed",
            error: "The video size changed. Retry from the beginning.",
          });
          return;
        }
        this.patch(task.id, {
          expected: record.expected || Math.max(0, expectedBytes),
        });
      })
      .progress(({ bytesDownloaded }) => {
        const record = this.records.find((r) => r.id === task.id);
        if (record?.state === "downloading" && this.tasks.get(task.id) === task)
          this.patch(task.id, { bytes: bytesDownloaded });
      })
      .done(() => {
        if (this.tasks.get(task.id) === task) void this.finish(task.id);
      })
      .error(() => {
        if (this.tasks.get(task.id) !== task) return;
        const record = this.records.find((r) => r.id === task.id);
        if (record && !["removing", "paused"].includes(record.state))
          this.patch(task.id, {
            state: "failed",
            error:
              "Download stopped. Check your connection and free space, then retry.",
          });
        this.tasks.delete(task.id);
      });
  }
  async queue(item: Title, episode: Episode | undefined, quality: number) {
    await this.init();
    const id = `${playbackKey(item, episode)}:q${quality}`;
    if (this.locks.has(id)) return;
    this.locks.add(id);
    try {
      if (
        this.records.some(
          (r) =>
            r.id === id &&
            ["queued", "downloading", "completed"].includes(r.state),
        )
      )
        return;
      const descriptor = await api.download(item, episode, quality);
      safeHttps(descriptor.url);
      const available = await FS.getFreeDiskStorageAsync();
      if (
        descriptor.sizeBytes &&
        available < descriptor.sizeBytes + 64 * 1024 * 1024
      )
        throw new Error("Not enough free space for this video.");
      if (Platform.OS === "android" && Number(Platform.Version) >= 33)
        await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
        );
      const path = `${directory}${privateFilename(id)}`;
      const previous = this.tasks.get(id);
      if (previous) await previous.stop();
      await FS.deleteAsync(path, { idempotent: true });
      const record: Download = {
        id,
        item,
        episode,
        quality,
        state: "queued",
        bytes: 0,
        expected: descriptor.sizeBytes || 0,
        path,
        expiresAt: descriptor.expiresAt,
      };
      this.records = [record, ...this.records.filter((r) => r.id !== id)];
      this.emit();
      const task = createDownloadTask({
        id,
        url: descriptor.url,
        destination: path.replace(/^file:\/\//, ""),
        headers: MEDIA_HEADERS,
        metadata: { id },
        notificationTitle: item.title,
      });
      this.attach(task);
      this.patch(id, { state: "downloading" });
      task.start();
    } catch (error) {
      if (this.records.some((r) => r.id === id))
        this.patch(id, {
          state: "failed",
          error:
            "Could not start this download. Check your connection and storage.",
        });
      throw error;
    } finally {
      this.locks.delete(id);
    }
  }
  async pause(id: string) {
    if (this.locks.has(id)) return;
    this.locks.add(id);
    try {
      await this.tasks.get(id)?.pause();
      this.patch(id, { state: "paused" });
    } finally {
      this.locks.delete(id);
    }
  }
  async resume(id: string) {
    const record = this.records.find((r) => r.id === id);
    if (!record || this.locks.has(id)) return;
    const task = this.tasks.get(id);
    // A signed URL with unknown/expired lifetime must be resolved again. Restart,
    // rather than append bytes from a potentially different resource.
    if (!task || !record.expiresAt || record.expiresAt <= Date.now() + 30_000) {
      await this.queue(record.item, record.episode, record.quality);
      return;
    }
    this.locks.add(id);
    try {
      await task.resume();
      this.patch(id, { state: "downloading", error: "" });
    } finally {
      this.locks.delete(id);
    }
  }
  async remove(id: string) {
    if (this.locks.has(id)) return;
    this.locks.add(id);
    try {
      const record = this.records.find((r) => r.id === id);
      if (!record) return;
      this.patch(id, { state: "removing" });
      await this.tasks.get(id)?.stop();
      this.tasks.delete(id);
      await FS.deleteAsync(record.path, { idempotent: true });
      this.records = this.records.filter((r) => r.id !== id);
      this.emit();
    } catch {
      this.patch(id, {
        state: "failed",
        error: "Could not delete the file. Try again.",
      });
    } finally {
      this.locks.delete(id);
    }
  }
}
export const downloads = new Downloads();
