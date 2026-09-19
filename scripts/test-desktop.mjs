import { spawn, execFileSync } from "node:child_process";
import { mkdir, mkdtemp } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright";
const root = process.cwd();
const probe = path.join(root, "target/debug/idg-probe.exe");
const ping = () =>
  JSON.parse(
    execFileSync(probe, ["ping"], {
      encoding: "utf8",
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
    }),
  );
let existing;
try {
  existing = ping();
} catch {}
if (existing) throw new Error("Detén el runtime antes de esta prueba aislada.");
await mkdir(".local", { recursive: true });
await mkdir("artifacts", { recursive: true });
const profile = await mkdtemp(path.join(root, ".local/webview-"));
const server = net.createServer();
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
await new Promise((r) => server.close(r));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let runtime, desktop, browser;
try {
  desktop = spawn(path.join(root, "target/debug/idg-desktop.exe"), [], {
    windowsHide: true,
    env: {
      ...process.env,
      WEBVIEW2_USER_DATA_FOLDER: profile,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
    },
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
  assert.ok(browser, "WebView2 de la aplicación real debe abrirse");
  const page = browser.contexts()[0].pages()[0];
  await page
    .getByRole("status")
    .filter({ hasText: /^Desconectado$/ })
    .waitFor();
  await page.getByRole("button", { name: "Reconectar", exact: true }).click();
  await page
    .getByText(
      "No se pudo conectar con el motor. Comprueba que esté iniciado",
      { exact: true },
    )
    .waitFor();
  runtime = spawn(path.join(root, "target/debug/idg-runtime.exe"), [], {
    windowsHide: true,
    stdio: "ignore",
  });
  for (let i = 0; i < 40; i++) {
    try {
      ping();
      break;
    } catch {
      await sleep(100);
    }
  }
  await page.getByRole("button", { name: "Reconectar", exact: true }).click();
  await page
    .getByRole("status")
    .filter({ hasText: /^Conectado$/ })
    .waitFor();
  const original = ping();
  await page.getByRole("button", { name: "Comprobar conexión" }).click();
  await page
    .getByText("El motor respondió al ping.", { exact: true })
    .waitFor();
  await page.screenshot({
    animations: "disabled",
    path: "artifacts/desktop-connected.png",
  });
  await mkdir("artifacts/ui-02", { recursive: true });
  for (const theme of ["light", "dark"]) {
    await page.getByLabel("Tema", { exact: true }).selectOption(theme);
    await page.screenshot({
      animations: "disabled",
      path: `artifacts/ui-02/app-${theme}.png`,
    });
  }
  assert.equal(await page.locator(".download-row").count(), 0);
  await page
    .getByRole("button", { name: "Nueva descarga", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Nueva descarga", exact: true })
    .waitFor();
  await page.screenshot({
    animations: "disabled",
    path: "artifacts/ui-02/app-new-download.png",
  });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Detener motor" }).click();
  await page
    .getByRole("status")
    .filter({ hasText: /^Desconectado$/ })
    .waitFor();
  await new Promise((r) =>
    runtime.exitCode !== null ? r() : runtime.once("exit", r),
  );
  runtime = spawn(path.join(root, "target/debug/idg-runtime.exe"), [], {
    windowsHide: true,
    stdio: "ignore",
  });
  for (let i = 0; i < 40; i++) {
    try {
      ping();
      break;
    } catch {
      await sleep(100);
    }
  }
  await page.getByRole("button", { name: "Reconectar", exact: true }).click();
  await page
    .getByRole("status")
    .filter({ hasText: /^Conectado$/ })
    .waitFor();
  assert.notEqual(ping().runtime_id, original.runtime_id);
  desktop.kill();
  assert.ok(ping().process_id);
  console.log(
    "PASS ventana Tauri/WebView2 real: desconectado, handshake, ping, shutdown, reconexión; cierre conserva runtime.",
  );
} finally {
  desktop?.kill();
  try {
    execFileSync(probe, ["shutdown"], { windowsHide: true, stdio: "ignore" });
  } catch {
    runtime?.kill();
  }
}
