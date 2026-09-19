import { spawn, execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
const root = process.cwd();
process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.join(root, "tools/browsers");
const { chromium } = await import("playwright");
const identity = JSON.parse(
  await readFile("apps/extension/development-identity.json", "utf8"),
);
const probe = path.join(root, "target/debug/idg-probe.exe");
const exe = path.join(root, "target/debug/idg-runtime.exe");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
const profile = await mkdtemp(path.join(root, ".local/chromium-"));
let runtime = spawn(exe, [], { windowsHide: true, stdio: "ignore" });
let context;
try {
  for (let i = 0; i < 40; i++) {
    try {
      ping();
      break;
    } catch {
      await sleep(100);
    }
  }
  const original = ping();
  const extension = path.join(root, "apps/extension/build/chromium");
  context = await chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: true,
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
    ],
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`chrome-extension://${identity.chromium_id}/popup.html`);
  if (process.env.IDG_EXPECT_HOST_ABSENT === "1") {
    await page
      .locator("#status")
      .filter({ hasText: /^Desconectado$/ })
      .waitFor();
    assert.equal(ping().runtime_id, original.runtime_id);
    console.log("PASS Chromium: host no registrado muestra Desconectado.");
  } else {
    await page
      .locator("#status")
      .filter({ hasText: /^Conectado$/ })
      .waitFor();
    await page.screenshot({
      animations: "disabled",
      path: "artifacts/chromium-connected.png",
    });
    await mkdir("artifacts/ui-02", { recursive: true });
    await page.setViewportSize({ width: 360, height: 700 });
    for (const colorScheme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme });
      await page.screenshot({
        animations: "disabled",
        path: `artifacts/ui-02/popup-${colorScheme}.png`,
      });
    }
    assert.ok(
      (await page.locator("#detail").innerText()).includes(
        String(original.process_id),
      ),
    );
    await page.close();
    assert.equal(ping().runtime_id, original.runtime_id);
    const reopened = await context.newPage();
    await reopened.goto(
      `chrome-extension://${identity.chromium_id}/popup.html`,
    );
    await reopened
      .locator("#status")
      .filter({ hasText: /^Conectado$/ })
      .waitFor();
    execFileSync(probe, ["shutdown"], { windowsHide: true });
    await reopened
      .locator("#status")
      .filter({ hasText: /^Desconectado$/ })
      .waitFor();
    await new Promise((r) =>
      runtime.exitCode !== null ? r() : runtime.once("exit", r),
    );
    runtime = spawn(exe, [], { windowsHide: true, stdio: "ignore" });
    for (let i = 0; i < 40; i++) {
      try {
        ping();
        break;
      } catch {
        await sleep(100);
      }
    }
    await reopened.getByRole("button", { name: "Reconectar" }).click();
    await reopened
      .locator("#status")
      .filter({ hasText: /^Conectado$/ })
      .waitFor();
    assert.notEqual(ping().runtime_id, original.runtime_id);
    await context.close();
    context = undefined;
    assert.ok(ping().process_id);
    assert.deepEqual(errors, []);
    console.log(
      "PASS Chromium: extensión real → host → pipe → runtime; cierre/reapertura, desconexión, reconexión y cierre del navegador conserva runtime.",
    );
  }
} finally {
  await context?.close();
  try {
    execFileSync(probe, ["shutdown"], { windowsHide: true, stdio: "ignore" });
  } catch {
    runtime.kill();
  }
}
