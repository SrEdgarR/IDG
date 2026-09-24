import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { desktopHarness, sleep } from "./desktop-harness.mjs";

const h = await desktopHarness();
let restartedDesktop;
let restartedBrowser;
const saveRequests = new Map();

h.page.on("request", (request) => {
  if (!request.url().includes("ipc.localhost/download_command")) return;
  const envelope = JSON.parse(request.postData() ?? "{}").request;
  const operation = envelope?.command?.organization?.operation;
  if (operation?.action === "save_queue")
    saveRequests.set(envelope.id, {
      sentAt: operation.queue.schedule?.at ?? null,
      returnedAt: undefined,
    });
});
h.page.on("response", async (response) => {
  if (!response.url().includes("ipc.localhost/download_command")) return;
  const envelope = JSON.parse(response.request().postData() ?? "{}").request;
  const trace = saveRequests.get(envelope?.id);
  if (!trace) return;
  try {
    const result = await response.json();
    trace.returnedAt =
      result.kind === "organization"
        ? (result.state.queues.find((q) => q.id === envelope.command.organization.operation.queue.id)?.schedule?.at ?? null)
        : "rejected";
  } catch {
    trace.returnedAt = "rejected";
  }
});

async function waitForSaveTrace(at) {
  for (let i = 0; i < 60; i++) {
    const trace = [...saveRequests.values()].find((entry) => entry.sentAt === at);
    if (trace?.returnedAt !== undefined) return trace;
    await sleep(100);
  }
  throw Error(`No confirmed IPC save request for ${at}`);
}

const queue = () => h.org({ action: "get" }).then((r) => r.state.queues.find((q) => q.name === "Horario UI"));
const scheduledAt = (seconds) => new Date(seconds * 1000).toISOString();
const editorOf = (page) => page.getByRole("dialog", { name: "Colas y programación" });

async function openQueue(page, id) {
  await page.getByRole("button", { name: "En cola", exact: true }).click();
  await page.getByRole("button", { name: "Gestionar colas", exact: true }).click();
  const editor = editorOf(page);
  await editor.getByRole("combobox", { name: "Cola", exact: true }).selectOption(id);
  await editor.getByText("Horario y opciones avanzadas", { exact: true }).click();
  return editor;
}

async function saveFromField(editor, value) {
  await editor.getByLabel("Inicio único (fecha, hora y zona)").fill(value);
  // Intentionally no Tab, blur, or second click between filling and saving.
  await editor.getByRole("button", { name: "Guardar cola", exact: true }).click();
}

async function waitForSchedule(at, state) {
  let actual;
  for (let i = 0; i < 60; i++) {
    actual = (await queue())?.schedule;
    if (actual?.at === at && (!state || actual.state === state)) return actual;
    await sleep(100);
  }
  throw Error(`Schedule did not persist: ${at}, ${state ?? "any state"}; stored=${JSON.stringify(actual)}`);
}

