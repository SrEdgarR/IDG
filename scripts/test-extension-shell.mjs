import { chromium } from "playwright";
import { mkdtemp, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";

const root = process.cwd();
process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.join(root, "tools/browsers");
await mkdir(".local", { recursive: true });
const profile = await mkdtemp(path.join(root, ".local/chromium-shell-"));
const identity = JSON.parse(await readFile("apps/extension/development-identity.json", "utf8"));
const extension = path.join(root, "apps/extension/build/chromium");
const context = await chromium.launchPersistentContext(profile, {
  channel: "chromium",
  headless: true,
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
});
try {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
  const failures = [];
  worker.on("console", (message) => { if (message.type() === "error") failures.push(message.text()); });
  worker.on("pageerror", (error) => failures.push(error.message));
  const page = await context.newPage();
  page.on("pageerror", (error) => failures.push(error.message));
  await page.goto(`chrome-extension://${identity.chromium_id}/popup.html`);
  await page.locator("#status").filter({ hasText: /^(Conectado|Desconectado)$/ }).waitFor({ timeout: 8000 }).catch(async (error) => {
    const diagnostic = await worker.evaluate(() => ({ downloads: typeof chrome.downloads, menu: typeof chrome.contextMenus, id: chrome.runtime.id })).catch((e) => String(e));
    throw new Error(`${error.message}\nstatus=${await page.locator("#status").textContent()} detail=${await page.locator("#detail").textContent()} errors=${JSON.stringify(failures)} worker=${JSON.stringify(diagnostic)}`);
  });
  const manifest = await page.evaluate(() => chrome.runtime.getManifest());
  assert.equal(manifest.background?.service_worker, "worker.js");
  assert.deepEqual(manifest.optional_permissions, ["downloads"]);
  assert.ok(await page.getByRole("button", { name: "Previsualizar enlaces" }).isVisible());
  await page.getByRole("button", { name: "Activar detección global" }).click();
  await page.waitForFunction(() => document.querySelector("#capture-permission")?.textContent?.includes("autorizada") || !!document.querySelector("#notice")?.textContent, null, { timeout: 3000 }).catch(() => {});
  const permissionLabel = await page.locator("#capture-permission").innerText();
  if (permissionLabel.includes("autorizada")) {
    assert.equal(await worker.evaluate(() => typeof chrome.downloads), "object");
  }
  assert.deepEqual(failures, []);
  console.log(`PASS Chromium: worker y popup cargan sin errores; permiso global ${permissionLabel.includes("autorizada") ? "concedido" : "no resuelto en headless"}.`);
} finally {
  await context.close();
}
