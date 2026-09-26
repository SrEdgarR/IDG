import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("./bridge", () => ({ request: mocks.request }));

let messageHandler: ((message: unknown, sender: chrome.runtime.MessageSender) => Promise<unknown> | undefined) | undefined;
let headersListener: ((details: any) => unknown) | undefined;
let updatedListener: ((tabId: number, change: any) => void) | undefined;
let removedListener: ((tabId: number) => void) | undefined;

beforeEach(() => {
  vi.resetModules();
  mocks.request.mockReset();
  messageHandler = undefined;
  headersListener = undefined;
  updatedListener = undefined;
  removedListener = undefined;
  vi.stubGlobal("browser", {
    runtime: {},
    webRequest: { onHeadersReceived: { addListener: (listener: typeof headersListener, _filter: unknown, _extra: unknown) => { headersListener = listener; } } },
    tabs: {
      onUpdated: { addListener: (listener: typeof updatedListener) => { updatedListener = listener; } },
      onRemoved: { addListener: (listener: typeof removedListener) => { removedListener = listener; } },
    },
  });
});

afterEach(() => vi.unstubAllGlobals());

async function install() {
  const module = await import("./media-background");
  messageHandler = module.handleMediaMessage;
  if (!headersListener) throw new Error("Media listeners not installed");
}

function send(message: unknown, sender: chrome.runtime.MessageSender = { id: "extension-id" }): Promise<unknown> {
  const result = messageHandler!(message, sender);
  if (!result) throw new Error("Expected media handler");
  return result;
}

async function enable(tabId: number, pageOrigin = "https://media.example") {
  expect(await send({ type: "idg-media-observe-tab", enabled: true, tabId, pageOrigin })).toEqual({ ok: true });
}

const candidate = {
  tabId: 4,
  frameId: 0,
  playerId: "player-1",
  url: "https://media.example/clip.mp4",
  availability: "direct",
  transferReason: null,
  thumbnail: null,
  media: {
    kind: "video", title: "local clip", mime_type: "video/mp4", width: 640, height: 360,
    frame_rate_milli: null, video_codec: null, audio_codec: null, video_tracks: null, audio_tracks: null,
    duration_ms: "1000", size_bytes: null, size_kind: "unknown", manifest_kind: "none",
  },
};

it("records only response metadata for an explicitly enabled same-origin tab", async () => {
  await install();
  headersListener!({
    tabId: 4, frameId: 0, method: "GET", url: candidate.url, statusCode: 200,
    responseHeaders: [
      { name: "Content-Type", value: "video/mp4" },
      { name: "Content-Length", value: "1234" },
      { name: "Set-Cookie", value: "secret=session" },
    ],
  });
  await expect(send({ type: "idg-media-observations", tabId: 4, pageOrigin: "https://media.example" }))
    .resolves.toMatchObject({ ok: false, observations: [] });

  await enable(4);
  headersListener!({
    tabId: 4, frameId: 0, method: "GET", url: candidate.url, statusCode: 200,
    responseHeaders: [
      { name: "Content-Type", value: "video/mp4" },
      { name: "Content-Length", value: "18446744073709551615" },
      { name: "Set-Cookie", value: "secret=session" },
    ],
  });
  headersListener!({
    tabId: 4, frameId: 0, method: "GET", url: "https://other.example/clip.mp4", statusCode: 200,
    responseHeaders: [{ name: "Content-Length", value: "12" }],
  });
  headersListener!({
    tabId: 4, frameId: 0, method: "GET", url: `${candidate.url}?token=private`, statusCode: 200,
    responseHeaders: [{ name: "Content-Length", value: "12" }],
  });
  const observed = await send({ type: "idg-media-observations", tabId: 4, pageOrigin: "https://media.example" }) as any;
  expect(observed.observations).toHaveLength(1);
  expect(observed.observations[0]).toMatchObject({ contentLength: "18446744073709551615", mimeType: "video/mp4" });
  expect(JSON.stringify(observed)).not.toContain("secret=session");
  expect(JSON.stringify(observed)).not.toContain("token=private");
  await expect(send({ type: "idg-media-observations", tabId: 4, pageOrigin: "https://other.example" }))
    .resolves.toMatchObject({ ok: false, observations: [] });
});

it("does not start a media job until IDG accepts the candidate and rejects captures after opt-out", async () => {
  await install();
  await expect(send({ type: "idg-media-capture", candidate, pageOrigin: "https://media.example" }))
    .resolves.toMatchObject({ ok: false });
  expect(mocks.request).not.toHaveBeenCalled();

  await enable(4);
  mocks.request.mockImplementation(async (command) => {
    if (typeof command === "string") return { kind: "opened" };
    if ("prepare_capture" in command) return { kind: "capture_status", decision: "pending" };
    if ("get_capture_status" in command) return { kind: "capture_status", decision: "accepted" };
    if ("start_capture" in command) return { kind: "download", id: "new-job" };
    throw new Error("unexpected command");
  });
  const completed = await send({ type: "idg-media-capture", candidate, pageOrigin: "https://media.example" });
  expect(completed).toEqual({ ok: true });
  const calls = mocks.request.mock.calls.map(([command]) => command);
  expect(calls.findIndex((command) => typeof command !== "string" && "get_capture_status" in command))
    .toBeLessThan(calls.findIndex((command) => typeof command !== "string" && "start_capture" in command));

  await send({ type: "idg-media-observe-tab", enabled: false, tabId: 4, pageOrigin: "https://media.example" });
  await expect(send({ type: "idg-media-capture", candidate, pageOrigin: "https://media.example" }))
    .resolves.toMatchObject({ ok: false });
  expect(mocks.request).toHaveBeenCalledTimes(4);
});

it("clears cached request metadata when the tab navigates or closes", async () => {
  await install();
  await enable(4);
  headersListener!({ tabId: 4, frameId: 0, method: "GET", url: candidate.url, statusCode: 200, responseHeaders: [{ name: "Content-Length", value: "8" }] });
  updatedListener!(4, { url: "https://media.example/next" });
  await expect(send({ type: "idg-media-observations", tabId: 4, pageOrigin: "https://media.example" }))
    .resolves.toMatchObject({ ok: false, observations: [] });
  await enable(4);
  headersListener!({ tabId: 4, frameId: 0, method: "GET", url: candidate.url, statusCode: 200, responseHeaders: [{ name: "Content-Length", value: "8" }] });
  removedListener!(4);
  await expect(send({ type: "idg-media-observations", tabId: 4, pageOrigin: "https://media.example" }))
    .resolves.toMatchObject({ ok: false, observations: [] });
});
