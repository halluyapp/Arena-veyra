import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
const moduleSource = {
  "@react-native-async-storage/async-storage": `export default { getItem:async()=>globalThis.driver.stored, setItem:async(k,v)=>{globalThis.driver.stored=v;} };`,
  "expo-file-system/legacy": `export const documentDirectory='file:///private/';export const EncodingType={Base64:'base64'};export const makeDirectoryAsync=async()=>{};export const getFreeDiskStorageAsync=async()=>globalThis.driver.free;export const deleteAsync=async p=>{globalThis.driver.files.delete(p);};export const getInfoAsync=async p=>{const b=globalThis.driver.files.get(p);return b?{exists:true,isDirectory:false,size:b.length}:{exists:false};};export const readAsStringAsync=async(p,o)=>Buffer.from(globalThis.driver.files.get(p).slice(o.position,o.position+o.length)).toString('base64');`,
  "@kesha-antonov/react-native-background-downloader": `export const setConfig=()=>{};export const completeHandler=()=>{};export const getExistingDownloadTasks=async()=>[];export const createDownloadTask=p=>globalThis.driver.create(p);`,
  "react-native": `export const Platform={OS:'android',Version:32};export const PermissionsAndroid={};`,
  "./api": `export const api={download:async()=>{if(globalThis.driver.apiError)throw new Error('Unavailable');return globalThis.driver.descriptor;}};`,
};
registerHooks({
  resolve(specifier, context, next) {
    if (moduleSource[specifier])
      return {
        url: `data:text/javascript,${encodeURIComponent(moduleSource[specifier])}`,
        shortCircuit: true,
      };
    if (
      specifier.startsWith("./") &&
      context.parentURL?.includes("/src/") &&
      !specifier.endsWith(".ts")
    )
      return next(new URL(`${specifier}.ts`, context.parentURL).href, context);
    return next(specifier, context);
  },
});
const atom = (name, payload = []) => [
  0,
  0,
  0,
  8 + payload.length,
  ...Array.from(name).map((c) => c.charCodeAt(0)),
  ...payload,
];
const mp4 = Uint8Array.from([
  ...atom("ftyp", [0, 0, 0, 0]),
  ...atom("moov", [0, 0, 0, 0]),
  ...atom("mdat", [1, 2, 3, 4]),
]);
const movie = {
  id: "zh:1",
  subjectId: "1",
  detailPath: "one",
  title: "One",
  type: "movie",
};
let sequence = 0;
async function setup() {
  const tasks = new Map();
  globalThis.driver = {
    stored: null,
    free: 1024 ** 3,
    files: new Map(),
    descriptor: {
      url: "https://cdn.example/signed",
      sizeBytes: mp4.length,
      expiresAt: Date.now() + 600000,
    },
    create(params) {
      const handlers = {};
      const task = {
        id: params.id,
        state: "PENDING",
        params,
        handlers,
        begin(fn) {
          handlers.begin = fn;
          return this;
        },
        progress(fn) {
          handlers.progress = fn;
          return this;
        },
        done(fn) {
          handlers.done = fn;
          return this;
        },
        error(fn) {
          handlers.error = fn;
          return this;
        },
        start() {
          this.state = "DOWNLOADING";
        },
        async pause() {
          this.state = "PAUSED";
        },
        async resume() {
          this.state = "DOWNLOADING";
        },
        async stop() {
          this.state = "STOPPED";
        },
      };
      tasks.set(params.id, task);
      return task;
    },
  };
  const { downloads } = await import(`../src/downloads.ts?test=${++sequence}`);
  await downloads.init();
  return { downloads, tasks, driver: globalThis.driver };
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 25));
test("queue creates a private native transfer with all required headers", async () => {
  const { downloads, tasks } = await setup();
  await downloads.queue(movie, undefined, 480);
  const [task] = tasks.values();
  assert.equal(downloads.records[0].state, "downloading");
  assert.match(task.params.destination, /^\/private\/downloads\//);
  assert.equal(task.params.headers.Origin, "https://www.moviebox.ph");
  assert.ok(!task.params.destination.includes("%"));
});
test("native progress is measured, not inferred from expected size", async () => {
  const { downloads, tasks } = await setup();
  await downloads.queue(movie, undefined, 480);
  const [task] = tasks.values();
  task.handlers.progress({ bytesDownloaded: 11, bytesTotal: mp4.length });
  assert.equal(downloads.records[0].bytes, 11);
  assert.equal(downloads.records[0].state, "downloading");
});
test("pause/resume retains a native task for a still-fresh signed URL", async () => {
  const { downloads, tasks } = await setup();
  await downloads.queue(movie, undefined, 480);
  const record = downloads.records[0];
  const task = tasks.get(record.id);
  await downloads.pause(record.id);
  assert.equal(downloads.records[0].state, "paused");
  await downloads.resume(record.id);
  assert.equal(task.state, "DOWNLOADING");
  assert.equal(downloads.records[0].state, "downloading");
  assert.equal(tasks.size, 1);
});
test("completion requires a real, complete MP4 on disk", async () => {
  const { downloads, tasks, driver } = await setup();
  await downloads.queue(movie, undefined, 480);
  const record = downloads.records[0];
  driver.files.set(record.path, mp4);
  tasks.get(record.id).handlers.done();
  await tick();
  assert.equal(downloads.records[0].state, "completed");
  assert.equal(downloads.records[0].bytes, mp4.length);
  assert.equal(await downloads.localUri(downloads.records[0]), record.path);
});
test("short files fail instead of reporting fabricated completion bytes", async () => {
  const { downloads, tasks, driver } = await setup();
  await downloads.queue(movie, undefined, 480);
  const record = downloads.records[0];
  driver.files.set(record.path, mp4.slice(0, -1));
  tasks.get(record.id).handlers.done();
  await tick();
  assert.equal(downloads.records[0].state, "failed");
  assert.notEqual(downloads.records[0].bytes, mp4.length);
});
test("HTML response cannot become an offline movie", async () => {
  const { downloads, tasks, driver } = await setup();
  await downloads.queue(movie, undefined, 480);
  const record = downloads.records[0];
  driver.files.set(
    record.path,
    new TextEncoder().encode("<html>not a movie</html>"),
  );
  tasks.get(record.id).handlers.done();
  await tick();
  assert.equal(downloads.records[0].state, "failed");
});
test("missing files cannot be played offline", async () => {
  const { downloads } = await setup();
  await assert.rejects(
    downloads.localUri({
      state: "completed",
      path: "file:///private/downloads/missing.mp4",
    }),
  );
});
test("remove deletes both native file and queue record", async () => {
  const { downloads, driver } = await setup();
  await downloads.queue(movie, undefined, 480);
  const record = downloads.records[0];
  driver.files.set(record.path, mp4);
  await downloads.remove(record.id);
  assert.equal(downloads.records.length, 0);
  assert.equal(driver.files.has(record.path), false);
});
test("native transfer error results in a retryable failed record", async () => {
  const { downloads, tasks } = await setup();
  await downloads.queue(movie, undefined, 480);
  const record = downloads.records[0];
  tasks.get(record.id).handlers.error({ error: "403", errorCode: 403 });
  assert.equal(downloads.records[0].state, "failed");
  assert.ok(downloads.records[0].error);
});
test("low disk space refuses to start a transfer", async () => {
  const { downloads, tasks, driver } = await setup();
  driver.free = 0;
  await assert.rejects(downloads.queue(movie, undefined, 480), /free space/);
  assert.equal(tasks.size, 0);
});
test("expired URL resume re-resolves and restarts rather than unsafe append", async () => {
  const { downloads, tasks, driver } = await setup();
  driver.descriptor.expiresAt = Date.now() - 1;
  await downloads.queue(movie, undefined, 480);
  const record = downloads.records[0];
  const old = tasks.get(record.id);
  await downloads.pause(record.id);
  await downloads.resume(record.id);
  assert.notEqual(tasks.get(record.id), old);
  assert.equal(old.state, "STOPPED");
  assert.equal(downloads.records[0].bytes, 0);
});

test('completion works on Hermes without browser atob globals', async () => {
  const previous = globalThis.atob;
  globalThis.atob = undefined;
  try {
    const { downloads, tasks, driver } = await setup();
    await downloads.queue(movie, undefined, 480);
    const record = downloads.records[0];
    driver.files.set(record.path, mp4);
    tasks.get(record.id).handlers.done();
    await tick();
    assert.equal(downloads.records[0].state, 'completed');
  } finally { globalThis.atob = previous; }
});
