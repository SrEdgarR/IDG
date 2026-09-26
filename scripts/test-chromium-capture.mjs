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
const stopRuntime = () => execFileSync(exe("idg-probe"), ["shutdown"], { windowsHide: true, stdio: "ignore" });
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
async function extensionWorkers(cdp, extensionId) {
  return (await cdp.send("Target.getTargets")).targetInfos.filter((target) =>
    target.type === "service_worker" && target.url === `chrome-extension://${extensionId}/worker.js`,
  );
}
function ownedHostPids(profile, hostPath, terminate = false) {
  const script = String.raw`
$ErrorActionPreference = 'Stop'
$profilePath = [IO.Path]::GetFullPath($env:IDG_TEST_PROFILE)
$nativeHostPath = [IO.Path]::GetFullPath($env:IDG_TEST_HOST)
$all = @(Get-CimInstance -ClassName Win32_Process)
$roots = @($all | Where-Object { $_.ExecutablePath -and $_.CommandLine -and $_.CommandLine.IndexOf($profilePath, [StringComparison]::OrdinalIgnoreCase) -ge 0 -and $_.CommandLine.Contains('--user-data-dir=') -and $_.CommandLine -notmatch '\s--type=' })
if ($roots.Count -ne 1) { throw 'No se pudo identificar el proceso principal del perfil temporal.' }
$owned = [System.Collections.Generic.HashSet[int]]::new()
[void]$owned.Add([int]$roots[0].ProcessId)
do {
  $changed = $false
  foreach ($process in $all) {
    if ($owned.Contains([int]$process.ParentProcessId) -and $owned.Add([int]$process.ProcessId)) { $changed = $true }
  }
} while ($changed)
$hosts = @($all | Where-Object { $owned.Contains([int]$_.ProcessId) -and [string]::Equals($_.ExecutablePath, $nativeHostPath, [StringComparison]::OrdinalIgnoreCase) })
$hostIds = @($hosts | ForEach-Object { [int]$_.ProcessId })
if ($env:IDG_TEST_TERMINATE_HOST -eq '1') {
  if ($hostIds.Count -eq 0) { throw 'No se encontró un host IDG hijo del perfil aislado.' }
  foreach ($hostId in $hostIds) { Stop-Process -Id $hostId -Force -ErrorAction Stop }
}
if ($hostIds.Count -eq 0) { '[]' } else { ConvertTo-Json -InputObject $hostIds -Compress }
`;
  const output = execFileSync("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf8", windowsHide: true,
    env: { ...process.env, IDG_TEST_PROFILE: profile, IDG_TEST_HOST: hostPath, IDG_TEST_TERMINATE_HOST: terminate ? "1" : "0" },
  }).trim();
  const ids = JSON.parse(output || "[]");
  return Array.isArray(ids) ? ids : [ids];
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
// Test-only unpacked manifest grants downloads inside this isolated profile;
// the normal build does not declare downloads or optional_permissions.
manifest.permissions.push("downloads");
manifest.optional_permissions = [];
// An extension tab opened directly by Playwright does not receive activeTab's
// user-gesture grant. Limit the test-only page grant to this loopback fixture.
manifest.host_permissions = ["http://127.0.0.1/*"];
await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
const identity = JSON.parse(await readFile("apps/extension/development-identity.json", "utf8"));
const registryManifest = execFileSync("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", "(Get-Item -LiteralPath 'HKCU:\\Software\\Chromium\\NativeMessagingHosts\\io.github.sredgarr.idg.dev').GetValue('')"], { encoding: "utf8", windowsHide: true }).trim();
const nativeManifest = JSON.parse(await readFile(registryManifest, "utf8"));
assert.ok(nativeManifest.allowed_origins?.includes(`chrome-extension://${identity.chromium_id}/`), "El host Chromium registrado debe pertenecer a IDG.");
const nativeHostPath = path.resolve(nativeManifest.path);
assert.ok(await readFile(nativeHostPath).then(() => true, () => false), "El ejecutable Native Messaging registrado debe existir.");
const fixture = await startSegments({ size: 8 * 1024 * 1024, rate: 512 * 1024 });
const directLinkNames = new Set(["allowed.bin", "direct.bin", "host-crash.bin", "worker-crash.bin", "browser-close.bin"]);
const linkPage = http.createServer((request, response) => {
  const name = new URL(request.url, "http://fixture").searchParams.get("file");
  if (!directLinkNames.has(name)) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  response.end(`<a href="${fixture.url}/${name}">${name}</a>`);
});
await new Promise((done) => linkPage.listen(0, "127.0.0.1", done));
const linkPageUrl = `http://127.0.0.1:${linkPage.address().port}/`;
const socket = net.createServer();
await new Promise((done) => socket.listen(0, "127.0.0.1", done));
const debugPort = socket.address().port;
await new Promise((done) => socket.close(done));
const env = { ...process.env, IDG_DATA_DIR: path.join(base, "state"), WEBVIEW2_USER_DATA_FOLDER: path.join(base, "webview"), WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${debugPort}` };
let desktop, webview, browser, browserCdp;
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

  const browserProfile = path.join(base, "browser");
  browser = await chromium.launchPersistentContext(browserProfile, { channel: "chromium", headless: true, acceptDownloads: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  browserCdp = await browser.browser().newBrowserCDPSession();
  await browserCdp.send("Target.setDiscoverTargets", { discover: true });
  let popup = await browser.newPage();
  const errors = [];
  popup.on("pageerror", (error) => errors.push(error.message));
  await popup.goto(`chrome-extension://${identity.chromium_id}/popup.html`);
  await popup.locator("#status").filter({ hasText: /^Conectado$/ }).waitFor().catch(async (error) => {
    let runtimeState;
    try { runtimeState = probe(); } catch (failure) { runtimeState = String(failure); }
    await app.screenshot({ path: "artifacts/chromium-capture-connection-failure.png" });
    throw new Error(`${error.message}\npopup=${await popup.locator("body").innerText()}\napp=${await app.locator("body").innerText()}\nruntime=${JSON.stringify(runtimeState)} desktopExit=${desktop.exitCode} hostPids=${JSON.stringify(ownedHostPids(browserProfile, nativeHostPath))}`);
  });
  assert.equal(await popup.locator("#status").getAttribute("data-state"), "online");
  assert.match(await popup.locator("body").innerText(), /Captura automática deshabilitada/);
  assert.match(await popup.locator("body").innerText(), /no se transfieren cookies, credenciales/i);
  assert.equal(await popup.locator("#autopick").count(), 0, "El popup no presenta AutoPick como una opción activa");
  assert.equal(await popup.locator("#capture-permission").count(), 0, "El popup no pide un permiso para una función deshabilitada");
  const dialog = app.getByRole("dialog", { name: "Nueva descarga" });
  const chooseDirectLink = async (name, doubleClick = false) => {
    const source = await browser.newPage();
    await source.goto(`${linkPageUrl}?file=${encodeURIComponent(name)}`);
    await source.bringToFront();
    await popup.getByRole("button", { name: "Previsualizar enlaces" }).click();
    const choice = popup.locator("#links button").filter({ hasText: name });
    await choice.waitFor({ timeout: 5000 });
    if (doubleClick) await choice.dblclick();
    else await choice.click();
    await dialog.waitFor();
    assert.equal(await dialog.getByLabel("URL del archivo", { exact: true }).inputValue(), `${fixture.url}/${name}`);
    assert.equal(await dialog.getByLabel("Nombre del archivo", { exact: true }).inputValue(), name);
    return source;
  };
  await app.getByRole("button", { name: "Nueva descarga", exact: true }).click();
  await dialog.waitFor();
  await dialog.getByLabel("URL del archivo", { exact: true }).fill("http://127.0.0.1/manual.bin");
  await dialog.getByLabel("Nombre del archivo", { exact: true }).fill("manual.bin");
  const tab = await browser.newPage();
  const [download] = await Promise.all([tab.waitForEvent("download"), tab.goto(fixture.url + "/capture.bin").catch(() => {})]);
  assert.equal(await dialog.getByLabel("URL del archivo", { exact: true }).inputValue(), "http://127.0.0.1/manual.bin", "Una descarga observada no debe sustituir el formulario manual abierto");
  assert.ok(await dialog.getByRole("button", { name: "Descargar ahora" }).isVisible());
  const observedFile = await download.path();
  assert.equal(createHash("sha256").update(await readFile(observedFile)).digest("hex"), expectedHash(fixture.size), "El original no reproducible debe completar en Chromium");
  const observed = await popup.evaluate(async (url) => (await chrome.downloads.search({})).find((item) => item.url === url), fixture.url + "/capture.bin");
  assert.equal(observed?.state, "complete", "La descarga observada conserva su ruta del navegador");
  assert.equal(probe("list").jobs.some((entry) => entry.name === "capture.bin"), false, "No se crea trabajo IDG para el original observado no transferible");
  const observedState = await popup.evaluate(() => chrome.storage.local.get(["pending", "offers"]));
  assert.equal(JSON.stringify(observedState).includes("capture.bin"), false, "No se conserva una propuesta que no puede traspasarse de forma segura");
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  await popup.reload();
  await popup.locator("#status").filter({ hasText: /^Conectado$/ }).waitFor();
  assert.equal(probe("list").jobs.length, 0, "Las descargas observadas sin método reproducible no se convierten en trabajos IDG");
  assert.deepEqual(await readdir(files), []);
  await chooseDirectLink("allowed.bin");
  await dialog.getByLabel("El enlace permite solicitudes repetidas").check();
  await dialog.getByRole("button", { name: "Aceptar en IDG" }).click();
  await dialog.waitFor({ state: "hidden" });
  const allowedRow = popup.locator("#jobs li").filter({ hasText: "allowed.bin" });
  await allowedRow.getByRole("button", { name: "Pausar" }).waitFor();
  await allowedRow.getByRole("button", { name: "Pausar" }).click();
  for (let n = 0; n < 60; n++) {
    if (probe("list").jobs.find((entry) => entry.name === "allowed.bin")?.state === "paused") break;
    await sleep(100);
  }
  assert.equal(probe("list").jobs.find((entry) => entry.name === "allowed.bin")?.state, "paused", "El control del popup pausa la descarga real");
  await allowedRow.getByRole("button", { name: "Reanudar" }).click();
  let allowedJob;
  for (let n = 0; n < 600; n++) {
    allowedJob = probe("list").jobs.find((entry) => entry.name === "allowed.bin");
    if (allowedJob?.state === "completed") break;
    await sleep(100);
  }
  assert.equal(allowedJob?.state, "completed", "La política exe no debe bloquear .bin");
  assert.equal(createHash("sha256").update(await readFile(path.join(files, "allowed.bin"))).digest("hex"), expectedHash(fixture.size));
  assert.equal(probe("list").jobs.length, 1);
  await chooseDirectLink("direct.bin", true);
  await sleep(300);
  const directPending = await popup.evaluate(() => chrome.storage.local.get("pending"));
  assert.equal(directPending.pending?.filter((entry) => entry.url === fixture.url + "/direct.bin").length, 1, "Dos clics sobre el mismo enlace no deben preparar dos capturas");
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
  await sleep(500);
  if (await dialog.isVisible()) {
    const visibleUrl = await dialog.getByLabel("URL del archivo", { exact: true }).inputValue();
    const stored = await popup.evaluate(() => chrome.storage.local.get(["pending", "offers"]));
    throw new Error(`No debe aparecer una segunda solicitud tras aceptar el enlace una vez: url=${visibleUrl} pending=${JSON.stringify(stored.pending?.map((entry) => ({ url: entry.url, phase: entry.phase, id: entry.id })))} offers=${JSON.stringify(stored.offers?.map((entry) => entry.url))}`);
  }
  assert.deepEqual((await readdir(files)).sort(), ["allowed.bin", "direct.bin"]);
  assert.equal((await popup.evaluate(() => chrome.downloads.search({}))).filter((item) => item.url === fixture.url + "/direct.bin").length, 0, "El enlace directo aceptado no debe crear descarga paralela en Chromium");

  // La captura observada sin método reproducible conserva su descarga en Chromium; los cortes de host y worker siguientes usan enlaces aceptados explícitamente.
  assert.deepEqual((await readdir(files)).sort(), ["allowed.bin", "direct.bin"]);
  const hostUrl = fixture.url + "/host-crash.bin";
  await chooseDirectLink("host-crash.bin");
  await dialog.getByLabel("El enlace permite solicitudes repetidas").check();
  await dialog.getByRole("button", { name: "Aceptar en IDG" }).click();
  await dialog.waitFor({ state: "hidden" });
  let hostJob;
  for (let n = 0; n < 100; n++) {
    hostJob = probe("list").jobs.find((entry) => entry.name === "host-crash.bin");
    if (hostJob && fixture.records.some((entry) => entry.route === "/host-crash.bin")) break;
    await sleep(100);
  }
  assert.ok(hostJob, "La aceptación debe persistir el trabajo antes de la caída del host");
  assert.ok(fixture.records.some((entry) => entry.route === "/host-crash.bin"), "IDG debe haber iniciado su solicitud autónoma retenida");
  assert.equal(hostJob.durable_bytes, "0", "La prueba debe cortar antes de bytes durables");
  const hostRequestsAtCrash = fixture.records.filter((entry) => entry.route === "/host-crash.bin").length;
  const hostOriginals = await popup.evaluate(async (url) => (await chrome.downloads.search({})).filter((item) => item.url === url), hostUrl);
  assert.equal(hostOriginals.length, 0, "Una captura iniciada explícitamente no debe crear un original paralelo en Chromium");
  await popup.close();
  const hostRuntimeId = probe().runtime_id;
  const nativeHostPids = ownedHostPids(browserProfile, nativeHostPath);
  assert.ok(nativeHostPids.length > 0, "Debe existir un proceso Native Messaging hijo del perfil de prueba");
  assert.deepEqual(ownedHostPids(browserProfile, nativeHostPath, true).sort(), nativeHostPids.slice().sort(), "Solo se terminan procesos host del perfil aislado");
  let remainingHosts = nativeHostPids;
  for (let n = 0; n < 30; n++) {
    remainingHosts = ownedHostPids(browserProfile, nativeHostPath);
    if (!remainingHosts.length) break;
    await sleep(100);
  }
  assert.deepEqual(remainingHosts, [], "El proceso Native Messaging debe haber terminado");
  assert.equal(probe().runtime_id, hostRuntimeId, "La caída del host no debe detener el runtime autónomo");
  assert.equal(probe("list").jobs.find((entry) => entry.id === hostJob.id)?.durable_bytes, "0", "El trabajo aceptado sigue sin bytes durables durante la caída del host");
  popup = await browser.newPage();
  await popup.goto(`chrome-extension://${identity.chromium_id}/popup.html`);
  await popup.locator("#status").filter({ hasText: /^Conectado$/ }).waitFor();
  await popup.getByRole("button", { name: "Reconectar" }).click();
  await popup.locator("#status").filter({ hasText: /^Conectado$/ }).waitFor();
  assert.ok(ownedHostPids(browserProfile, nativeHostPath).length > 0, "Abrir la extensión debe iniciar un Native Messaging host nuevo");
  assert.equal(probe().runtime_id, hostRuntimeId, "La recuperación del host reutiliza el mismo runtime");
  assert.equal(fixture.records.filter((entry) => entry.route === "/host-crash.bin").length, hostRequestsAtCrash, "Reconectar el host no debe volver a solicitar rangos activos");
  fixture.releaseHostCrash();
  let completedHostJob;
  for (let n = 0; n < 600; n++) {
    completedHostJob = probe("list").jobs.find((entry) => entry.id === hostJob.id);
    if (completedHostJob?.state === "completed") break;
    await sleep(100);
  }
  assert.equal(completedHostJob?.state, "completed", "La captura debe continuar después de reiniciar el host");
  assert.equal(createHash("sha256").update(await readFile(path.join(files, "host-crash.bin"))).digest("hex"), expectedHash(fixture.size));
  assert.equal((await popup.evaluate(async (url) => (await chrome.downloads.search({})).filter((item) => item.url === url).length, hostUrl)), 0, "La ruta explícita no debe crear un original en Chromium");
  assert.equal(probe("list").jobs.filter((entry) => entry.name === "host-crash.bin").length, 1, "La recuperación conserva un solo trabajo aceptado");
  const hostRanges = fixture.records.filter((entry) => entry.route === "/host-crash.bin" && entry.range).map((entry) => entry.range);
  assert.equal(new Set(hostRanges).size, hostRanges.length, "La caída del host no debe duplicar rangos HTTP");
  console.log("PASS host IDG: se terminó el Native Messaging hijo del perfil; el runtime conservó la solicitud directa a 0 bytes durables, reconectó el host y completó un solo trabajo con hash correcto.");

  const workerUrl = fixture.url + "/worker-crash.bin";
  await chooseDirectLink("worker-crash.bin");
  await dialog.getByLabel("El enlace permite solicitudes repetidas").check();
  await dialog.getByRole("button", { name: "Aceptar en IDG" }).click();
  await dialog.waitFor({ state: "hidden" });
  let workerJob;
  for (let n = 0; n < 100; n++) {
    workerJob = probe("list").jobs.find((entry) => entry.name === "worker-crash.bin");
    if (workerJob && fixture.records.some((entry) => entry.route === "/worker-crash.bin")) break;
    await sleep(100);
  }
  assert.ok(workerJob, "La aceptación debe persistir antes de terminar el worker");
  assert.ok(fixture.records.some((entry) => entry.route === "/worker-crash.bin"), "La transferencia IDG debe estar iniciada y retenida durante el traspaso");
  assert.equal(workerJob.durable_bytes, "0", "El worker se termina antes de bytes durables");
  const workerRequestsAtTermination = fixture.records.filter((entry) => entry.route === "/worker-crash.bin").length;
  const workerTargets = await extensionWorkers(browserCdp, identity.chromium_id);
  assert.equal(workerTargets.length, 1, "Debe haber un único service worker de la extensión");
  const previousWorkerTargetId = workerTargets[0].targetId;
  await browserCdp.send("Target.closeTarget", { targetId: previousWorkerTargetId });
  let liveWorkers = await extensionWorkers(browserCdp, identity.chromium_id);
  for (let n = 0; n < 30; n++) {
    if (!liveWorkers.length) break;
    await sleep(50);
    liveWorkers = await extensionWorkers(browserCdp, identity.chromium_id);
  }
  assert.equal(liveWorkers.length, 0, "Chromium debe terminar el service worker real antes de reabrirlo");
  await popup.getByRole("button", { name: "Reconectar" }).click();
  for (let n = 0; n < 150; n++) {
    liveWorkers = await extensionWorkers(browserCdp, identity.chromium_id);
    if (liveWorkers.length === 1 && liveWorkers[0].targetId !== previousWorkerTargetId) break;
    await sleep(100);
  }
  assert.equal(liveWorkers.length, 1, "Reconectar debe iniciar un service worker real");
  await popup.locator("#status").filter({ hasText: /^Conectado$/ }).waitFor();
  assert.equal(probe("list").jobs.filter((entry) => entry.name === "worker-crash.bin").length, 1, "El worker nuevo conserva un único trabajo aceptado");
  assert.equal(probe("list").jobs.find((entry) => entry.id === workerJob.id)?.durable_bytes, "0");
  await sleep(600);
  assert.equal(fixture.records.filter((entry) => entry.route === "/worker-crash.bin").length, workerRequestsAtTermination, "Reiniciar el worker no debe volver a solicitar rangos activos");
  fixture.releaseWorkerCrash();
  let completedWorkerJob;
  for (let n = 0; n < 600; n++) {
    completedWorkerJob = probe("list").jobs.find((entry) => entry.id === workerJob.id);
    if (completedWorkerJob?.state === "completed") break;
    await sleep(100);
  }
  assert.equal(completedWorkerJob?.state, "completed", "El trabajo debe terminar tras reiniciar el worker");
  assert.equal(createHash("sha256").update(await readFile(path.join(files, "worker-crash.bin"))).digest("hex"), expectedHash(fixture.size));
  const workerRanges = fixture.records.filter((entry) => entry.route === "/worker-crash.bin" && entry.range).map((entry) => entry.range);
  assert.equal(new Set(workerRanges).size, workerRanges.length, "La caída del worker no debe duplicar rangos HTTP");
  assert.equal((await popup.evaluate(async (url) => (await chrome.downloads.search({})).filter((item) => item.url === url).length, workerUrl)), 0, "El enlace explícito no crea un original paralelo");
  assert.equal(probe("list").jobs.filter((entry) => entry.name === "worker-crash.bin").length, 1);
  console.log("PASS worker: se terminó el service worker durante la solicitud explícita, se observó su ausencia y reinicio, y el mismo trabajo terminó con hash correcto sin segunda solicitud.");

  const browserCloseUrl = fixture.url + "/browser-close.bin";
  await chooseDirectLink("browser-close.bin");
  await dialog.getByLabel("El enlace permite solicitudes repetidas").check();
  await dialog.getByRole("button", { name: "Aceptar en IDG" }).click();
  await dialog.waitFor({ state: "hidden" });
  let browserCloseJob;
  for (let n = 0; n < 200; n++) {
    browserCloseJob = probe("list").jobs.find((entry) => entry.name === "browser-close.bin");
    if (browserCloseJob && BigInt(browserCloseJob.durable_bytes) > 0n) break;
    await sleep(100);
  }
  assert.ok(browserCloseJob && BigInt(browserCloseJob.durable_bytes) > 0n, "IDG debe guardar bytes durables antes de cerrar Chromium");
  assert.equal((await popup.evaluate(async (url) => (await chrome.downloads.search({})).filter((item) => item.url === url).length, browserCloseUrl)), 0, "La descarga explícita es propiedad de IDG, no una descarga paralela de Chromium");
  assert.notEqual(browserCloseJob.state, "completed", "La prueba debe cerrar el navegador mientras IDG todavía transfiere");
  const browserCloseJobId = browserCloseJob.id;
  const runtimeBeforeBrowserClose = probe().runtime_id;
  await browser.close();
  browser = undefined;
  browserCdp = undefined;
  assert.equal(probe().runtime_id, runtimeBeforeBrowserClose, "Cerrar Chromium no debe cerrar el runtime IDG");
  let completedBrowserCloseJob;
  for (let n = 0; n < 600; n++) {
    completedBrowserCloseJob = probe("list").jobs.find((entry) => entry.id === browserCloseJobId);
    if (completedBrowserCloseJob?.state === "completed") break;
    await sleep(100);
  }
  assert.equal(completedBrowserCloseJob?.state, "completed", "La transferencia asumida debe continuar cuando Chromium se cierra");
  assert.equal(createHash("sha256").update(await readFile(path.join(files, "browser-close.bin"))).digest("hex"), expectedHash(fixture.size));
  assert.equal(probe("list").jobs.filter((entry) => entry.name === "browser-close.bin").length, 1);
  assert.equal((await readdir(files)).length, 5, "Solo deben existir las cinco descargas IDG aceptadas");
  console.log("PASS navegador: después de que IDG guardó bytes durables en una solicitud explícita, cerrar Chromium no detuvo el runtime; archivo autónomo y hash verificados.");
  console.log("PASS Chromium: pausa/reanudación, exclusiones, doble clic, host caído/reiniciado, worker terminado/reiniciado, navegador cerrado con bytes durables y hashes verificados.");
  void download;
} finally {
  await browser?.close();
  await browserCdp?.detach().catch(() => {});
  try { stopRuntime(); } catch { /* runtime absent */ }
  await webview?.close();
  if (desktop?.exitCode === null) desktop.kill();
  await new Promise((done) => linkPage.close(done));
  await fixture.close();
}
