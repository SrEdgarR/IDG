// @vitest-environment jsdom
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/dom";

let changed: ((changes: unknown, area: string) => void) | undefined;
let settings: { globalEnabled: boolean; siteEnabled: Record<string, boolean> };
const sendMessage = vi.fn(async () => ({ ok: true }));

beforeAll(async () => {
  settings = { globalEnabled: true, siteEnabled: {} };
  vi.stubGlobal("browser", {
    runtime: { sendMessage },
    storage: {
      local: { get: vi.fn(async () => ({ idg_media_settings: settings })) },
      onChanged: { addListener: vi.fn((listener) => { changed = listener; }) },
    },
  });
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 0));
  await import("./media-content");
});

beforeEach(async () => {
  settings = { globalEnabled: true, siteEnabled: {} };
  sendMessage.mockClear();
  document.title = "Local video fixture";
  document.body.replaceChildren();
  document.querySelectorAll("[data-idg-media-overlay]").forEach((node) => node.remove());
  changed?.({}, "local");
  await Promise.resolve();
});

afterAll(() => vi.unstubAllGlobals());

function addVideo(url: string) {
  const video = document.createElement("video");
  video.src = url;
  Object.defineProperty(video, "videoWidth", { configurable: true, value: 640 });
  Object.defineProperty(video, "videoHeight", { configurable: true, value: 360 });
  Object.defineProperty(video, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ width: 320, height: 180, top: 20, left: 10, right: 330, bottom: 200 }),
  });
  document.body.append(video);
  return video;
}

it("collects direct and manifest sources for distinct players and creates player-bound buttons", async () => {
  addVideo("https://media.example/one.mp4");
  const second = document.createElement("audio");
  const source = document.createElement("source");
  source.src = "https://media.example/live.m3u8";
  source.type = "application/vnd.apple.mpegurl";
  second.append(source);
  document.body.append(second);

  const scan = (globalThis as typeof globalThis & { __idgMediaScan: () => Promise<any[]> }).__idgMediaScan;
  const candidates = await scan();
  expect(candidates).toHaveLength(2);
  expect(candidates.map((candidate) => candidate.playerId)).toEqual(["player-1", "player-2"]);
  await waitFor(() => expect(document.querySelectorAll("[data-idg-media-overlay]")).toHaveLength(2));
  const buttons = [...document.querySelectorAll<HTMLElement>("[data-idg-media-overlay]")]
    .map((host) => host.shadowRoot?.querySelector("button"));
  expect(buttons[0]?.textContent).toBe("Enviar a IDG");
  expect(buttons[0]?.disabled).toBe(false);
  expect(buttons[1]?.textContent).toBe("Medio detectado");
  expect(buttons[1]?.disabled).toBe(true);
});

it("updates dynamic media without polling, then removes overlays when disabled", async () => {
  const video = addVideo("https://media.example/first.mp4");
  await waitFor(() => expect(document.querySelectorAll("[data-idg-media-overlay]")).toHaveLength(1));
  const next = document.createElement("video");
  next.src = "https://media.example/second.mp4";
  next.getBoundingClientRect = video.getBoundingClientRect;
  document.body.append(next);
  await waitFor(() => expect(document.querySelectorAll("[data-idg-media-overlay]")).toHaveLength(2));
  settings = { globalEnabled: false, siteEnabled: { [location.origin]: false } };
  changed?.({}, "local");
  await waitFor(() => expect(document.querySelectorAll("[data-idg-media-overlay]")).toHaveLength(0));
});

it("honors a site override, reports the tab opt-in, keeps declared codecs and removes SPA players", async () => {
  settings = { globalEnabled: false, siteEnabled: { [location.origin]: true } };
  changed?.({}, "local");
  const video = addVideo("https://media.example/first.mp4");
  const source = document.createElement("source");
  source.src = "https://media.example/second.mp4";
  source.type = 'video/mp4; codecs="avc1.640028, mp4a.40.2"';
  video.append(source);
  await waitFor(() => expect(document.querySelectorAll("[data-idg-media-overlay]")).toHaveLength(1));
  expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "idg-media-observe-tab", enabled: true }));
  const candidates = await (globalThis as typeof globalThis & { __idgMediaScan: () => Promise<any[]> }).__idgMediaScan();
  expect(candidates.find((candidate) => candidate.url.endsWith("second.mp4"))).toMatchObject({ videoCodec: "avc1.640028", audioCodec: "mp4a.40.2" });
  video.remove();
  await waitFor(() => expect(document.querySelectorAll("[data-idg-media-overlay]")).toHaveLength(0));
});

it("refreshes dimensions and duration when a player finishes loading metadata", async () => {
  const video = addVideo("https://media.example/late-metadata.mp4");
  Object.defineProperty(video, "videoWidth", { configurable: true, value: 0 });
  Object.defineProperty(video, "videoHeight", { configurable: true, value: 0 });
  Object.defineProperty(video, "duration", { configurable: true, value: Number.NaN });
  const scan = (globalThis as typeof globalThis & { __idgMediaScan: () => Promise<any[]> }).__idgMediaScan;
  await waitFor(() => expect(document.querySelectorAll("[data-idg-media-overlay]")).toHaveLength(1));
  expect((await scan())[0]).toMatchObject({ width: null, height: null, durationMs: null });

  Object.defineProperty(video, "videoWidth", { configurable: true, value: 1280 });
  Object.defineProperty(video, "videoHeight", { configurable: true, value: 720 });
  Object.defineProperty(video, "duration", { configurable: true, value: 42.5 });
  video.dispatchEvent(new Event("loadedmetadata"));
  const host = document.querySelector<HTMLElement>("[data-idg-media-overlay]")!;
  host.shadowRoot!.querySelector<HTMLButtonElement>("button")!.click();
  await waitFor(() => expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
    type: "idg-media-capture",
    candidate: expect.objectContaining({ width: 1280, height: 720, durationMs: 42_500 }),
  })));
});

it("sends only the player's direct candidate and treats page text as text", async () => {
  const video = addVideo("https://media.example/clip.mp4");
  video.setAttribute("title", "<img src=x onerror=alert(1)>");
  const host = await waitFor(() => {
    const value = document.querySelector<HTMLElement>("[data-idg-media-overlay]");
    if (!value?.shadowRoot) throw new Error("overlay not ready");
    return value;
  });
  host.shadowRoot!.querySelector<HTMLButtonElement>("button")!.click();
  await waitFor(() => expect(sendMessage).toHaveBeenCalledWith({
    type: "idg-media-capture",
    candidate: expect.objectContaining({ playerId: expect.stringMatching(/^player-/), url: "https://media.example/clip.mp4" }),
  }));
  expect(host.shadowRoot?.querySelector("img")).toBeNull();
  expect(host.shadowRoot?.textContent).not.toContain("onerror=");
});

it("does not create overlays or scan while the per-site setting is disabled", async () => {
  settings = { globalEnabled: false, siteEnabled: {} };
  changed?.({}, "local");
  addVideo("https://media.example/clip.mp4");
  await waitFor(() => expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "idg-media-observe-tab", enabled: false })));
  expect(document.querySelectorAll("[data-idg-media-overlay]")).toHaveLength(0);
});
