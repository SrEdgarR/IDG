// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/dom";

let updated: ((message: { type: string }) => void) | undefined;
let sendMessage: ReturnType<typeof vi.fn>;
let executeScript: ReturnType<typeof vi.fn>;
let queryTabs: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetModules();
  document.body.innerHTML = `
    <h1 id="status"></h1><p id="detail"></p><p id="notice"></p>
    <select id="autopick"><option value="always">Siempre</option></select>
    <input id="ignore-site" type="checkbox"><input id="ignore-ext"><input id="ignore-mime">
    <input id="min-kib"><select id="unknown"><option value="browser">Navegador</option></select>
    <ul id="jobs"></ul><ul id="offers"></ul><ul id="links"></ul>
    <button id="reconnect"></button><button id="capture-permission"></button>
    <button id="suspend"></button><button id="save-rules"></button>
    <button id="open"></button><button id="find-links"></button>
  `;
  updated = undefined;
  const reply = {
    ok: true, connected: true, processId: 123,
    engine: { autopick_mode: "always", active_count: 1, jobs: [{ id: "job-1", name: "slow.bin", state: "downloading" }] },
    settings: { ignoredSites: [], ignoredExtensions: [], ignoredMimes: [], minBytes: 0, unknownSize: "browser", suspendedUntil: 0 },
    captureEnabled: false, offers: [{ downloadId: 7, name: "offered.bin" }], notice: "",
  };
  let responseCount = 0;
  sendMessage = vi.fn(async () => ({ ...reply, processId: 123 + responseCount++ }));
  executeScript = vi.fn(async () => [{ result: [] }]);
  queryTabs = vi.fn(async () => []);
  vi.stubGlobal("chrome", {
    runtime: { sendMessage, onMessage: { addListener: (listener: typeof updated) => { updated = listener; } } },
    tabs: { query: queryTabs },
    scripting: { executeScript },
    permissions: { request: vi.fn(async () => false) },
  });
});

afterEach(() => { vi.unstubAllGlobals(); document.body.replaceChildren(); });

it("keeps an active job button stable across progress refreshes so it can be clicked", async () => {
  await import("./popup");
  await waitFor(() => expect(document.querySelector<HTMLButtonElement>("#jobs button")?.textContent).toBe("Pausar"));
  await waitFor(() => expect(document.querySelector("#detail")?.textContent).toContain("Motor 124"));
  const button = document.querySelector<HTMLButtonElement>("#jobs button")!;
  const offerButton = document.querySelector<HTMLButtonElement>("#offers button")!;
  updated?.({ type: "updated" });
  await waitFor(() => expect(document.querySelector("#detail")?.textContent).toContain("Motor 125"));
  expect(document.querySelector("#jobs button")).toBe(button);
  expect(document.querySelector("#offers button")).toBe(offerButton);
  button.click();
  await waitFor(() => expect(sendMessage).toHaveBeenCalledWith({ type: "pause", id: "job-1" }));
});

it("does not overwrite an unsaved exclusion while progress updates arrive", async () => {
  await import("./popup");
  await waitFor(() => expect(document.querySelector("#detail")?.textContent).toContain("Motor 124"));
  const field = document.querySelector<HTMLInputElement>("#ignore-ext")!;
  field.focus();
  field.value = ".exe";
  field.dispatchEvent(new Event("input", { bubbles: true }));
  updated?.({ type: "updated" });
  await waitFor(() => expect(document.querySelector("#detail")?.textContent).toContain("Motor 125"));
  expect(field.value).toBe(".exe");
});

it("submits each chosen direct link only once until links are previewed again", async () => {
  queryTabs.mockResolvedValue([{ id: 42, url: "https://example.test" }]);
  executeScript.mockResolvedValue([{ result: [{ url: "https://example.test/file.bin", name: "file.bin" }] }]);
  await import("./popup");
  document.querySelector<HTMLButtonElement>("#find-links")!.click();
  await waitFor(() => expect(document.querySelector<HTMLButtonElement>("#links button")?.textContent).toContain("file.bin"));
  const button = document.querySelector<HTMLButtonElement>("#links button")!;
  button.click();
  button.click();
  await waitFor(() => expect(sendMessage).toHaveBeenCalledWith({ type: "direct", url: "https://example.test/file.bin", name: "file.bin" }));
  button.click();
  expect(sendMessage.mock.calls.filter(([message]) => message.type === "direct")).toHaveLength(1);
});

it("submits an offered browser download only once on repeated clicks", async () => {
  await import("./popup");
  await waitFor(() => expect(document.querySelector<HTMLButtonElement>("#offers button")?.textContent).toContain("offered.bin"));
  const button = document.querySelector<HTMLButtonElement>("#offers button")!;
  button.click();
  button.click();
  await waitFor(() => expect(sendMessage).toHaveBeenCalledWith({ type: "acceptOffer", downloadId: 7 }));
  button.click();
  expect(sendMessage.mock.calls.filter(([message]) => message.type === "acceptOffer")).toHaveLength(1);
});
