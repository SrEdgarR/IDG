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
    <h2 id="capture-title">Captura automática deshabilitada</h2>
    <p>AutoPick sigue siendo un requisito del producto, pero esta versión no transfiere descargas ya iniciadas en Chromium.</p>
    <p>No se transfieren cookies, credenciales ni solicitudes de sesión autenticada.</p>
    <ul id="jobs"></ul><ul id="links"></ul>
    <button id="reconnect"></button><button id="open"></button><button id="find-links"></button>
  `;
  updated = undefined;
  const reply = {
    ok: true, connected: true, processId: 123,
    engine: { autopick_mode: "always", active_count: 1, jobs: [{ id: "job-1", name: "slow.bin", state: "downloading" }] },
    notice: "",
  };
  let responseCount = 0;
  sendMessage = vi.fn(async () => ({ ...reply, processId: 123 + responseCount++ }));
  executeScript = vi.fn(async () => [{ result: [] }]);
  queryTabs = vi.fn(async () => []);
  vi.stubGlobal("chrome", {
    runtime: { sendMessage, onMessage: { addListener: (listener: typeof updated) => { updated = listener; } } },
    tabs: { query: queryTabs },
    scripting: { executeScript },
  });
});

afterEach(() => { vi.unstubAllGlobals(); document.body.replaceChildren(); });

it("keeps a real active-job control stable across progress refreshes", async () => {
  await import("./popup");
  await waitFor(() => expect(document.querySelector<HTMLButtonElement>("#jobs button")?.textContent).toBe("Pausar"));
  await waitFor(() => expect(document.querySelector("#detail")?.textContent).toContain("Motor 123"));
  const button = document.querySelector<HTMLButtonElement>("#jobs button")!;
  updated?.({ type: "updated" });
  await waitFor(() => expect(document.querySelector("#detail")?.textContent).toContain("Motor 124"));
  expect(document.querySelector("#jobs button")).toBe(button);
  button.click();
  await waitFor(() => expect(sendMessage).toHaveBeenCalledWith({ type: "pause", id: "job-1" }));
});

it("states that automatic capture is disabled and authenticated requests stay in the browser", async () => {
  await import("./popup");
  await waitFor(() => expect(document.querySelector("#status")?.textContent).toBe("Conectado"));
  expect(document.body.textContent).toMatch(/AutoPick sigue siendo un requisito/i);
  expect(document.body.textContent).toMatch(/no transfiere descargas ya iniciadas/i);
  expect(document.body.textContent).toMatch(/no se transfieren cookies, credenciales/i);
  expect(document.querySelector("#capture-permission")).toBeNull();
  expect(document.querySelector("#autopick")).toBeNull();
});

it("submits each chosen direct link only once", async () => {
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
