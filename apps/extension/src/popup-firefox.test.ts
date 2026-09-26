// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/dom";

const native = vi.hoisted(() => ({ request: vi.fn(), watch: vi.fn() }));
vi.mock("./bridge", () => native);

let listeners: { snapshot: (value: any) => void; change: () => void; close: () => void }[];
let sendMessage: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetModules();
  listeners = [];
  const job = { id: "job-1", name: "local.bin", state: "downloading" };
  native.request.mockReset().mockImplementation(async (command: unknown) => {
    if (command === "get_extension_state")
      return { kind: "extension_state", state: { autopick_mode: "ask", active_count: 1, jobs: [job] } };
    if (typeof command === "object" && command !== null && "pause_download" in command) {
      job.state = "paused";
      return { kind: "download", job };
    }
    return { kind: "pong" };
  });
  native.watch.mockReset().mockImplementation((onSnapshot, onChange, onClose) => {
    listeners.push({ snapshot: onSnapshot, change: onChange, close: onClose });
    return vi.fn();
  });
  sendMessage = vi.fn(async () => ({ ok: true }));
  vi.stubGlobal("browser", { runtime: { sendMessage } });
  document.body.innerHTML = `
    <h1 id="status"></h1><p id="detail"></p><p id="notice"></p>
    <button id="reconnect"></button><button id="open"></button>
    <form id="direct-form"><input id="direct-url" type="url" required><button id="download-link"></button></form>
    <p>AutoPick sigue siendo un requisito del producto, pero la captura automática está deshabilitada. Las sesiones autenticadas no se transfieren.</p>
    <ul id="jobs"></ul>
  `;
});

afterEach(() => { vi.unstubAllGlobals(); document.body.replaceChildren(); });

it("shows only runtime jobs and sends real pause commands", async () => {
  await import("./popup-firefox");
  listeners[0].snapshot({ process_id: 42, stopping: false });
  await waitFor(() => expect(document.querySelector("#jobs")?.textContent).toContain("local.bin"));
  const button = document.querySelector<HTMLButtonElement>("#jobs button")!;
  expect(button.textContent).toBe("Pausar");
  button.click();
  await waitFor(() => expect(native.request).toHaveBeenCalledWith({ pause_download: { job_id: "job-1" } }));
  await waitFor(() => expect(document.querySelector<HTMLButtonElement>("#jobs button")?.textContent).toBe("Reanudar"));
  expect(document.body.textContent).toMatch(/captura automática está deshabilitada/i);
  expect(document.body.textContent).toMatch(/sesiones autenticadas no se transfieren/i);
  expect(document.querySelector("#autopick")).toBeNull();
});

it("sends an explicitly entered URL through the Firefox background and reports its result", async () => {
  await import("./popup-firefox");
  listeners[0].snapshot({ process_id: 42, stopping: false });
  const input = document.querySelector<HTMLInputElement>("#direct-url")!;
  input.value = "http://127.0.0.1:8788/file.bin";
  document.querySelector<HTMLFormElement>("#direct-form")!.requestSubmit();
  await waitFor(() => expect(sendMessage).toHaveBeenCalledWith({ type: "download-direct", url: input.value }));
  await waitFor(() => expect(document.querySelector("#notice")?.textContent).toMatch(/aceptó.*empezó/i));
  expect(input.value).toBe("");
});

it("keeps a rejected signed link visible for a safe browser fallback", async () => {
  sendMessage.mockResolvedValue({ ok: false, error: "Usa una URL HTTP o HTTPS directa, sin parámetros ni sesión." });
  await import("./popup-firefox");
  listeners[0].snapshot({ process_id: 42, stopping: false });
  const input = document.querySelector<HTMLInputElement>("#direct-url")!;
  input.value = "https://example.test/file.bin?token=private";
  document.querySelector<HTMLFormElement>("#direct-form")!.requestSubmit();
  await waitFor(() => expect(document.querySelector("#notice")?.textContent).toMatch(/sin parámetros ni sesión/i));
  expect(input.value).toContain("?token=private");
});

it("ignores a late close from the old Firefox host watcher after reconnecting", async () => {
  await import("./popup-firefox");
  listeners[0].snapshot({ process_id: 42, stopping: false });
  document.querySelector<HTMLButtonElement>("#reconnect")!.click();
  expect(listeners).toHaveLength(2);
  listeners[0].close();
  expect(document.querySelector("#status")?.textContent).toBe("Conectando…");
  listeners[1].snapshot({ process_id: 43, stopping: false });
  await waitFor(() => expect(document.querySelector("#status")?.textContent).toBe("Conectado"));
  expect(document.querySelector("#detail")?.textContent).toContain("43");
});
