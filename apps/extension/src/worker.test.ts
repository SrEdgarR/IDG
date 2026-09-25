import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({ request: vi.fn(), watch: vi.fn() }));
vi.mock("./bridge", () => bridge);

type Handler = (...args: any[]) => unknown;

function makeEvent() {
  const listeners: Handler[] = [];
  return {
    listeners,
    addListener: vi.fn((listener: Handler) => { listeners.push(listener); }),
    removeListener: vi.fn((listener: Handler) => {
      const index = listeners.indexOf(listener);
      if (index >= 0) listeners.splice(index, 1);
    }),
  };
}

type WatchCallbacks = {
  onSnapshot: (value: any) => void;
  onChange: () => void;
  onClose: () => void;
  close: () => void;
};

let saved: Record<string, unknown>;
let items: Map<number, any>;
let watches: WatchCallbacks[];
let chromeApi: any;
let mode: string;
let hasDownloadsPermission: boolean;

const extensionState = () => ({ kind: "extension_state", state: { autopick_mode: mode, active_count: 0, jobs: [] } });

async function waitFor(assertion: () => void) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { assertion(); return; } catch (error) { lastError = error; }
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  throw lastError;
}

function snapshot(runtimeId: string, processId: number) {
  return { native_hosts: 1, runtime_id: runtimeId, process_id: processId, sequence: 0, clients: 1, stopping: false };
}

async function loadWorker() {
  vi.stubGlobal("chrome", chromeApi);
  await import("./worker");
  await waitFor(() => expect(chromeApi.downloads.onCreated.addListener).toHaveBeenCalledOnce());
  await waitFor(() => expect(watches).toHaveLength(1));
}

async function connectWorker() {
  await loadWorker();
  watches[0].onSnapshot(snapshot("runtime-1", 101));
  await waitFor(() => expect(chromeApi.action.setBadgeText).toHaveBeenCalledWith({ text: "" }));
}

async function send(message: unknown): Promise<any> {
  return new Promise((resolve) => {
    chromeApi.runtime.onMessage.listeners[0](message, {}, resolve);
  });
}

async function letTasksSettle() {
  await new Promise((resolve) => setTimeout(resolve, 10));
}

