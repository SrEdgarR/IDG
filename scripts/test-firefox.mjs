import { Builder, By, until } from "selenium-webdriver";
import firefox from "selenium-webdriver/firefox.js";
import { spawn, execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
const root = process.cwd();
const identity = JSON.parse(
  await readFile("apps/extension/development-identity.json", "utf8"),
);
const nativeManifestPath = execFileSync("powershell.exe", [
  "-NoLogo", "-NoProfile", "-NonInteractive", "-Command",
  "(Get-Item -LiteralPath 'HKCU:\\Software\\Mozilla\\NativeMessagingHosts\\io.github.sredgarr.idg.dev').GetValue('')",
], { encoding: "utf8", windowsHide: true }).trim();
const nativeManifest = JSON.parse(await readFile(nativeManifestPath, "utf8"));
assert.ok(nativeManifest.allowed_extensions?.includes(identity.firefox_id), "El host registrado debe permitir el ID estable de Firefox IDG.");
const runtimeDirectory = path.dirname(path.resolve("target/debug/idg-runtime.exe"));
const hostRuntimeDirectory = path.dirname(path.resolve(nativeManifest.path));
if (runtimeDirectory.toLowerCase() !== hostRuntimeDirectory.toLowerCase()) {
  throw new Error("BLOQUEADA: el registro Native Messaging de Firefox pertenece a otro checkout. No se cambió el registro; ejecuta la prueba solo cuando host y runtime sean hermanos en esta copia.");
}
const uuid = randomUUID();
const probe = path.join(root, "target/debug/idg-probe.exe");
const exe = path.join(root, "target/debug/idg-runtime.exe");
const ping = () =>
  JSON.parse(
    execFileSync(probe, ["ping"], {
      encoding: "utf8",
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
    }),
  );
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let existing;
try {
  existing = ping();
} catch {}
if (existing) throw new Error("Detén el runtime antes de esta prueba aislada.");
await mkdir("artifacts", { recursive: true });
const runtimeOptions={windowsHide:true,stdio:"ignore",env:{...process.env,IDG_DATA_DIR:path.join(root,".local",`firefox-state-${uuid}`)}};
let runtime = spawn(exe, [], runtimeOptions);
let driver;
try {
  for (let i = 0; i < 40; i++) {
    try {
      ping();
      break;
    } catch {
      await sleep(100);
    }
  }
  const initial = ping();
  const options = new firefox.Options()
    .addArguments("-headless")
    .setBinary(
      process.env.IDG_FIREFOX_BINARY ??
        "C:\\Program Files\\Mozilla Firefox\\firefox.exe",
    )
    .setPreference(
      "extensions.webextensions.uuids",
      JSON.stringify({ [identity.firefox_id]: uuid }),
    );
  driver = await new Builder()
    .forBrowser("firefox")
    .setFirefoxOptions(options)
    .setFirefoxService(
      new firefox.ServiceBuilder().addArguments("--allow-system-access"),
    )
    .build();
  // WebDriver installs an unsigned development addon temporarily; no signature policy is disabled.
  await driver.installAddon(
    path.join(root, "apps/extension/build/firefox"),
    true,
  );
  const url = `moz-extension://${uuid}/popup.html`;
  const openExtension = async () => {
    await driver.setContext(firefox.Context.CHROME);
    await driver.executeScript(
      "gBrowser.selectedBrowser.loadURI(Services.io.newURI(arguments[0]), {triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal()});",
      url,
    );
    await driver.setContext(firefox.Context.CONTENT);
  };
  const state = async (text) =>
    driver.wait(
      until.elementTextIs(
        await driver.wait(until.elementLocated(By.id("status")), 10000),
        text,
      ),
      10000,
    );
  await openExtension();
  await state("Conectado");
  assert.ok(
    (await driver.findElement(By.id("detail")).getText()).includes(
      String(initial.process_id),
    ),
  );
  await writeFile(
    "artifacts/firefox-connected.png",
    await driver.takeScreenshot(),
    "base64",
  );
  await driver.get("about:blank");
  assert.equal(ping().runtime_id, initial.runtime_id);
  await openExtension();
  await state("Conectado");
  execFileSync(probe, ["shutdown"], { windowsHide: true });
  await state("Desconectado");
  await new Promise((r) =>
    runtime.exitCode !== null ? r() : runtime.once("exit", r),
  );
  runtime = spawn(exe, [], runtimeOptions);
  for (let i = 0; i < 40; i++) {
    try {
      ping();
      break;
    } catch {
      await sleep(100);
    }
  }
  await driver.findElement(By.id("reconnect")).click();
  await state("Conectado");
  assert.notEqual(ping().runtime_id, initial.runtime_id);
  const capabilities = await driver.getCapabilities();
  console.log("Firefox version:", capabilities.get("browserVersion"));
  await driver.quit();
  driver = undefined;
  assert.ok(ping().process_id);
  console.log(
    "PASS Firefox: extensión temporal real → host → pipe → runtime; reapertura, desconexión, reconexión y cierre conserva runtime.",
  );
} finally {
  await driver?.quit();
  try {
    execFileSync(probe, ["shutdown"], { windowsHide: true, stdio: "ignore" });
  } catch {
    runtime.kill();
  }
}
