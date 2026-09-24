import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import net from "node:net";
import http from "node:http";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { startSegments, expectedHash } from "../fixtures/http/segments.mjs";

const root = process.cwd();
const exe = (name) => path.join(root, `target/debug/${name}.exe`);
const probe = (command = "ping") => JSON.parse(execFileSync(exe("idg-probe"), [command], { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "ignore"] }));
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
async function setMode(popup, mode) {
  await popup.locator("#autopick").selectOption(mode);
  for (let n = 0; n < 40; n++) {
    const state = await popup.evaluate(() => chrome.runtime.sendMessage({ type: "state" }));
    if (state.engine?.autopick_mode === mode) return;
    await sleep(100);
  }
  throw new Error(`El modo ${mode} no quedó confirmado por el runtime`);
}
try { probe(); throw Error("Hay otro runtime IDG activo; no se toca."); } catch (e) { if (e.message.includes("otro runtime")) throw e; }
await mkdir(".local", { recursive: true });
await mkdir("artifacts", { recursive: true });
const base = await mkdtemp(path.join(root, ".local/capture-07-"));
const files = path.join(base, "files");
await mkdir(files);
const extension = path.join(base, "extension");
await cp(path.join(root, "apps/extension/build/chromium"), extension, { recursive: true });
const manifestPath = path.join(extension, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
// Isolated integration fixture: consent is pre-granted by the test profile's
// local unpacked manifest. The shipped extension keeps downloads optional.
manifest.permissions.push("downloads");
manifest.optional_permissions = [];
// An extension tab opened directly by Playwright does not receive activeTab's
// user-gesture grant. Limit the test-only page grant to this loopback fixture.
manifest.host_permissions = ["http://127.0.0.1/*"];
await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
const identity = JSON.parse(await readFile("apps/extension/development-identity.json", "utf8"));
const fixture = await startSegments({ size: 8 * 1024 * 1024, rate: 512 * 1024 });
const linkPage = http.createServer((_request, response) => {
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  response.end(`<a href="${fixture.url}/direct.bin">Archivo directo</a>`);
});
await new Promise((done) => linkPage.listen(0, "127.0.0.1", done));
const linkPageUrl = `http://127.0.0.1:${linkPage.address().port}/`;
const socket = net.createServer();
await new Promise((done) => socket.listen(0, "127.0.0.1", done));
const debugPort = socket.address().port;
await new Promise((done) => socket.close(done));
const env = { ...process.env, IDG_DATA_DIR: path.join(base, "state"), WEBVIEW2_USER_DATA_FOLDER: path.join(base, "webview"), WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${debugPort}` };
let desktop, webview, browser;
try {
  desktop = spawn(exe("idg-desktop"), [], { env, windowsHide: true, stdio: "ignore" });
  for (let n = 0; n < 100; n++) {
    try { webview = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`); break; } catch { await sleep(100); }
  }
  assert.ok(webview, "Tauri/WebView2 no abrió");
  const app = webview.contexts()[0].pages()[0];
  app.setDefaultTimeout(20000);
  await app.getByRole("status").filter({ hasText: /^Conectado$/ }).waitFor();
  await app.getByRole("dialog", { name: "Primera configuración" }).waitFor();
  const wizard = app.getByRole("dialog", { name: "Primera configuración" });
  await wizard.getByRole("button", { name: "Siguiente", exact: true }).click();
  await wizard.getByLabel("Carpeta inicial", { exact: true }).fill(files);
  await wizard.getByRole("button", { name: "Siguiente", exact: true }).click();
  await wizard.getByRole("button", { name: "Omitir navegador", exact: true }).click();
  await wizard.getByRole("button", { name: "Guardar configuración", exact: true }).click();
  await wizard.waitFor({ state: "hidden", timeout: 8000 }).catch(async (error) => {
    let runtimeState;
    try { runtimeState = probe(); } catch (e) { runtimeState = String(e); }
    throw new Error(`${error.message}\n${await wizard.innerText()}\nruntime=${JSON.stringify(runtimeState)} desktopExit=${desktop.exitCode}`);
  });
  const beforeClients = probe().sequence;
  await sleep(500);
  assert.ok(probe().sequence - beforeClients < 30, "La ventana no debe crear un ciclo de consultas por cada cambio de clientes");

  browser = await chromium.launchPersistentContext(path.join(base, "browser"), { channel: "chromium", headless: true, acceptDownloads: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  const popup = await browser.newPage();
  const errors = [];
  popup.on("pageerror", (error) => errors.push(error.message));
  await popup.goto(`chrome-extension://${identity.chromium_id}/popup.html`);
  await popup.locator("#status").filter({ hasText: /^Conectado$/ }).waitFor();
  assert.equal(await popup.locator("#status").getAttribute("data-state"), "online");
  await setMode(popup, "always");
  assert.match(await popup.locator("#capture-permission").innerText(), /autorizada/);
  const dialog = app.getByRole("dialog", { name: "Nueva descarga" });
  await app.getByRole("button", { name: "Nueva descarga", exact: true }).click();
  await dialog.waitFor();
  await dialog.getByLabel("URL del archivo", { exact: true }).fill("http://127.0.0.1/manual.bin");
  await dialog.getByLabel("Nombre del archivo", { exact: true }).fill("manual.bin");
  const tab = await browser.newPage();
  const [download] = await Promise.all([tab.waitForEvent("download"), tab.goto(fixture.url + "/capture.bin").catch(() => {})]);
  for (let n = 0; n < 50; n++) {
    const stored = await popup.evaluate(() => chrome.storage.local.get("pending"));
    if (stored.pending?.length) break;
    await sleep(100);
  }
  assert.equal(await dialog.getByLabel("URL del archivo", { exact: true }).inputValue(), "http://127.0.0.1/manual.bin", "Una propuesta no debe sustituir el formulario manual abierto");
  assert.ok(await dialog.getByRole("button", { name: "Descargar ahora" }).isVisible());
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await dialog.waitFor({ timeout: 8000 }).catch(async (error) => {
    const downloads = await popup.evaluate(() => chrome.downloads.search({}));
    const stored = await popup.evaluate(() => chrome.storage.local.get(["pending", "offers"]));
    throw new Error(`${error.message}\npopup=${await popup.locator("#status").innerText()} detail=${await popup.locator("#detail").innerText()} downloads=${JSON.stringify(downloads.map((item) => ({ state: item.state, filename: item.filename, totalBytes: item.totalBytes, mime: item.mime, finalUrl: item.finalUrl })))} stored=${JSON.stringify(stored)}`);
  });
  for (let n = 0; n < 80; n++) {
    if (await dialog.getByLabel("URL del archivo", { exact: true }).inputValue().catch(() => "") === fixture.url + "/capture.bin") break;
    await sleep(100);
  }
  assert.equal(await dialog.getByLabel("URL del archivo", { exact: true }).inputValue(), fixture.url + "/capture.bin");
  assert.equal(await dialog.getByLabel("Nombre del archivo", { exact: true }).inputValue(), "capture.bin");
  await dialog.getByLabel("El enlace permite solicitudes repetidas").check();
  await app.screenshot({ path: "artifacts/chromium-capture-dialog.png", mask: [dialog.getByLabel("Carpeta", { exact: true }), dialog.getByLabel("URL del archivo", { exact: true })] });
  await dialog.getByRole("button", { name: "Aceptar en IDG" }).click();
  await dialog.waitFor({ state: "hidden" });
  let job;
  for (let n = 0; n < 600; n++) {
    job = probe("list").jobs[0];
    if (job?.state === "completed") break;
    await sleep(100);
  }
  if (job?.state !== "completed") {
    const stored = await popup.evaluate(() => chrome.storage.local.get("pending"));
    const downloads = await popup.evaluate(() => chrome.downloads.search({}));
    throw new Error(`IDG no completó: jobs=${JSON.stringify(probe("list").jobs.map((entry) => ({ name: entry.name, state: entry.state, error: entry.error, durable_bytes: entry.durable_bytes })))} pending=${JSON.stringify(stored)} browser=${JSON.stringify(downloads.map((entry) => ({ state: entry.state, error: entry.error, filename: entry.filename, totalBytes: entry.totalBytes })))}`);
  }
  const bytes = await readFile(path.join(files, job.name));
  assert.equal(bytes.length, fixture.size);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), expectedHash(fixture.size));
  assert.equal(probe("list").jobs.length, 1, "No debe existir un segundo trabajo IDG");
  const chromiumDownloads = await popup.evaluate(() => chrome.downloads.search({}));
  const original = chromiumDownloads.find((entry) => entry.url === fixture.url + "/capture.bin");
  assert.equal(original?.state, "interrupted", "El original debía retirarse solo tras bytes durables de IDG");
  assert.deepEqual(errors, []);
  await popup.screenshot({ path: "artifacts/chromium-capture-result.png" });
  const browserTab = await browser.newPage();
  const [browserDownload] = await Promise.all([browserTab.waitForEvent("download"), browserTab.goto(fixture.url + "/browser.bin").catch(() => {})]);
  await dialog.waitFor();
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  const browserFile = await browserDownload.path();
  assert.equal(createHash("sha256").update(await readFile(browserFile)).digest("hex"), expectedHash(fixture.size));
  assert.equal(probe("list").jobs.length, 1, "Cancelar el diálogo no crea otro trabajo IDG");
  assert.deepEqual(await readdir(files), ["capture.bin"]);
  await setMode(popup, "ask");
  const askTab = await browser.newPage();
  const [askDownload] = await Promise.all([askTab.waitForEvent("download"), askTab.goto(fixture.url + "/ask.bin").catch(() => {})]);
  await popup.locator("#offers button").filter({ hasText: "ask.bin" }).click();
  await dialog.waitFor();
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  assert.equal(createHash("sha256").update(await readFile(await askDownload.path())).digest("hex"), expectedHash(fixture.size));
  await setMode(popup, "browser");
  const leaveTab = await browser.newPage();
  const [leaveDownload] = await Promise.all([leaveTab.waitForEvent("download"), leaveTab.goto(fixture.url + "/leave.bin").catch(() => {})]);
  await sleep(1000);
  assert.equal(await dialog.isVisible(), false, "Usar el navegador no abre Nueva descarga");
  assert.equal(createHash("sha256").update(await readFile(await leaveDownload.path())).digest("hex"), expectedHash(fixture.size));
  assert.equal(probe("list").jobs.length, 1);
  assert.deepEqual(await readdir(files), ["capture.bin"]);
  await popup.reload();
  await popup.locator("#status").filter({ hasText: /^Conectado$/ }).waitFor();
  assert.equal(await popup.locator("#autopick").inputValue(), "browser", "El modo debe persistir al reabrir el popup");
  await setMode(popup, "always");
  await popup.getByText("Excepciones y tamaño").click();
  await popup.locator("#ignore-ext").fill(".bin");
  await popup.locator("#save-rules").click();
  for (let n = 0; n < 30; n++) {
    const saved = await popup.evaluate(() => chrome.storage.local.get("settings"));
    if (saved.settings?.ignoredExtensions?.includes("bin")) break;
    await sleep(100);
  }
  await popup.reload();
  await popup.getByText("Excepciones y tamaño").click();
  assert.equal(await popup.locator("#ignore-ext").inputValue(), "bin", "La excepción debe persistir en el perfil");
  const ignoredTab = await browser.newPage();
  const [ignoredDownload] = await Promise.all([ignoredTab.waitForEvent("download"), ignoredTab.goto(fixture.url + "/ignored.bin").catch(() => {})]);
  await sleep(1000);
  assert.equal(await dialog.isVisible(), false, "La extensión .bin ignorada no debe proponer captura");
  assert.equal(createHash("sha256").update(await readFile(await ignoredDownload.path())).digest("hex"), expectedHash(fixture.size));
  assert.equal(probe("list").jobs.length, 1);
  await popup.locator("#ignore-ext").fill("");
  await popup.locator("#save-rules").click();
  const sourceTab = await browser.newPage();
  await sourceTab.goto(linkPageUrl);
  await sourceTab.bringToFront();
  await popup.getByRole("button", { name: "Previsualizar enlaces" }).click();
  const directChoice = popup.locator("#links button").filter({ hasText: "direct.bin" });
  await directChoice.waitFor({ timeout: 5000 }).catch(async (error) => {
    const active = await popup.evaluate(() => chrome.tabs.query({ active: true, currentWindow: true }));
    throw new Error(`${error.message}\nactive=${JSON.stringify(active.map((tab) => ({ url: tab.url, id: tab.id })))} links=${await popup.locator("#links").innerText()} notice=${await popup.locator("#notice").innerText()}`);
  });
  await directChoice.click();
  await dialog.waitFor();
  assert.equal(await dialog.getByLabel("URL del archivo", { exact: true }).inputValue(), fixture.url + "/direct.bin");
  await dialog.getByLabel("El enlace permite solicitudes repetidas").check();
  await dialog.getByRole("button", { name: "Aceptar en IDG" }).click();
  await dialog.waitFor({ state: "hidden" });
  let directJob;
  for (let n = 0; n < 600; n++) {
    directJob = probe("list").jobs.find((entry) => entry.name === "direct.bin");
    if (directJob?.state === "completed") break;
    await sleep(100);
  }
  assert.equal(directJob?.state, "completed", "El enlace elegido debe completarse en IDG");
  assert.equal(createHash("sha256").update(await readFile(path.join(files, "direct.bin"))).digest("hex"), expectedHash(fixture.size));
  assert.equal(probe("list").jobs.length, 2);
  assert.deepEqual((await readdir(files)).sort(), ["capture.bin", "direct.bin"]);
  assert.equal((await popup.evaluate(() => chrome.downloads.search({}))).filter((item) => item.url === fixture.url + "/direct.bin").length, 0, "El enlace directo aceptado no debe crear descarga paralela en Chromium");
  console.log("PASS Chromium: traspaso observado y enlace directo elegidos en la interfaz, hashes únicos, cancelación conserva navegador, modos y extensión ignorada.");
  void download;
} finally {
  await browser?.close();
  try { probe("shutdown"); } catch { /* runtime absent */ }
  await webview?.close();
  if (desktop?.exitCode === null) desktop.kill();
  await new Promise((done) => linkPage.close(done));
  await fixture.close();
}
