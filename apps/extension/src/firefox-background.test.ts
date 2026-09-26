import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  getBrowserApi: vi.fn(),
  getMenusApi: vi.fn(),
}));
vi.mock("./bridge", () => ({ request: mocks.request }));
vi.mock("./browser-api", () => ({
  getBrowserApi: mocks.getBrowserApi,
  getMenusApi: mocks.getMenusApi,
}));

type Listener = (...args: any[]) => unknown;
function event() {
  const listeners: Listener[] = [];
  return {
    addListener: vi.fn((listener: Listener) => listeners.push(listener)),
    listeners,
  };
}

let api: any;
let menuApi: any;

beforeEach(() => {
  vi.resetModules();
  mocks.request.mockReset();
  api = { runtime: { onInstalled: event(), onMessage: event() } };
  menuApi = { onClicked: event(), removeAll: vi.fn(async () => {}), create: vi.fn(async () => 1) };
  mocks.getBrowserApi.mockReturnValue(api);
  mocks.getMenusApi.mockReturnValue(menuApi);
  mocks.request.mockImplementation(async (command: unknown) => {
    if (typeof command === "object" && command !== null && "prepare_capture" in command)
      return { kind: "capture_status", decision: "pending", job: null };
    if (typeof command === "object" && command !== null && "get_capture_status" in command)
      return { kind: "capture_status", decision: "accepted", job: null };
    if (typeof command === "object" && command !== null && "start_capture" in command)
      return { kind: "download", job: {} };
    return { kind: "pong" };
  });
});

afterEach(() => vi.restoreAllMocks());

async function loadBackground() {
  return import("./firefox-background");
}

describe("Firefox direct-link background", () => {
  it("accepts only query-free HTTP(S) URLs with a safe filename", async () => {
    const { directLinkFromUrl } = await loadBackground();
    expect(directLinkFromUrl("https://cdn.example/files/my%20file.zip")).toEqual({
      url: "https://cdn.example/files/my%20file.zip",
      name: "my file.zip",
    });
    for (const value of [
      "javascript:alert(1)",
      "https://user:pass@cdn.example/file.zip",
      "https://cdn.example/file.zip?token=private",
      "https://cdn.example/file.zip?",
      "https://cdn.example/file.zip#fragment",
      "https://cdn.example/file.zip#",
      "https://cdn.example/files/%2Fetc%2Fpasswd",
      "https://cdn.example/",
    ]) expect(directLinkFromUrl(value)).toBeNull();
  });

  it("installs only a link context menu and starts only after IDG accepts", async () => {
    await loadBackground();
    await api.runtime.onInstalled.listeners[0]();
    await vi.waitFor(() => expect(menuApi.create).toHaveBeenCalledWith({
      id: "idg-direct-link",
      title: "Descargar enlace directo con IDG",
      contexts: ["link"],
    }));

    const menuClick = menuApi.onClicked.listeners[0];
    menuClick({ menuItemId: "another-extension-menu", linkUrl: "https://cdn.example/other.bin" });
    expect(mocks.request).not.toHaveBeenCalled();
    menuClick({ menuItemId: "idg-direct-link", linkUrl: "https://cdn.example/file.bin" });
    await vi.waitFor(() => expect(mocks.request).toHaveBeenCalledWith(
      expect.objectContaining({ start_capture: expect.anything() }),
    ));
    expect(mocks.request.mock.calls.map(([command]) => command)).toEqual([
      expect.objectContaining({ prepare_capture: expect.anything() }),
      "open_desktop",
      expect.objectContaining({ get_capture_status: expect.anything() }),
      expect.objectContaining({ start_capture: expect.anything() }),
    ]);
    const prepared = mocks.request.mock.calls[0][0].prepare_capture.proposal;
    expect(prepared).toMatchObject({ url: "https://cdn.example/file.bin", name: "file.bin", source: "direct" });
    expect(prepared.id).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("does not call IDG for a signed or non-HTTP link", async () => {
    const { submitDirectUrl } = await loadBackground();
    await expect(submitDirectUrl("https://cdn.example/file.bin?token=private")).rejects.toThrow(/sin parámetros/);
    await expect(submitDirectUrl("file:///C:/private.bin")).rejects.toThrow(/sin parámetros/);
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("coalesces a repeated explicit URL while the first request is awaiting IDG", async () => {
    let release!: (payload: unknown) => void;
    mocks.request.mockImplementation(async (command: unknown) => {
      if (typeof command === "object" && command !== null && "prepare_capture" in command)
        return await new Promise((resolve) => { release = resolve; });
      if (typeof command === "object" && command !== null && "get_capture_status" in command)
        return { kind: "capture_status", decision: "accepted", job: null };
      if (typeof command === "object" && command !== null && "start_capture" in command)
        return { kind: "download", job: {} };
      return { kind: "pong" };
    });
    const { submitDirectUrl } = await loadBackground();
    const first = submitDirectUrl("https://cdn.example/repeat.bin");
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    await expect(submitDirectUrl("https://cdn.example/repeat.bin")).rejects.toThrow(/ya se está enviando/);
    expect(mocks.request.mock.calls.filter(([command]) => typeof command === "object" && command !== null && "prepare_capture" in command)).toHaveLength(1);
    release({ kind: "capture_status", decision: "pending", job: null });
    await first;
  });
});
