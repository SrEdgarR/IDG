// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { fireEvent, waitFor } from "@testing-library/dom";

const pageOrigin = "https://media.example";
const direct = {
  playerId: "player-1", url: `${pageOrigin}/clip.mp4`, kind: "video",
  title: "<img src=x onerror=alert(1)>", mimeType: "video/mp4", width: 640, height: 360, durationMs: 12000,
};
const playlist = {
  playerId: "player-2", url: `${pageOrigin}/master.m3u8`, kind: "video",
  title: "Manifest", mimeType: "application/vnd.apple.mpegurl", width: null, height: null, durationMs: null,
};

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

it("scans only after the enabled popup action, deduplicates candidates and gates manifest transfer", async () => {
  vi.resetModules();
  const settings = { globalEnabled: true, siteEnabled: {} as Record<string, boolean> };
  const sendMessage = vi.fn(async (message: any) => message.type === "idg-media-observations"
    ? { ok: true, observations: [] }
    : { ok: true });
  const executeScript = vi.fn(async (input: any) => input.files
    ? []
    : [{ frameId: 0, result: [direct, direct, playlist] }]);
  vi.stubGlobal("browser", {
    runtime: { sendMessage },
    tabs: { query: vi.fn(async () => [{ id: 9, url: `${pageOrigin}/watch`, title: "Watch" }]) },
    scripting: { executeScript },
    storage: {
      local: {
        get: vi.fn(async () => ({ idg_media_settings: settings })),
        set: vi.fn(async (next) => Object.assign(settings, next.idg_media_settings)),
      },
    },
  });
  document.body.innerHTML = `
    <input id="media-global" type="checkbox">
    <input id="media-site" type="checkbox">
    <button id="media-site-reset" hidden></button>
    <button id="media-scan"></button>
    <p id="media-notice"></p><ul id="media-candidates"></ul><span id="media-site-label"></span>`;
  const { initializeMediaPopup } = await import("./media-popup");
  initializeMediaPopup();

  const list = document.querySelector<HTMLUListElement>("#media-candidates")!;
  await waitFor(() => expect(list.querySelectorAll(".media-candidate")).toHaveLength(2));
  expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "idg-media-observe-tab", tabId: 9, pageOrigin, enabled: true }));
  expect(executeScript).toHaveBeenCalledTimes(2);
  expect(list.textContent).toContain("<img src=x onerror=alert(1)>");
  expect(list.querySelectorAll("img")).toHaveLength(0);

  const buttons = [...list.querySelectorAll<HTMLButtonElement>("button")];
  expect(buttons[0].disabled).toBe(false);
  expect(buttons[1].disabled).toBe(true);
  fireEvent.click(buttons[0]);
  await waitFor(() => expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
    type: "idg-media-capture", pageOrigin, candidate: expect.objectContaining({ url: direct.url }),
  })));
  await waitFor(() => expect(document.querySelector("#media-notice")?.textContent).toMatch(/confirma los datos/i));
  fireEvent.click(buttons[1]);
  expect(sendMessage).toHaveBeenCalledTimes(3); // opt-in, observations, one direct capture
});

it("keeps the page unscanned while disabled and stores only the explicit site override", async () => {
  vi.resetModules();
  const settings = { globalEnabled: false, siteEnabled: {} as Record<string, boolean> };
  const executeScript = vi.fn(async () => []);
  const storageSet = vi.fn(async (next) => Object.assign(settings, next.idg_media_settings));
  vi.stubGlobal("browser", {
    runtime: { sendMessage: vi.fn(async () => ({ ok: true })) },
    tabs: { query: vi.fn(async () => [{ id: 9, url: `${pageOrigin}/watch` }]) },
    scripting: { executeScript },
    storage: { local: { get: vi.fn(async () => ({ idg_media_settings: settings })), set: storageSet } },
  });
  document.body.innerHTML = `
    <input id="media-global" type="checkbox"><input id="media-site" type="checkbox">
    <button id="media-site-reset" hidden></button><button id="media-scan"></button>
    <p id="media-notice"></p><ul id="media-candidates"></ul><span id="media-site-label"></span>`;
  const { initializeMediaPopup } = await import("./media-popup");
  initializeMediaPopup();
  await waitFor(() => expect(document.querySelector<HTMLButtonElement>("#media-scan")?.disabled).toBe(true));
  expect(document.querySelector<HTMLButtonElement>("#media-scan")?.disabled).toBe(true);
  expect(document.querySelector("#media-notice")?.textContent).toMatch(/desactivada/i);
  expect(executeScript).not.toHaveBeenCalled();

  fireEvent.click(document.querySelector("#media-site")!);
  await waitFor(() => expect(storageSet).toHaveBeenCalled());
  expect(settings.siteEnabled).toEqual({ [pageOrigin]: true });
});
