import { spawn, execFileSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import assert from "node:assert/strict";
import { chromium } from "playwright";
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function desktopHarness() {
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
  if (existing) throw Error("Runtime previo activo; esta prueba no lo cierra.");
  await mkdir(".local", { recursive: true });
  const dir = await mkdtemp(path.join(root, ".local/organization-"));
  const files = path.join(dir, "files");
  await mkdir(files);
  const socket = net.createServer();
  await new Promise((r) => socket.listen(0, "127.0.0.1", r));
  const port = socket.address().port;
  await new Promise((r) => socket.close(r));
  const env = {
    ...process.env,
    IDG_DATA_DIR: path.join(dir, "state"),
    IDG_POWER_ADAPTER: "simulate",
    IDG_CLIPBOARD_FIXTURE: path.join(dir, "clipboard.txt"),
    WEBVIEW2_USER_DATA_FOLDER: path.join(dir, "webview"),
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
  };
  const child = spawn(exe("idg-desktop"), [], {
    env,
    windowsHide: true,
    stdio: "ignore",
  });
  let browser, pid;
  const close = async () => {
    try {
      if (pid && probe(["ping"]).process_id === pid) probe(["shutdown"]);
    } catch {}
    child.kill();
    await browser?.close().catch(() => {});
    if (pid) {
      for (let i = 0; i < 100; i++) {
        try {
          process.kill(pid, 0);
        } catch {
          return;
        }
        await sleep(100);
      }
      throw Error(
        "El runtime propio de la prueba no terminó tras solicitar salida.",
      );
    }
  };
  try {
    for (let i = 0; i < 100; i++) {
      try {
        browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
        break;
      } catch {
        await sleep(100);
      }
    }
    assert.ok(browser, "Tauri WebView2 real");
    const page = browser.contexts()[0].pages()[0];
    page.setDefaultTimeout(15000);
    await page
      .getByRole("status")
      .filter({ hasText: /^Conectado$/ })
      .waitFor();
    pid = probe(["ping"]).process_id;
    const wizard = page.getByRole("dialog", { name: "Primera configuración" });
    await wizard
      .getByRole("button", { name: "Siguiente", exact: true })
      .click();
    await wizard.getByLabel("Carpeta inicial", { exact: true }).fill(files);
    await wizard
      .getByRole("button", { name: "Siguiente", exact: true })
      .click();
    await wizard
      .getByRole("button", { name: "Omitir navegador", exact: true })
      .click();
    await wizard
      .getByRole("button", { name: "Guardar configuración", exact: true })
      .click();
    await wizard.waitFor({ state: "hidden" });
    const command = (command, id = crypto.randomUUID()) =>
      page.evaluate(
        (request) =>
          window.__TAURI_INTERNALS__.invoke("download_command", { request }),
        { version: 1, id, command },
      );
    const org = (operation, id) => command({ organization: { operation } }, id);
    const jobs = () => probe(["list"]).jobs;
    const waitJob = async (name, predicate) => {
      for (let i = 0; i < 300; i++) {
        const job = jobs().find((j) => j.name === name);
        if (job && predicate(job)) return job;
        await sleep(100);
      }
      throw Error("Estado no alcanzado: " + name);
    };
    async function add(name, url, start = "Añadir a cola", queueId = "main") {
      await page
        .getByRole("button", { name: "Nueva descarga", exact: true })
        .click();
      const dialog = page.getByRole("dialog", {
        name: "Nueva descarga",
        exact: true,
      });
      await dialog.getByLabel("URL del archivo", { exact: true }).fill(url);
      await dialog.getByLabel("Nombre del archivo", { exact: true }).fill(name);
      // Editing must be observable even when preferences have already filled the same value.
      await dialog.getByLabel("Carpeta", { exact: true }).fill("");
      await dialog.getByLabel("Carpeta", { exact: true }).fill(files);
      if (queueId !== "main") {
        await dialog.getByText("Avanzado", { exact: true }).click();
        await dialog
          .getByRole("combobox", { name: "Cola de descarga", exact: true })
          .selectOption(queueId);
      }
      await dialog.getByRole("button", { name: start, exact: true }).click();
      try {
        await dialog.waitFor({ state: "hidden" });
      } catch (error) {
        await writeFile(
          path.join(dir, "add-failure.txt"),
          JSON.stringify(
            {
              name: await dialog
                .getByLabel("Nombre del archivo", { exact: true })
                .inputValue(),
              directory: await dialog
                .getByLabel("Carpeta", { exact: true })
                .inputValue(),
              expectedDirectory: files,
              dialog: await dialog.innerText(),
            },
            null,
            2,
          ),
        ).catch(() => {});
        throw error;
      }
    }
    async function restart(crash = false) {
      assert.equal(
        probe(["ping"]).process_id,
        pid,
        "Only this fixture runtime may be stopped",
      );
      if (crash) process.kill(pid);
      else probe(["shutdown"]);
      for (let i = 0; i < 100; i++) {
        let alive = true;
        try {
          probe(["ping"]);
        } catch {
          alive = false;
        }
        if (!alive) break;
        await sleep(100);
      }
      await page
        .getByRole("button", { name: "Iniciar motor", exact: true })
        .click();
      await page
        .getByRole("status")
        .filter({ hasText: /^Conectado$/ })
        .waitFor();
      pid = probe(["ping"]).process_id;
    }
    return {
      desktopProcessId: child.pid,
      page,
      browser,
      dir,
      files,
      env,
      exe,
      probe,
      command,
      org,
      jobs,
      waitJob,
      add,
      close,
      restart,
    };
  } catch (e) {
    await close();
    throw e;
  }
}
