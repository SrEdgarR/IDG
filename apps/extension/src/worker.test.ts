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
  it("attaches detection only after optional permission and detaches it on revocation", async () => {
    hasDownloadsPermission = false;
    vi.stubGlobal("chrome", chromeApi);
    await import("./worker");
    await waitFor(() => expect(watches).toHaveLength(1));
    expect(chromeApi.downloads.onCreated.listeners).toHaveLength(0);
    await waitFor(() => expect(chromeApi.contextMenus.create).toHaveBeenCalledWith({
      id: "idg-link", title: "Enviar enlace directo a IDG", contexts: ["link"],
    }));
    expect(chromeApi.contextMenus.create).toHaveBeenCalledTimes(1);

    hasDownloadsPermission = true;
    chromeApi.permissions.onAdded.listeners[0]({ permissions: ["downloads"], origins: [] });
    await waitFor(() => expect(chromeApi.downloads.onCreated.listeners).toHaveLength(1));
    chromeApi.permissions.onAdded.listeners[0]({ permissions: ["downloads"], origins: [] });
    await letTasksSettle();
    expect(chromeApi.downloads.onCreated.listeners).toHaveLength(1);

    hasDownloadsPermission = false;
    chromeApi.permissions.onRemoved.listeners[0]({ permissions: ["downloads"], origins: [] });
    await waitFor(() => expect(chromeApi.downloads.onCreated.listeners).toHaveLength(0));
  });

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

  it("keeps unknown-size observed transfers in Chromium even when offering unknown sizes is enabled", async () => {
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

    await letTasksSettle();
    expect(saved.offers).toBeUndefined();
    expect((await send({ type: "state" })).notice).toMatch(/no informa el método HTTP/i);
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

  it("applies site, MIME, and size exclusions without blocking an eligible transfer", async () => {
    saved.settings = { ignoredSites: ["https://private.example"], ignoredExtensions: [], ignoredMimes: ["application/x-test"], minBytes: 5 * 1024 * 1024, unknownSize: "browser", suspendedUntil: 0 };
    await connectWorker();
    const candidate = { url: "https://cdn.example/file.bin", finalUrl: "https://cdn.example/file.bin", referrer: "", mime: "application/octet-stream", totalBytes: 6 * 1024 * 1024, filename: "file.bin", state: "in_progress" };
    for (const item of [
      { ...candidate, id: 31, referrer: "https://private.example/page" },
      { ...candidate, id: 32, mime: "APPLICATION/X-TEST" },
      { ...candidate, id: 33, totalBytes: 4 * 1024 * 1024 },
      { ...candidate, id: 34, totalBytes: -1 },
    ]) chromeApi.downloads.onCreated.listeners[0](item);
    await letTasksSettle();
    expect(saved.offers).toBeUndefined();

    const allowed = { ...candidate, id: 35 };
    chromeApi.runtime.sendMessage.mockClear();
    chromeApi.downloads.onCreated.listeners[0](allowed);
    await waitFor(() => expect(chromeApi.runtime.sendMessage).toHaveBeenCalledWith({ type: "updated" }));
    expect(saved.offers).toBeUndefined();
    expect(allowed.state).toBe("in_progress");
    expect(bridge.request).not.toHaveBeenCalledWith(expect.objectContaining({ prepare_capture: expect.anything() }), expect.anything());
  });

  it("keeps an observed download in Chromium when its HTTP method cannot be verified", async () => {
    mode = "always";
    await connectWorker();
    const browserDownload = {
      id: 36,
      url: "http://127.0.0.1:8788/post-only.bin",
      finalUrl: "http://127.0.0.1:8788/post-only.bin",
      referrer: "http://127.0.0.1:8788/form",
      mime: "application/octet-stream",
      totalBytes: 2 * 1024 * 1024,
      filename: "post-only.bin",
      state: "in_progress",
    };
    expect("method" in browserDownload).toBe(false);

    chromeApi.runtime.sendMessage.mockClear();
    chromeApi.downloads.onCreated.listeners[0](browserDownload);
    await waitFor(() => expect(chromeApi.runtime.sendMessage).toHaveBeenCalledWith({ type: "updated" }));
    await letTasksSettle();

    const state = await send({ type: "state" });
    expect(state.notice).toMatch(/no informa el método HTTP/i);
    expect(browserDownload.state).toBe("in_progress");
    expect(saved.pending).toBeUndefined();
    expect(saved.offers).toBeUndefined();
    expect(bridge.request).not.toHaveBeenCalledWith(expect.objectContaining({ prepare_capture: expect.anything() }), expect.anything());
    expect(chromeApi.downloads.cancel).not.toHaveBeenCalled();
    expect(chromeApi.downloads.download).not.toHaveBeenCalled();
  });

  it("does not replay an old observed offer as a GET after a worker update", async () => {
    saved.offers = [{ downloadId: 37, url: "http://127.0.0.1:8788/post-only.bin", name: "post-only.bin" }];
    const browserDownload = { id: 37, state: "in_progress" };
    items.set(37, browserDownload);
    await connectWorker();

    const result = await send({ type: "acceptOffer", downloadId: 37 });
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/no informa el método HTTP/i) });
    expect(saved.offers).toEqual([]);
    expect(browserDownload.state).toBe("in_progress");
    expect(bridge.request).not.toHaveBeenCalledWith(expect.objectContaining({ prepare_capture: expect.anything() }), expect.anything());
    expect(chromeApi.downloads.cancel).not.toHaveBeenCalled();
    expect(chromeApi.downloads.download).not.toHaveBeenCalled();
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

  it("does not prepare the same offered browser download twice on rapid clicks", async () => {
    saved.offers = [{ downloadId: 25, url: "https://cdn.example/one.bin", name: "one.bin" }];
    items.set(25, { id: 25, state: "in_progress" });
    await loadWorker();

    const replies = await Promise.all([
      send({ type: "acceptOffer", downloadId: 25 }),
      send({ type: "acceptOffer", downloadId: 25 }),
    ]);
    expect(replies.every((reply) => !reply.ok && /no informa el método HTTP/i.test(reply.error))).toBe(true);
    expect(bridge.request.mock.calls.filter(([command]) => typeof command === "object" && "prepare_capture" in command)).toHaveLength(0);
    expect(saved.pending).toBeUndefined();
    expect(saved.offers).toEqual([]);
    expect(items.get(25).state).toBe("in_progress");
  });

  it("retains an uncertain proposal and resumes it after a lost host response", async () => {
    let available = false;
    bridge.request.mockImplementation(async (command: any) => {
      if (command === "get_extension_state") return extensionState();
      if (typeof command === "object" && "prepare_capture" in command) throw Error("response lost");
      if (typeof command === "object" && "get_capture_status" in command) {
        if (!available) throw Error("host disconnected");
        return { kind: "capture_status", decision: "accepted", job: { state: "completed", durable_bytes: "4" } };
      }
      if (typeof command === "object" && "start_capture" in command) return { kind: "download", job: {} };
      return { kind: "pong" };
    });
    await loadWorker();

    const initial = await send({ type: "direct", url: "https://cdn.example/retry.bin", name: "retry.bin" });
    expect(initial.ok).toBe(false);
    expect(saved.pending).toEqual([expect.objectContaining({ url: "https://cdn.example/retry.bin" })]);
    const repeat = await send({ type: "direct", url: "https://cdn.example/retry.bin", name: "retry.bin" });
    expect(repeat.ok).toBe(true);
    expect(bridge.request.mock.calls.filter(([command]) => typeof command === "object" && "prepare_capture" in command)).toHaveLength(1);
    expect(chromeApi.downloads.download).not.toHaveBeenCalled();

    available = true;
    watches[0].onSnapshot(snapshot("runtime-recovered", 202));
    await waitFor(() => expect(saved.pending).toEqual([]));
    expect(bridge.request).toHaveBeenCalledWith(expect.objectContaining({ start_capture: expect.anything() }));
    expect(chromeApi.downloads.download).not.toHaveBeenCalled();
  });

  it("does not treat an interrupted Chromium original as transferred without durable IDG bytes", async () => {
    saved.pending = [{ id: "capture-interrupted", source: "observed", url: "https://cdn.example/file.bin", name: "file.bin", downloadId: 40, phase: "started" }];
    items.set(40, { id: 40, state: "interrupted" });
    let durable = "0";
    bridge.request.mockImplementation(async (command: any) => {
      if (command === "get_extension_state") return extensionState();
      if (typeof command === "object" && "get_capture_status" in command) return { kind: "capture_status", decision: "accepted", job: { state: "downloading", durable_bytes: durable } };
      return { kind: "pong" };
    });
    await loadWorker();
    await waitFor(() => expect(bridge.request).toHaveBeenCalledWith(expect.objectContaining({ get_capture_status: expect.anything() })));
    await letTasksSettle();
    expect(saved.pending).toHaveLength(1);
    expect(chromeApi.downloads.cancel).not.toHaveBeenCalled();
    expect(bridge.request).not.toHaveBeenCalledWith(expect.objectContaining({ abort_capture: expect.anything() }));

    durable = "1";
    watches[0].onSnapshot(snapshot("runtime-recovered", 202));
    await waitFor(() => expect(saved.pending).toEqual([]));
    expect(chromeApi.downloads.cancel).not.toHaveBeenCalled();
  });

  it("resolves a failed accepted capture while Chromium still owns its original", async () => {
    saved.pending = [{ id: "capture-failed", source: "observed", url: "https://cdn.example/file.bin", name: "file.bin", downloadId: 41, phase: "accepted" }];
    items.set(41, { id: 41, state: "in_progress" });
    bridge.request.mockImplementation(async (command: any) => {
      if (typeof command === "object" && "get_capture_status" in command) return { kind: "capture_status", decision: "accepted", job: { state: "failed", durable_bytes: "0" } };
      if (typeof command === "object" && "start_capture" in command) throw Error("failed job cannot restart");
      return { kind: "pong" };
    });

    await loadWorker();
    await waitFor(() => expect(bridge.request).toHaveBeenCalledWith(expect.objectContaining({ get_capture_status: expect.anything() })));
    await letTasksSettle();
    expect(saved.pending).toEqual([]);
    expect(items.get(41).state).toBe("in_progress");
    expect(chromeApi.downloads.cancel).not.toHaveBeenCalled();
    expect(bridge.request).not.toHaveBeenCalledWith(expect.objectContaining({ start_capture: expect.anything() }));
  });
});
