import { spawn, execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import net from "node:net";
import { createServer } from "node:http";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { startSegments, expectedHash } from "../fixtures/http/segments.mjs";
const root = process.cwd(),
  exe = (name) => path.join(root, `target/debug/${name}.exe`);
const probe = (args) =>
  JSON.parse(
    execFileSync(exe("idg-probe"), args, {
      encoding: "utf8",
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
    }),
  );
let existing = false;
try {
  probe(["ping"]);
  existing = true;
} catch {}
if (existing) throw Error("Runtime personal activo; no se toca.");
await mkdir(".local", { recursive: true });
const dir = await mkdtemp(path.join(root, ".local/app-download-"));
const files = path.join(dir, "files");
await mkdir(files);
const socket = net.createServer();
await new Promise((r) => socket.listen(0, "127.0.0.1", r));
const port = socket.address().port;
await new Promise((r) => socket.close(r));
const fixture = await startSegments({
  size: 2 * 1024 * 1024,
  rate: 512 * 1024,
});
const slow = await startSegments({ size: 8 * 1024 * 1024, rate: 512 * 1024 });
const env = {
  ...process.env,
  IDG_DATA_DIR: path.join(dir, "state"),
  WEBVIEW2_USER_DATA_FOLDER: path.join(dir, "webview"),
  WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
};
let runtime, desktop, browser, locker;
let heldRequests = 0;
const held = createServer((_req, _res) => {
  heldRequests++;
});
await new Promise((resolve) => held.listen(0, "127.0.0.1", resolve));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  desktop = spawn(exe("idg-desktop"), [], {
    env,
    windowsHide: true,
    stdio: "ignore",
  });
  for (let i = 0; i < 100; i++) {
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
      break;
    } catch {
      await sleep(100);
    }
  }
  assert.ok(browser);
  let page = browser.contexts()[0].pages()[0];
  page.setDefaultTimeout(15000);
  await page
    .getByRole("status")
    .filter({ hasText: /^Conectado$/ })
    .waitFor();
  const runtimeId = probe(["ping"]).process_id;
  runtime = {
    pid: runtimeId,
    exitCode: null,
    kill: () => {
      try {
        process.kill(runtimeId);
      } catch {}
    },
  };
  const wizard = page.getByRole("dialog", { name: "Primera configuración" });
  await wizard.waitFor();
  await wizard.getByRole("button", { name: "Siguiente", exact: true }).click();
  await wizard.getByLabel("Carpeta inicial", { exact: true }).fill(files);
  await wizard.getByRole("button", { name: "Siguiente", exact: true }).click();
  await wizard
    .getByRole("button", { name: "Omitir navegador", exact: true })
    .click();
  await wizard
    .getByRole("button", { name: "Guardar configuración", exact: true })
    .click();
  await wizard.waitFor({ state: "hidden" });
  await page
    .getByRole("button", { name: "Comprobar conexión", exact: true })
    .click();
  await page
    .getByText("El motor respondió al ping.", { exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Nueva descarga", exact: true })
    .click();
  for (const scheme of ["ftp", "ftps"]) {
    await page
      .getByLabel("URL del archivo", { exact: true })
      .fill(`${scheme}://127.0.0.1/rejected.bin`);
    await page
      .getByLabel("Nombre del archivo", { exact: true })
      .fill(`rejected-${scheme}.bin`);
    await page.getByLabel("Carpeta", { exact: true }).fill(files);
    await page
      .getByRole("button", { name: "Descargar ahora", exact: true })
      .click();
    await page
      .getByText("Introduce una URL HTTP o HTTPS válida", { exact: false })
      .waitFor();
    assert.equal(
      await page.getByLabel("URL del archivo", { exact: true }).getAttribute("aria-invalid"),
      "true",
    );
    assert.equal(probe(["list"]).jobs.length, 0);
    assert.equal(fixture.records.length, 0);
  }
  await page
    .getByLabel("URL del archivo", { exact: true })
    .fill(fixture.url + "/file");
  await page.getByLabel("Nombre del archivo", { exact: true }).fill("real.bin");
  await page.getByLabel("Carpeta", { exact: true }).fill(files);
  assert.equal(fixture.records.length, 0, "editing never consumes the URL");
  await mkdir("docs/screenshots/fase05", { recursive: true });
  await page.screenshot({
    path: "docs/screenshots/fase05/nueva-descarga.png",
    mask: [page.getByLabel("Carpeta", { exact: true })],
  });
  await page
    .getByRole("button", { name: "Descargar ahora", exact: true })
    .evaluate((button) => {
      button.click();
      button.click();
    });
  await page
    .getByRole("dialog", { name: "Nueva descarga", exact: true })
    .waitFor({ state: "hidden" });
  await page.locator(".download-row").filter({ hasText: "real.bin" }).waitFor();
  const deadline = Date.now() + 30000;
  let job;
  while (Date.now() < deadline) {
    job = probe(["list"]).jobs.find((j) => j.name === "real.bin");
    if (job?.state === "completed") break;
    await sleep(100);
  }
  assert.equal(job?.state, "completed");
  assert.equal(probe(["list"]).jobs.length, 1);
  assert.equal(
    createHash("sha256")
      .update(await readFile(path.join(files, "real.bin")))
      .digest("hex"),
    expectedHash(fixture.size),
  );
  assert.equal(
    fixture.records.length,
    1,
    "uncertain replay capability keeps one GET",
  );
  console.log("PASS Tauri: FTP/FTPS rechazados; HTTP local completado con SHA-256 esperado.");
  await page
    .locator(".download-row")
    .filter({ hasText: "Completadas" })
    .waitFor();
  async function add(name, action, url = fixture.url + "/file") {
    await page
      .getByRole("button", { name: "Nueva descarga", exact: true })
      .click();
    await page.getByLabel("URL del archivo", { exact: true }).fill(url);
    await page.getByLabel("Nombre del archivo", { exact: true }).fill(name);
    await page.getByLabel("Carpeta", { exact: true }).fill(files);
    await page
      .getByLabel("Categoría", { exact: true })
      .selectOption("Documentos");
    await page.getByRole("button", { name: action, exact: true }).click();
    await page
      .getByRole("dialog", { name: "Nueva descarga", exact: true })
      .waitFor({ state: "hidden" });
  }
  await add("later.bin", "Descargar después");
  await add("queue.bin", "Añadir a cola");
  assert.equal(
    probe(["list"]).jobs.find((j) => j.name === "later.bin").state,
    "deferred",
  );
  assert.equal(
    probe(["list"]).jobs.find((j) => j.name === "queue.bin").state,
    "queued",
  );
  assert.equal(
    fixture.records.length,
    1,
    "deferred and stopped queue never request HTTP",
  );
  await page.getByRole("button", { name: "En cola", exact: true }).click();
  await page.getByRole("button", { name: "Iniciar cola", exact: true }).click();
  const queuedDeadline = Date.now() + 20000;
  while (Date.now() < queuedDeadline) {
    if (
      probe(["list"]).jobs.find((j) => j.name === "queue.bin")?.state ===
      "completed"
    )
      break;
    await sleep(100);
  }
  assert.equal(
    probe(["list"]).jobs.find((j) => j.name === "queue.bin").state,
    "completed",
  );
  assert.equal(
    probe(["list"]).jobs.find((j) => j.name === "later.bin").state,
    "deferred",
  );
  assert.equal(
    probe(["list"]).jobs.find((j) => j.name === "later.bin").category,
    "Documentos",
  );
  assert.equal(
    createHash("sha256")
      .update(await readFile(path.join(files, "queue.bin")))
      .digest("hex"),
    expectedHash(fixture.size),
  );
  console.log(
    "PASS Después no arranca; cola detenida no hace GET; Iniciar cola descarga y conserva categoría.",
  );
  await page.getByRole("button", { name: "Todas", exact: true }).click();
  // Actual desktop IPC: retry after an unobserved acknowledgement uses the durable creation receipt.
  const command = (command, id = crypto.randomUUID()) =>
    page.evaluate(
      (request) =>
        window.__TAURI_INTERNALS__.invoke("download_command", { request }),
      { version: 1, id, command },
    );
  const draft = {
    input: {
      url: fixture.url + "/file",
      directory: files,
      name: "receipt.bin",
      expected_sha256: null,
      conflict: "reject",
    },
    options: {
      mode: "automatic",
      replay_safe: false,
      bytes_per_second: null,
      priority: "normal",
    },
    category: "Otros",
    start: "later",
  };
  assert.equal(
    (await command({ create_download: { draft } }, "receipt-test")).kind,
    "download",
  );
  await command({
    set_download_options: {
      job_id: "receipt-test",
      options: { ...draft.options, priority: "high" },
    },
  });
  const repeated = await command(
    { create_download: { draft } },
    "receipt-test",
  );
  assert.equal(repeated.kind, "download");
  assert.equal(repeated.job.options.priority, "high");
  assert.equal(
    probe(["list"]).jobs.filter((j) => j.id === "receipt-test").length,
    1,
  );
  await page
    .getByRole("button", { name: "Nueva descarga", exact: true })
    .click();
  await page
    .getByLabel("URL del archivo", { exact: true })
    .fill(fixture.url + "/file");
  await page.getByLabel("Nombre del archivo", { exact: true }).fill("real.bin");
  await page
    .getByRole("button", { name: "Descargar ahora", exact: true })
    .click();
  const conflict = page.getByRole("dialog", {
    name: "Ya existe un archivo con este nombre",
  });
  await conflict.waitFor();
  assert.equal(
    await conflict.getByLabel("Reanudar", { exact: true }).isEnabled(),
    false,
  );
  await conflict.getByRole("button", { name: "Cancelar", exact: true }).click();
  assert.equal(
    await page.getByLabel("Nombre del archivo", { exact: true }).inputValue(),
    "real.bin",
  );
  await page
    .getByLabel("Carpeta", { exact: true })
    .fill(path.join(files, "missing"));
  await page
    .getByRole("button", { name: "Descargar ahora", exact: true })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "No se pudo acceder" })
    .waitFor();
  assert.equal(
    await page.getByLabel("Nombre del archivo", { exact: true }).inputValue(),
    "real.bin",
  );
  await page
    .getByRole("dialog", { name: "Nueva descarga", exact: true })
    .getByRole("button", { name: "Cancelar", exact: true })
    .click();
  console.log(
    "PASS doble clic, recibo durable tras cambio de opciones, conflicto sin sobrescritura y error de destino conservando formulario.",
  );
  await add("lifecycle.bin", "Descargar ahora", slow.url + "/file");
  async function waitJob(name, predicate) {
    for (let i = 0; i < 300; i++) {
      const j = probe(["list"]).jobs.find((j) => j.name === name);
      if (j && predicate(j)) return j;
      await sleep(100);
    }
    throw Error("Job state timeout: " + name);
  }
  await waitJob("lifecycle.bin", (j) => BigInt(j.received_bytes) > 131072n);
  const row = page
    .locator(".download-row")
    .filter({ hasText: "lifecycle.bin" });
  await row
    .getByRole("button", { name: "Pausar lifecycle.bin", exact: true })
    .click();
  const paused = await waitJob("lifecycle.bin", (j) => j.state === "paused");
  assert.ok(BigInt(paused.durable_bytes) > 0n);
  const rowOrder = await page
    .locator(".download-row .filename")
    .allTextContents();
  await page.getByRole("button", { name: "Reconectar", exact: true }).click();
  await page
    .getByRole("status")
    .filter({ hasText: /^Conectado$/ })
    .waitFor();
  await page.waitForFunction(
    (expected) =>
      JSON.stringify(
        [...document.querySelectorAll(".download-row .filename")].map(
          (el) => el.textContent,
        ),
      ) === JSON.stringify(expected),
    rowOrder,
  );
  await row
    .getByRole("button", { name: "Reanudar lifecycle.bin", exact: true })
    .click();
  await waitJob(
    "lifecycle.bin",
    (j) =>
      j.state === "downloading" &&
      BigInt(j.received_bytes) > BigInt(paused.received_bytes),
  );
  await mkdir("docs/screenshots/fase05", { recursive: true });
  for (const theme of ["light", "dark"]) {
    await page.getByLabel("Tema", { exact: true }).selectOption(theme);
    await page.waitForFunction(
      (t) => document.documentElement.dataset.theme === t,
      theme,
    );
    // Capture the settled theme, not an intermediate frame of the existing color transition.
    await page.waitForFunction(
      () =>
        getComputedStyle(document.querySelector(".row-title")).color ===
        getComputedStyle(document.body).color,
    );
    await row.locator(".sparkline polyline").waitFor();
    await page.waitForFunction(() => {
      const current = [...document.querySelectorAll(".download-row")].find(
        (el) => el.textContent.includes("lifecycle.bin"),
      );
      return /[1-9]\d*(?:[.,]\d+)? [KMGT]?i?B\/s/.test(
        current?.querySelector(".row-speed")?.textContent ?? "",
      );
    });
    await page.screenshot({
      path: `docs/screenshots/fase05/progreso-${theme}.png`,
    });
  }
  const beforeHide = probe(["list"]).jobs.find(
    (j) => j.name === "lifecycle.bin",
  );
  assert.match(
    execFileSync(
      "pwsh",
      [
        "-NoProfile",
        "-File",
        "scripts/Close-TestWindow.ps1",
        "-ProcessId",
        String(desktop.pid),
      ],
      { encoding: "utf8", windowsHide: true },
    ),
    /hidden/,
  );
  await sleep(500);
  const afterHide = probe(["list"]).jobs.find(
    (j) => j.name === "lifecycle.bin",
  );
  const memory = JSON.parse(
    execFileSync(
      "pwsh",
      [
        "-NoProfile",
        "-File",
        "scripts/Measure-TestProcesses.ps1",
        "-DesktopId",
        String(desktop.pid),
        "-RuntimeId",
        String(runtime.pid),
      ],
      { encoding: "utf8", windowsHide: true },
    ),
  );
  await writeFile(
    "docs/test-evidence/fase05-memory.json",
    JSON.stringify(
      {
        scenario:
          "debug; ventana oculta, transferencia local activa; muestra aislada, no comparación de liberación de RAM",
        ...memory,
      },
      null,
      2,
    ) + "\n",
  );
  assert.ok(
    BigInt(afterHide.received_bytes) > BigInt(beforeHide.received_bytes),
    "hidden window keeps transferring",
  );
  const duplicate = spawn(exe("idg-desktop"), [], {
    env,
    windowsHide: true,
    stdio: "ignore",
  });
  await new Promise((r) => duplicate.once("exit", r));
  assert.equal(probe(["ping"]).process_id, runtime.pid);
  await page
    .getByRole("button", { name: "Salir completamente", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Salir completamente", exact: true })
    .getByRole("button", { name: "Salir completamente", exact: true })
    .click();
  for (let i = 0; i < 100 && desktop.exitCode === null; i++) await sleep(100);
  assert.notEqual(desktop.exitCode, null);
  assert.throws(() => probe(["ping"]));
  runtime = null;
  browser = undefined;
  desktop = spawn(exe("idg-desktop"), [], {
    env,
    windowsHide: true,
    stdio: "ignore",
  });
  for (let i = 0; i < 100; i++) {
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
      break;
    } catch {
      await sleep(100);
    }
  }
  assert.ok(browser);
  page = browser.contexts()[0].pages()[0];
  page.setDefaultTimeout(15000);
  await page
    .getByRole("status")
    .filter({ hasText: /^Conectado$/ })
    .waitFor();
  const restarted = probe(["ping"]).process_id;
  runtime = {
    pid: restarted,
    exitCode: null,
    kill: () => {
      try {
        process.kill(restarted);
      } catch {}
    },
  };
  assert.equal(
    await page.getByRole("dialog", { name: "Primera configuración" }).count(),
    0,
  );
  await page.waitForFunction(
    () => document.documentElement.dataset.theme === "dark",
  );
  const recovered = await waitJob("lifecycle.bin", (j) => j.state === "paused");
  assert.ok(BigInt(recovered.durable_bytes) > 0n);
  assert.equal(
    probe(["list"]).jobs.filter((j) => j.name === "lifecycle.bin").length,
    1,
  );
  await page
    .locator(".download-row")
    .filter({ hasText: "lifecycle.bin" })
    .getByRole("button", { name: "Reanudar lifecycle.bin", exact: true })
    .click();
  await waitJob("lifecycle.bin", (j) => j.state === "completed");
  assert.equal(
    createHash("sha256")
      .update(await readFile(path.join(files, "lifecycle.bin")))
      .digest("hex"),
    expectedHash(slow.size),
  );
  await page
    .locator(".download-row")
    .filter({ hasText: "lifecycle.bin" })
    .getByRole("button", { name: "Abrir carpeta lifecycle.bin", exact: true })
    .click();
  assert.match(
    execFileSync(
      "pwsh",
      [
        "-NoProfile",
        "-File",
        "scripts/Inspect-TestFolder.ps1",
        "-Directory",
        files,
      ],
      { encoding: "utf8", windowsHide: true },
    ),
    /verified-folder/,
  );
  const beforeStop = probe(["ping"]).runtime_id;
  await page
    .getByRole("button", { name: "Detener motor", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: /^Desconectado$/ })
    .waitFor();
  for (let i = 0; i < 100; i++) {
    try {
      probe(["ping"]);
      await sleep(50);
    } catch {
      break;
    }
  }
  await sleep(500);
  assert.throws(() => probe(["ping"]), "no relaunch loop after explicit stop");
  runtime = null;
  await page
    .getByRole("button", { name: "Iniciar motor", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: /^Conectado$/ })
    .waitFor();
  const started = probe(["ping"]);
  assert.notEqual(started.runtime_id, beforeStop);
  runtime = {
    pid: started.process_id,
    exitCode: null,
    kill: () => {
      try {
        process.kill(started.process_id);
      } catch {}
    },
  };
  assert.equal(
    probe(["list"]).jobs.filter((j) => j.name === "lifecycle.bin").length,
    1,
  );
  await writeFile(path.join(files, "locked.bin"), "previous");
  locker = spawn(
    "pwsh",
    [
      "-NoProfile",
      "-File",
      "scripts/Hold-TestFile.ps1",
      "-File",
      path.join(files, "locked.bin"),
    ],
    { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
  );
  await new Promise((resolve, reject) => {
    locker.stdout.once("data", (b) =>
      String(b).includes("locked") ? resolve() : reject(Error("Lock failed")),
    );
    locker.once("exit", (code) => {
      if (code !== 0) reject(Error("Lock process failed"));
    });
  });
  await page
    .getByRole("button", { name: "Nueva descarga", exact: true })
    .click();
  await page
    .getByLabel("URL del archivo", { exact: true })
    .fill(fixture.url + "/file");
  await page
    .getByLabel("Nombre del archivo", { exact: true })
    .fill("locked.bin");
  await page
    .getByLabel("Si existe el destino", { exact: false })
    .selectOption("replace");
  await page
    .getByRole("button", { name: "Descargar ahora", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Nueva descarga", exact: true })
    .waitFor({ state: "hidden" });
  const blocked = await waitJob(
    "locked.bin",
    (j) => j.state === "publish_pending",
  );
  assert.equal(blocked.error, "publish_blocked");
  locker.stdin.end("\n");
  await new Promise((r) => locker.once("exit", r));
  locker = null;
  assert.equal(
    await readFile(path.join(files, "locked.bin"), "utf8"),
    "previous",
  );
  const requestsBeforeRetry = fixture.records.length;
  const lockedRow = page
    .locator(".download-row")
    .filter({ hasText: "locked.bin" });
  await lockedRow.getByLabel("Acciones de locked.bin", { exact: true }).click();
  await lockedRow
    .getByRole("button", { name: "Reanudar / reintentar", exact: true })
    .click();
  await waitJob("locked.bin", (j) => j.state === "completed");
  assert.equal(fixture.records.length, requestsBeforeRetry);
  assert.equal(
    createHash("sha256")
      .update(await readFile(path.join(files, "locked.bin")))
      .digest("hex"),
    expectedHash(fixture.size),
  );
  await page
    .getByRole("button", { name: "Configuración", exact: true })
    .click();
  const settings = page.getByRole("dialog", {
    name: "Configuración",
    exact: true,
  });
  async function toggle(label, value) {
    const control = settings.getByLabel(label, { exact: true });
    if ((await control.isChecked()) !== value) await control.click();
    for (let i = 0; i < 100 && (await control.isChecked()) !== value; i++)
      await sleep(50);
    assert.equal(
      await control.isChecked(),
      value,
      "preference must be durably acknowledged",
    );
  }
  await toggle("Mini ventana de progreso", true);
  for (
    let i = 0;
    i < 80 &&
    !browser
      .contexts()[0]
      .pages()
      .some((p) => p !== page && p.url() !== "about:blank");
    i++
  )
    await sleep(100);
  const mini = browser
    .contexts()[0]
    .pages()
    .find((p) => p !== page && p.url() !== "about:blank");
  assert.ok(mini);
  await mini.getByRole("main", { name: "Mini ventana de progreso" }).waitFor();
  await mini.locator("strong").waitFor();
  const miniName = await mini.locator("strong").textContent();
  assert.ok(
    probe(["list"]).jobs.some((job) => job.name === miniName),
    "mini displays an actual runtime job",
  );
  const rejected = await mini.evaluate(async () => {
    try {
      await window.__TAURI_INTERNALS__.invoke("download_command", {
        request: {
          version: 1,
          id: "forbidden-mini",
          command: "get_app_preferences",
        },
      });
      return false;
    } catch {
      return true;
    }
  });
  assert.equal(rejected, true, "mini cannot read private preferences");
  await toggle("Mini ventana de progreso", false);
  await toggle("Zona para soltar enlaces", true);
  await settings.getByRole("button", { name: "Cerrar", exact: true }).click();
  let drop;
  for (let i = 0; i < 80 && !drop; i++) {
    for (const candidate of browser.contexts().flatMap((c) => c.pages())) {
      if (
        candidate !== page &&
        !candidate.isClosed() &&
        (await candidate
          .getByRole("region", { name: "Zona para soltar enlaces" })
          .count())
      )
        drop = candidate;
    }
    if (!drop) await sleep(100);
  }
  assert.ok(drop, "real floating drop window");
  const beforeDrop = probe(["list"]).jobs.length;
  await drop
    .getByRole("region", { name: "Zona para soltar enlaces" })
    .evaluate((element, url) => {
      const transfer = new DataTransfer();
      transfer.setData("text/uri-list", url);
      element.dispatchEvent(
        new DragEvent("drop", { bubbles: true, dataTransfer: transfer }),
      );
    }, fixture.url + "/file");
  await page
    .getByRole("dialog", { name: "Nueva descarga", exact: true })
    .waitFor();
  assert.equal(
    await page.getByLabel("URL del archivo", { exact: true }).inputValue(),
    fixture.url + "/file",
  );
  await page.keyboard.press("Escape");
  assert.equal(
    probe(["list"]).jobs.length,
    beforeDrop,
    "drop only prepares the dialog",
  );
  console.log(
    "PASS destino bloqueado conserva archivo, reintenta publicación sin otro GET; mini real con permisos limitados y drop abre revisión sin descargar.",
  );
  console.log(
    "PASS pausa/reanuda, cierre nativo ocultando sin detener, segunda apertura sin duplicados, salida coordinada, recuperación/hash y preferencias.",
  );
  console.log(
    "PASS Tauri → IPC → runtime → archivo real; aceptación durable, fila real, hash y ningún GET previo/repetido.",
  );
  const queuedCrash = await command(
    {
      create_download: {
        draft: {
          ...draft,
          start: "queue",
          input: {
            ...draft.input,
            name: "queue-crash.bin",
            url: `http://127.0.0.1:${held.address().port}/one-use`,
          },
        },
      },
    },
    "queue-crash-test",
  );
  assert.equal(queuedCrash.kind, "download");
  for (let i = 0; i < 100 && heldRequests === 0; i++) await sleep(50);
  assert.equal(heldRequests, 1, "queued job reached server before crash");
  const crashPid = probe(["ping"]).process_id;
  assert.equal(
    crashPid,
    runtime.pid,
    "only the runtime started by this test may be terminated",
  );
  process.kill(crashPid);
  await page
    .getByRole("button", { name: "Iniciar motor", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Iniciar motor", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: /^Conectado$/ })
    .waitFor();
  const recoveredRuntime = probe(["ping"]).process_id;
  runtime = {
    pid: recoveredRuntime,
    exitCode: null,
    kill: () => {
      try {
        process.kill(recoveredRuntime);
      } catch {}
    },
  };
  assert.equal(
    probe(["list"]).jobs.find((j) => j.id === "queue-crash-test").state,
    "paused",
  );
  await sleep(500);
  assert.equal(
    heldRequests,
    1,
    "recovery must not replay a queued URL already requested",
  );
  console.log(
    "PASS cola guarda comienzo antes del GET; caída y reapertura recuperan pausado sin repetir petición.",
  );
} finally {
  held.closeAllConnections();
  await new Promise((resolve) => held.close(resolve));
  locker?.stdin.end("\n");
  desktop?.kill();
  if (runtime?.exitCode === null) {
    try {
      assert.equal(probe(["ping"]).process_id, runtime.pid);
      execFileSync(exe("idg-probe"), ["shutdown"], {
        windowsHide: true,
        stdio: "ignore",
      });
    } catch {
      runtime.kill();
    }
  }
  await fixture.close();
  await slow.close();
}
