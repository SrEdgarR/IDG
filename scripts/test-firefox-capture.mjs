import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { Builder, By, until } from "selenium-webdriver";
import firefox from "selenium-webdriver/firefox.js";
import { desktopHarness, sleep } from "./desktop-harness.mjs";
import { expectedHash, startSegments } from "../fixtures/http/segments.mjs";

const root = process.cwd();
const identity = JSON.parse(await readFile("apps/extension/development-identity.json", "utf8"));
const nativeManifestPath = execFileSync("powershell.exe", [
  "-NoLogo", "-NoProfile", "-NonInteractive", "-Command",
  "(Get-Item -LiteralPath 'HKCU:\\Software\\Mozilla\\NativeMessagingHosts\\io.github.sredgarr.idg.dev').GetValue('')",
], { encoding: "utf8", windowsHide: true }).trim();
const nativeManifest = JSON.parse(await readFile(nativeManifestPath, "utf8"));
assert.ok(nativeManifest.allowed_extensions?.includes(identity.firefox_id), "El host registrado debe permitir solo el ID estable de Firefox IDG.");
assert.ok(await readFile(nativeManifest.path).then(() => true, () => false), "El ejecutable del host registrado debe existir.");
const runtimeDirectory = path.dirname(path.resolve("target/debug/idg-runtime.exe"));
const hostRuntimeDirectory = path.dirname(path.resolve(nativeManifest.path));
if (runtimeDirectory.toLowerCase() !== hostRuntimeDirectory.toLowerCase()) {
  throw new Error("BLOQUEADA: el registro Native Messaging de Firefox pertenece a otro checkout. No se cambió el registro; ejecuta la prueba solo cuando host y runtime sean hermanos en esta copia.");
}

await mkdir("artifacts", { recursive: true });
const fixture = await startSegments({ size: 1024 * 1024, rate: 512 * 1024 });
let desktop;
let driver;
try {
  desktop = await desktopHarness();
  const options = new firefox.Options()
    .addArguments("-headless")
    .setBinary(process.env.IDG_FIREFOX_BINARY ?? path.join(process.env.ProgramFiles ?? "C:\\Program Files", "Mozilla Firefox", "firefox.exe"))
    .setPreference("extensions.webextensions.uuids", JSON.stringify({ [identity.firefox_id]: randomUUID() }));
  driver = await new Builder()
    .forBrowser("firefox")
    .setFirefoxOptions(options)
    .setFirefoxService(new firefox.ServiceBuilder().addArguments("--allow-system-access"))
    .build();
  // WebDriver loads this unpacked development addon into its own temporary profile.
  await driver.installAddon(path.join(root, "apps/extension/build/firefox"), true);
  await driver.setContext(firefox.Context.CHROME);
  const addonUuid = JSON.parse(await driver.executeScript("return Services.prefs.getStringPref('extensions.webextensions.uuids')"))[identity.firefox_id];
  await driver.setContext(firefox.Context.CONTENT);
  const popupUrl = `moz-extension://${addonUuid}/popup.html`;
  const openPopupPage = async () => {
    await driver.setContext(firefox.Context.CHROME);
    await driver.executeScript(
      "gBrowser.selectedBrowser.loadURI(Services.io.newURI(arguments[0]), {triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal()});",
      popupUrl,
    );
    await driver.setContext(firefox.Context.CONTENT);
  };
  const byId = (id) => driver.findElement(By.id(id));
  const waitForStatus = async (label) => driver.wait(until.elementTextIs(await driver.wait(until.elementLocated(By.id("status")), 10000), label), 15000);

  await openPopupPage();
  await waitForStatus("Conectado");
  assert.match(await driver.findElement(By.id("detail")).getText(), new RegExp(String(desktop.probe(["ping"]).process_id)));
  assert.match(await driver.findElement(By.css("body")).getText(), /AutoPick sigue siendo un requisito.*captura automática está deshabilitada/s);
  assert.match(await driver.findElement(By.css("body")).getText(), /sesiones autenticadas no se transfieren/i);

  const url = `${fixture.url}/firefox-phase08.bin`;
  await byId("direct-url").sendKeys(url);
  await byId("download-link").click();
  const dialog = desktop.page.getByRole("dialog", { name: "Nueva descarga", exact: true });
  await dialog.waitFor({ timeout: 15000 });
  assert.equal(await dialog.getByLabel("URL del archivo", { exact: true }).inputValue(), url);
  assert.equal(await dialog.getByLabel("Nombre del archivo", { exact: true }).inputValue(), "firefox-phase08.bin");
  await dialog.getByLabel("El enlace permite solicitudes repetidas").check();
  await dialog.getByRole("button", { name: "Aceptar en IDG", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });

  let job;
  for (let attempt = 0; attempt < 300; attempt++) {
    job = desktop.jobs().find((item) => item.name === "firefox-phase08.bin");
    if (job?.state === "completed") break;
    await sleep(100);
  }
  assert.equal(job?.state, "completed", "El runtime debe completar el trabajo aceptado desde Firefox.");
  const output = await readFile(path.join(desktop.files, "firefox-phase08.bin"));
  const hash = createHash("sha256").update(output).digest("hex");
  assert.equal(hash, expectedHash(fixture.size), "El archivo final debe coincidir con los bytes del fixture local.");
  assert.equal(desktop.jobs().filter((item) => item.name === "firefox-phase08.bin").length, 1, "Una acción explícita debe crear un solo trabajo.");
  await waitForStatus("Conectado");
  const version = (await driver.getCapabilities()).get("browserVersion");
  console.log(`Firefox ${version}: popup → Native Messaging → IDG/Tauri → HTTP local; 1 trabajo, ${output.length} bytes, SHA-256 ${hash}.`);
} finally {
  await driver?.quit().catch(() => {});
  await fixture.close();
  await desktop?.close();
}