try {
  await h.page.getByRole("button", { name: "En cola", exact: true }).click();
  await h.page.getByRole("button", { name: "Gestionar colas", exact: true }).click();
  let editor = editorOf(h.page);
  await editor.getByLabel("Nombre de la cola", { exact: true }).fill("Horario UI");
  await editor.getByRole("button", { name: "Guardar cola", exact: true }).click();
  let q;
  for (let i = 0; i < 60; i++) {
    q = await queue();
    if (q) break;
    await sleep(100);
  }
  assert.ok(q, "Queue was created through the editor");
  await editor.getByText("Horario y opciones avanzadas", { exact: true }).click();

  const firstAt = Math.floor(Date.now() / 1000) + 180;
  await saveFromField(editor, scheduledAt(firstAt));
  await waitForSchedule(firstAt, "pending");
  assert.deepEqual(await waitForSaveTrace(firstAt), { sentAt: firstAt, returnedAt: firstAt }, "UI click must send the current value and receive it back from runtime");
  assert.match(await editor.innerText(), /Programación guardada:[\s\S]*Pendiente/);
  await editor.getByRole("button", { name: "Cerrar", exact: true }).click();
  editor = await openQueue(h.page, q.id);
  assert.equal(Date.parse(await editor.getByLabel("Inicio único (fecha, hora y zona)").inputValue()) / 1000, firstAt);

  const secondAt = firstAt + 60;
  const secondWithZone =
    new Date((secondAt - 4 * 3600) * 1000).toISOString().slice(0, 19) +
    "-04:00";
  await saveFromField(editor, secondWithZone);
  await waitForSchedule(secondAt, "pending");
  assert.deepEqual(await waitForSaveTrace(secondAt), { sentAt: secondAt, returnedAt: secondAt });
  assert.equal(Date.parse(await editor.getByLabel("Inicio único (fecha, hora y zona)").inputValue()) / 1000, secondAt, "Explicit zone must preserve the chosen instant");

  await editor.getByLabel("Inicio único (fecha, hora y zona)").fill(scheduledAt(secondAt + 300));
  await editor.getByRole("combobox", { name: "Cola", exact: true }).selectOption("main");
  assert.equal(await editor.getByLabel("Inicio único (fecha, hora y zona)").inputValue(), "", "Other queue must not inherit an unsaved schedule");
  await editor.getByRole("combobox", { name: "Cola", exact: true }).selectOption(q.id);
  assert.equal(Date.parse(await editor.getByLabel("Inicio único (fecha, hora y zona)").inputValue()) / 1000, secondAt, "Returning to the queue must load its saved schedule");

  const requestsBeforeInvalid = saveRequests.size;
  await saveFromField(editor, "fecha inválida");
  await editor.getByRole("alert").getByText(/fecha ISO/i).waitFor();
  assert.equal(saveRequests.size, requestsBeforeInvalid, "Invalid schedule must not reach runtime");
  assert.equal((await queue()).schedule.at, secondAt, "Invalid input must preserve the previous schedule");
  assert.equal(await editor.getByLabel("Inicio único (fecha, hora y zona)").inputValue(), "fecha inválida");

  const appliedAt = Math.floor(Date.now() / 1000) + 4;
  await saveFromField(editor, scheduledAt(appliedAt));
  await waitForSchedule(appliedAt, "applied");
  await editor.getByRole("button", { name: "Cerrar", exact: true }).click();
  editor = await openQueue(h.page, q.id);
  assert.match(await editor.innerText(), /Aplicado/);
  const field = editor.getByLabel("Inicio único (fecha, hora y zona)");
  await field.focus();
  await field.blur();
  assert.match(await editor.innerText(), /Aplicado/, "Focusing and leaving an unchanged applied schedule must not show Pendiente");
  assert.equal((await queue()).schedule.state, "applied");
  await editor.getByRole("button", { name: "Guardar cola", exact: true }).click();
  await editor.getByRole("button", { name: "Guardar cola", exact: true }).click();
  assert.equal((await queue()).schedule.state, "applied", "Repeated save must not rearm an applied schedule");

  await field.fill("");
  await editor.getByRole("button", { name: "Cerrar", exact: true }).click();
  editor = await openQueue(h.page, q.id);
  assert.equal((await queue()).schedule.state, "applied", "Closing without save must not erase the schedule");
  assert.notEqual(await editor.getByLabel("Inicio único (fecha, hora y zona)").inputValue(), "");
  const currentField = editor.getByLabel("Inicio único (fecha, hora y zona)");

  await editor.getByLabel("Simultáneas", { exact: true }).fill("0");
  const failedAt = Math.floor(Date.now() / 1000) + 180;
  await saveFromField(editor, scheduledAt(failedAt));
  await editor.getByRole("alert").waitFor();
  assert.equal(await currentField.inputValue(), scheduledAt(failedAt), "Failed save must retain the edit");
  assert.equal((await queue()).schedule.at, appliedAt, "Failed save must not alter persisted schedule");
  assert.match(await editor.innerText(), /Cambio de horario sin guardar/);
  assert.match(await editor.innerText(), /Programación guardada:[\s\S]*Aplicado/);

  await editor.getByRole("button", { name: "Cerrar", exact: true }).click();
  await h.browser.close();
  process.kill(h.desktopProcessId);
  const port = Number(h.env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS.match(/--remote-debugging-port=(\d+)/)[1]);
  restartedDesktop = spawn(h.exe("idg-desktop"), [], { env: h.env, windowsHide: true, stdio: "ignore" });
  for (let i = 0; i < 100; i++) {
    try {
      restartedBrowser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
      break;
    } catch {
      await sleep(100);
    }
  }
  assert.ok(restartedBrowser, "Reopened real Tauri desktop");
  let reopenedPage;
  for (let i = 0; i < 100; i++) {
    reopenedPage = restartedBrowser.contexts()[0]?.pages().find((page) => page.url().includes("tauri.localhost"));
    if (reopenedPage) break;
    await sleep(100);
  }
  assert.ok(reopenedPage, "Reopened Tauri WebView2 page");
  await reopenedPage.getByRole("status").filter({ hasText: /^Conectado$/ }).waitFor();
  editor = await openQueue(reopenedPage, q.id);
  assert.equal(Date.parse(await editor.getByLabel("Inicio único (fecha, hora y zona)").inputValue()) / 1000, appliedAt);
  assert.match(await editor.innerText(), /Aplicado/);
  const afterRestart = await reopenedPage.evaluate(() =>
    window.__TAURI_INTERNALS__.invoke("download_command", {
      request: {
        version: 1,
        id: crypto.randomUUID(),
        command: { organization: { operation: { action: "get" } } },
      },
    }),
  );
  assert.equal(afterRestart.state.queues.find((q) => q.name === "Horario UI").schedule.state, "applied", "App restart must not rearm the schedule");
  await editor.getByLabel("Inicio único (fecha, hora y zona)").fill("");
  const beforeClear = await reopenedPage.evaluate(() =>
    window.__TAURI_INTERNALS__.invoke("download_command", {
      request: {
        version: 1,
        id: crypto.randomUUID(),
        command: { organization: { operation: { action: "get" } } },
      },
    }),
  );
  assert.equal(beforeClear.state.queues.find((q) => q.name === "Horario UI").schedule.state, "applied", "Empty draft must not clear runtime state");
  await editor.getByRole("button", { name: "Guardar cola", exact: true }).click();
  let cleared;
  for (let i = 0; i < 60; i++) {
    cleared = await reopenedPage.evaluate(() =>
      window.__TAURI_INTERNALS__.invoke("download_command", {
        request: {
          version: 1,
          id: crypto.randomUUID(),
          command: { organization: { operation: { action: "get" } } },
        },
      }),
    );
    if (cleared.state.queues.find((q) => q.name === "Horario UI").schedule === null) break;
    await sleep(100);
  }
  assert.equal(cleared.state.queues.find((q) => q.name === "Horario UI").schedule, null, "Only deliberate Save clears the schedule");
  console.log("PASS horario UI Tauri: un clic sin Tab, edición, inválido, Aplicado sin rearme, error y reinicio de aplicación.");
} finally {
  restartedDesktop?.kill();
  await restartedBrowser?.close().catch(() => {});
  await h.close();
}