beforeEach(() => {
  vi.resetModules();
  bridge.request.mockReset();
  bridge.watch.mockReset();
  saved = {};
  items = new Map();
  watches = [];
  mode = "ask";
  hasDownloadsPermission = true;

  const onMessage = makeEvent();
  const onInstalled = makeEvent();
  const onAdded = makeEvent();
  const onRemoved = makeEvent();
  const onCreated = makeEvent();
  const onChanged = makeEvent();
  const onClicked = makeEvent();
  chromeApi = {
    runtime: {
      id: "idg-test-extension",
      onMessage,
      onInstalled,
      sendMessage: vi.fn(async () => undefined),
    },
    permissions: {
      contains: vi.fn(async () => hasDownloadsPermission),
      onAdded,
      onRemoved,
    },
    downloads: {
      onCreated,
      onChanged,
      search: vi.fn(async ({ id }: { id: number }) => items.has(id) ? [items.get(id)] : []),
      cancel: vi.fn(async (id: number) => {
        const item = items.get(id);
        if (item) item.state = "interrupted";
      }),
      download: vi.fn(async () => 1),
    },
    action: {
      setBadgeText: vi.fn(async () => undefined),
      setBadgeBackgroundColor: vi.fn(async () => undefined),
    },
    contextMenus: {
      onClicked,
      removeAll: vi.fn(async () => undefined),
      create: vi.fn(),
    },
    storage: {
      local: {
        get: vi.fn(async (keys: string | string[]) => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map((key) => [key, saved[key]]))),
        set: vi.fn(async (value: Record<string, unknown>) => { Object.assign(saved, value); }),
      },
    },
  };

  bridge.request.mockImplementation(async (command: any) => {
    if (command === "get_extension_state") return extensionState();
    if (typeof command === "object" && "prepare_capture" in command) return { kind: "capture_status", decision: "pending", job: null };
    if (typeof command === "object" && "get_capture_status" in command) return { kind: "capture_status", decision: "rejected", job: null };
    if (typeof command === "object" && "start_capture" in command) return { kind: "download", job: {} };
    if (command === "open_desktop") return { kind: "pong" };
    return { kind: "pong" };
  });
  bridge.watch.mockImplementation((onSnapshot: WatchCallbacks["onSnapshot"], onChange: () => void, onClose: () => void) => {
    const callbacks = { onSnapshot, onChange, onClose, close: vi.fn() };
    watches.push(callbacks);
    return callbacks.close;
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("Chromium worker policies and recovery", () => {
  it("does not offer a download when its referrer origin is ignored", async () => {
    saved.settings = { ignoredSites: ["https://ignored.example"], ignoredExtensions: [], ignoredMimes: [], minBytes: 0, unknownSize: "offer", suspendedUntil: 0 };
    await connectWorker();

    chromeApi.downloads.onCreated.listeners[0]({
      id: 7,
      url: "https://cdn.example/archive.zip",
      finalUrl: "https://cdn.example/archive.zip",
      referrer: "https://ignored.example/page",
      mime: "application/zip",
      totalBytes: 4 * 1024 * 1024,
      filename: "archive.zip",
      state: "in_progress",
    });
    await letTasksSettle();

    expect(saved.offers).toBeUndefined();
    expect(bridge.request).not.toHaveBeenCalledWith(expect.objectContaining({ prepare_capture: expect.anything() }), expect.anything());
  });

  it("offers an unknown-size transfer only when that policy is selected", async () => {
    saved.settings = { ignoredSites: [], ignoredExtensions: [], ignoredMimes: [], minBytes: 0, unknownSize: "offer", suspendedUntil: 0 };
    await connectWorker();

    chromeApi.downloads.onCreated.listeners[0]({
      id: 8,
      url: "https://cdn.example/stream",
      finalUrl: "https://cdn.example/stream",
      referrer: "",
      mime: "application/octet-stream",
      totalBytes: -1,
      filename: "stream.bin",
      state: "in_progress",
    });

    await waitFor(() => expect(saved.offers).toEqual([{ downloadId: 8, url: "https://cdn.example/stream", name: "stream.bin" }]));
    expect(bridge.request).not.toHaveBeenCalledWith(expect.objectContaining({ prepare_capture: expect.anything() }), expect.anything());
  });

  it("matches ignored extensions against the decoded filename, even when a directory contains a dot", async () => {
    saved.settings = { ignoredSites: [], ignoredExtensions: ["exe"], ignoredMimes: [], minBytes: 0, unknownSize: "offer", suspendedUntil: 0 };
    await connectWorker();

    chromeApi.downloads.onCreated.listeners[0]({
      id: 9,
      url: "https://cdn.example/release.v1/setup%2Eexe",
      finalUrl: "https://cdn.example/release.v1/setup%2Eexe",
      referrer: "",
      mime: "application/octet-stream",
      totalBytes: 4 * 1024 * 1024,
      filename: "C:\\Downloads\\setup.exe",
      state: "in_progress",
    });
    await letTasksSettle();

    expect(saved.offers).toBeUndefined();
    expect(bridge.request).not.toHaveBeenCalledWith(expect.objectContaining({ prepare_capture: expect.anything() }), expect.anything());
  });

  it("rejects a transfer URL containing a query before sending it to IDG", async () => {
    await loadWorker();

    const result = await send({ type: "direct", url: "https://cdn.example/file.zip?token=private", name: "file.zip" });

    expect(result).toMatchObject({ ok: false });
    expect(bridge.request).not.toHaveBeenCalledWith(expect.objectContaining({ prepare_capture: expect.anything() }), expect.anything());
  });

  it("accepts durable byte counts above JavaScript's safe-integer range", async () => {
    const capture = { id: "capture-64", source: "observed", url: "https://cdn.example/big.bin", name: "big.bin", downloadId: 19, phase: "accepted" };
    saved.pending = [capture];
    items.set(19, { id: 19, state: "in_progress" });
    let statuses = 0;
    bridge.request.mockImplementation(async (command: any) => {
      if (typeof command === "object" && "get_capture_status" in command) {
        statuses++;
        if (statuses === 1) return { kind: "capture_status", decision: "accepted", job: null };
        return { kind: "capture_status", decision: "accepted", job: { state: "downloading", durable_bytes: "9007199254740993" } };
      }
      if (typeof command === "object" && "start_capture" in command) return { kind: "download", job: {} };
      return { kind: "pong" };
    });

    await loadWorker();

    await waitFor(() => expect(chromeApi.downloads.cancel).toHaveBeenCalledWith(19));
    expect(saved.pending).toEqual([]);
  });

  it("ignores a delayed close event from the previous watcher after reconnecting", async () => {
    await connectWorker();
    const previous = watches[0];

    const result = await send({ type: "reconnect" });
    expect(result.connected).toBe(true);
    expect(watches).toHaveLength(2);

    watches[1].onSnapshot(snapshot("runtime-2", 202));
    await waitFor(() => expect(bridge.request.mock.calls.filter(([command]) => command === "get_extension_state").length).toBeGreaterThanOrEqual(3));
    previous.onClose();
    await letTasksSettle();

    expect(chromeApi.action.setBadgeText).not.toHaveBeenCalledWith({ text: "!" });
    const current = await send({ type: "reconnect" });
    expect(watches).toHaveLength(3);
    expect(watches[1].close).toHaveBeenCalledOnce();
    expect(current).toMatchObject({ ok: true, connected: true, processId: 202 });
  });
});
