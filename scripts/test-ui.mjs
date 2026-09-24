import { spawn } from "node:child_process";
import { mkdir, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import assert from "node:assert/strict";
const root = process.cwd();
process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.join(root, "tools/browsers");
const { chromium } = await import("playwright");
const socket = net.createServer();
await new Promise((r) => socket.listen(0, "127.0.0.1", r));
const port = socket.address().port;
await new Promise((r) => socket.close(r));
const server = spawn(
  process.execPath,
  [
    path.join(root, "apps/desktop/node_modules/vite/bin/vite.js"),
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--strictPort",
  ],
  { cwd: path.join(root, "apps/desktop"), windowsHide: true, stdio: "ignore" },
);
const base = `http://127.0.0.1:${port}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let browser;
const errors = [];
let screenshots = 0;
try {
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {}
    await sleep(100);
  }
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1180, height: 1100 },
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/gallery.html");
  await page
    .getByRole("heading", { name: "Todas las descargas", exact: true })
    .waitFor();
  assert.equal(await page.locator(".row-title[aria-expanded=true]").count(), 3);
  await page.locator(".row-title").first().click();
  await page.setViewportSize({ width: 720, height: 640 });
  await page.waitForFunction(
    () =>
      document.querySelectorAll(".row-title[aria-expanded=true]").length === 0,
  );
  assert.equal(await page.locator(".row-title[aria-expanded=true]").count(), 0);
  assert.equal(
    await page
      .locator(".row-title")
      .first()
      .evaluate((n) => n === document.activeElement),
    true,
  );
  await page.setViewportSize({ width: 1180, height: 1100 });
  await page.waitForFunction(
    () =>
      document.querySelectorAll(".row-title[aria-expanded=true]").length === 2,
  );
  assert.equal(await page.locator(".row-title[aria-expanded=true]").count(), 2);
  assert.equal(
    await page.locator(".row-title").first().getAttribute("aria-expanded"),
    "false",
  );
  await page.getByLabel("Cantidad de muestras").selectOption("20");
  assert.equal(await page.locator(".row-title[aria-expanded=true]").count(), 0);
  const first = page.locator(".download-row").first();
  await first.getByRole("checkbox").check();
  assert.equal(
    await first.locator(".row-title").getAttribute("aria-expanded"),
    "false",
  );
  await first.locator(".row-title").click();
  assert.equal(
    await first.locator(".row-title").getAttribute("aria-expanded"),
    "true",
  );
  const before = await page.locator("main").evaluate((n) => n.scrollTop);
  await page
    .getByRole("button", { name: "Actualizar muestra", exact: true })
    .click();
  assert.equal(
    await first.locator(".row-title").getAttribute("aria-expanded"),
    "true",
  );
  assert.equal(await first.getByRole("checkbox").isChecked(), true);
  assert.equal(await page.locator("main").evaluate((n) => n.scrollTop), before);
  // An external sample update must preserve focus and a nonzero scroll position.
  await first.locator(".row-title").focus();
  await page.locator("main").evaluate((n) => {
    n.scrollTop = 300;
  });
  const scrolled = await page.locator("main").evaluate((n) => n.scrollTop);
  assert.ok(scrolled > 0);
  await page
    .getByRole("button", { name: "Actualizar muestra", exact: true })
    .evaluate((n) => n.click());
  assert.equal(
    await first
      .locator(".row-title")
      .evaluate((n) => n === document.activeElement),
    true,
  );
  assert.equal(
    await page.locator("main").evaluate((n) => n.scrollTop),
    scrolled,
  );
  await page.keyboard.press("Control+f");
  assert.equal(
    await page
      .getByLabel("Buscar descargas", { exact: true })
      .evaluate((n) => n === document.activeElement),
    true,
  );
  await page.getByLabel("Buscar descargas", { exact: true }).fill("no existe");
  await page.getByRole("heading", { name: "No hay resultados" }).waitFor();
  assert.match(
    await page.locator(".selection-toolbar").innerText(),
    /1 seleccionados/,
  );
  await page.getByRole("button", { name: "Limpiar filtros" }).click();
  assert.equal(await first.getByRole("checkbox").isChecked(), true);
  await page.getByRole("button", { name: "Documentos", exact: true }).click();
  assert.equal(await page.locator(".download-row").count(), 4);
  await page.getByRole("button", { name: "Limpiar filtros" }).click();
  await page.locator(".filters>summary").click();
  await page.getByLabel("Tamaño", { exact: true }).selectOption("unknown");
  assert.equal(await page.locator(".download-row").count(), 1);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Conflicto", exact: true }).click();
  await page.getByLabel("Sobrescribir", { exact: true }).check();
  await page
    .getByRole("alert")
    .filter({ hasText: "Se requiere confirmar" })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Confirmar sobrescritura" })
      .isDisabled(),
    true,
  );
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Reglas", exact: true }).click();
  await page
    .getByRole("button", { name: "Previsualizar", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Coincide: se propondría Documentos" })
    .waitFor();
  await page.getByLabel("Extensión del archivo").fill("zip");
  await page
    .getByRole("button", { name: "Previsualizar", exact: true })
    .click();
  await page.getByRole("status").filter({ hasText: "No coincide" }).waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Colas", exact: true }).click();
  await page.getByRole("button", { name: "Subir Video de ejemplo" }).click();
  assert.match(
    await page.locator(".queue-item").first().innerText(),
    /Video de ejemplo/,
  );
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Multimedia", exact: true }).click();
  await page.getByRole("button", { name: "Descargar", exact: true }).click();
  await page
    .getByRole("dialog", {
      name: "Medios del reproductor · muestra",
      exact: true,
    })
    .waitFor();
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("dialog[open]").count(), 1);
  await page
    .getByRole("button", { name: "Ocultar botón multimedia", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Mostrar botón multimedia" })
    .waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Limpiar filtros" }).click();
  await first.locator(".row-menu>summary").click();
  assert.equal(
    await first.locator(".row-title").getAttribute("aria-expanded"),
    "true",
  );
  await page.keyboard.press("Escape");
  assert.equal(await first.locator(".row-menu").getAttribute("open"), null);
  await page
    .getByRole("button", { name: "Nueva descarga", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Nueva descarga",
    exact: true,
  });
  await dialog
    .getByLabel("Nombre del archivo", { exact: true })
    .fill("CON.txt");
  await dialog
    .getByLabel("URL del archivo", { exact: true })
    .fill("javascript:alert(1)");
  await dialog.getByRole("button", { name: "Validar datos" }).click();
  assert.equal(await dialog.locator("[aria-invalid=true]").count(), 2);
  await dialog
    .getByLabel("Nombre del archivo", { exact: true })
    .fill("Manual.pdf");
  await dialog
    .getByLabel("URL del archivo", { exact: true })
    .fill("https://example.org/manual.pdf");
  await dialog.getByRole("button", { name: "Validar datos" }).click();
  await dialog.getByText("Formato válido.", { exact: false }).waitFor();
  assert.equal(
    await dialog
      .getByRole("button", { name: "Descargar ahora", exact: true })
      .isDisabled(),
    true,
  );
  for (let i = 0; i < 18; i++) {
    await page.keyboard.press("Tab");
    assert.equal(
      await page.evaluate(() => !!document.activeElement?.closest("dialog")),
      true,
    );
  }
  await page.keyboard.press("Escape");
  assert.equal(
    await page
      .getByRole("button", { name: "Nueva descarga", exact: true })
      .evaluate((n) => n === document.activeElement),
    true,
  );
  await page.getByRole("button", { name: "Asistente", exact: true }).click();
  await page.getByRole("button", { name: "Siguiente", exact: true }).click();
  await page.getByLabel("Organizar por tipo").check();
  await page.getByRole("button", { name: "Siguiente", exact: true }).click();
  await page.getByRole("button", { name: "Omitir navegador" }).click();
  await page
    .getByLabel("AutoPick", { exact: true })
    .selectOption("Usar el navegador");
  await page.getByRole("button", { name: "Atrás", exact: true }).click();
  await page.getByRole("button", { name: "Siguiente", exact: true }).click();
  assert.equal(
    await page.getByLabel("AutoPick", { exact: true }).inputValue(),
    "Usar el navegador",
  );
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Configuración", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Tema", { exact: true })
    .selectOption("system");
  await page.emulateMedia({ colorScheme: "dark" });
  assert.equal(
    await page.evaluate(() => getComputedStyle(document.body).backgroundColor),
    "rgb(25, 27, 37)",
  );
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  assert.equal(
    await page.evaluate(() => getComputedStyle(document.body).backgroundColor),
    "rgb(245, 245, 249)",
  );
  assert.equal(
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Cerrar", exact: true })
      .evaluate((n) => getComputedStyle(n).transitionDuration),
    "0s",
  );
  await page.keyboard.press("Escape");
  await mkdir("artifacts/ui-02", { recursive: true });
  await page
    .getByLabel("Vista de filas", { exact: true })
    .selectOption("Compacta");
  await page.reload();
  assert.equal(
    await page.getByLabel("Vista de filas", { exact: true }).inputValue(),
    "Compacta",
  );
  await page
    .getByLabel("Vista de filas", { exact: true })
    .selectOption("Automática");
  for (const theme of ["light", "dark"])
    for (const [size, width, height] of [
      ["normal", 1180, 900],
      ["small", 720, 640],
      ["phone", 320, 640],
    ])
      for (const count of [0, 1, 3, 20]) {
        await page.setViewportSize({ width, height });
        await page.goto(base + "/gallery.html");
        if (width <= 760)
          await page
            .getByRole("button", { name: "Mostrar navegación" })
            .click();
        await page.getByLabel("Tema", { exact: true }).selectOption(theme);
        if (width <= 760) await page.locator(".mobile-nav-close").click();
        await page
          .getByLabel("Cantidad de muestras")
          .selectOption(String(count));
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          `Overflow ${theme}/${size}/${count}`,
        );
        assert.ok(
          await page
            .locator("main")
            .evaluate((n) => n.scrollWidth <= n.clientWidth + 1),
          `Main overflow ${theme}/${size}/${count}`,
        );
        if (size === "phone") {
          const trigger = page.locator(".toolbar > button:first-child");
          await trigger.click();
          assert.equal(await trigger.getAttribute("aria-expanded"), "true");
          assert.equal(
            await page
              .getByRole("button", { name: "Documentos", exact: true })
              .isVisible(),
            true,
          );
          await page.keyboard.press("Escape");
          assert.equal(await trigger.getAttribute("aria-expanded"), "false");
        }
        await page.screenshot({
          path: `artifacts/ui-02/gallery-${theme}-${size}-${count}.png`,
        });
        screenshots++;
        if (size === "phone" && count === 3) {
          const trigger = page.locator(".toolbar > button:first-child");
          await trigger.click();
          await page.getByRole("button", { name: "Documentos", exact: true }).click();
          assert.equal(await trigger.getAttribute("aria-expanded"), "false");
          assert.equal(
            await trigger.evaluate((node) => node === document.activeElement),
            true,
          );
        }
      }
  await page.setViewportSize({ width: 1180, height: 900 });
  await page.getByLabel("Tema", { exact: true }).selectOption("light");
  for (const name of [
    "Nueva descarga",
    "Configuración",
    "Conflicto",
    "Asistente",
    "Colas",
    "Reglas",
    "Multimedia",
    "Avisos",
    "Opcionales",
  ]) {
    await page.getByRole("button", { name, exact: true }).click();
    await page.getByRole("dialog").waitFor();
    await page.screenshot({
      path: `artifacts/ui-02/surface-${name.replaceAll(" ", "-")}.png`,
    });
    screenshots++;
    await page.keyboard.press("Escape");
  }
  for (const scale of [1.5, 2]) {
    const c = await browser.newContext({
      viewport: { width: 1024, height: 640 },
      deviceScaleFactor: scale,
    });
    const p = await c.newPage();
    await p.goto(base + "/gallery.html");
    await p.getByLabel("Cantidad de muestras").selectOption("20");
    await p.screenshot({ path: `artifacts/ui-02/gallery-dpr-${scale}.png` });
    screenshots++;
    assert.ok(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await c.close();
  }
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto(base + "/gallery.html");
  for (const name of ["Nueva descarga", "Configuración", "Colas", "Reglas"]) {
    if (name === "Configuración")
      await page.getByRole("button", { name: "Mostrar navegación" }).click();
    await page.getByRole("button", { name, exact: true }).click();
    const modal = page.getByRole("dialog");
    await modal.waitFor();
    assert.ok(
      await modal.evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
      `Dialog overflow at 320px: ${name}`,
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `Document overflow with dialog at 320px: ${name}`,
    );
    await page.screenshot({
      path: `artifacts/ui-02/phone-${name.replaceAll(" ", "-")}.png`,
    });
    screenshots++;
    await page.keyboard.press("Escape");
  }
  const popupHtml = await readFile(
    path.join(root, "apps/extension/src/popup.html"),
    "utf8",
  );
  const popupTokens = await readFile(
    path.join(root, "packages/ui/tokens.css"),
    "utf8",
  );
  const popupStyles = await readFile(
    path.join(root, "apps/extension/src/popup.css"),
    "utf8",
  );
  const visualPopup = popupHtml
    .replace(
      '<link rel="stylesheet" href="tokens.css" />',
      `<style>${popupTokens}</style>`,
    )
    .replace(
      '<link rel="stylesheet" href="popup.css" />',
      `<style>${popupStyles}</style>`,
    )
    .replace('<script src="popup.js"></script>', "");
  for (const width of [280, 360]) {
    const popup = await context.newPage();
    await popup.setViewportSize({ width, height: 700 });
    await popup.setContent(visualPopup);
    assert.ok(
      await popup.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `Extension popup overflow at ${width}px`,
    );
    await popup.screenshot({ path: `artifacts/ui-02/popup-${width}.png` });
    screenshots++;
    await popup.close();
  }
  // Production bundle must not ship the independent gallery entry or sample records.
  for (const [kind, title, field] of [
    ["new", "Nueva descarga", "Carpeta"],
    ["import", "Importar enlaces", "Carpeta del lote"],
  ]) {
    await page.evaluate(async (kind) => {
      const { openFocusFixture } =
        await import("/src/gallery/PreferencesFixture.tsx");
      window.__idgFocusFixture = openFocusFixture(kind);
    }, kind);
    const dialog = page.getByRole("dialog", { name: title, exact: true });
    assert.ok(
      await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
      `Dialog overflow at 320px: ${title}`,
    );
    const directory = dialog.getByRole("textbox", { name: field, exact: true });
    await directory.focus();
    assert.equal(await directory.inputValue(), "");
    await page.evaluate(async () => {
      window.__idgFocusFixture.release();
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
    });
    assert.equal(
      await directory.inputValue(),
      "",
      "Late preferences must not alter a focused directory before its first input event",
    );
    await directory.fill("C:\\explicit-fixture");
    assert.equal(await directory.inputValue(), "C:\\explicit-fixture");
    await page.evaluate(() => window.__idgFocusFixture.close());
  }
  const dist = path.join(root, "apps/desktop/dist");
  assert.equal((await readdir(dist)).includes("gallery.html"), false);
  for (const file of await readdir(path.join(dist, "assets"))) {
    if (file.endsWith(".js"))
      assert.doesNotMatch(
        await readFile(path.join(dist, "assets", file), "utf8"),
        /GALLERY_ONLY_FIXTURE|IDG_PREFERENCES_TEST_FIXTURE|Paisajes del altiplano|sample-0/,
      );
  }
  assert.deepEqual(errors, []);
  console.log(
    `PASS UI: navegación, filtros, selección, menús, validaciones, foco/Tab/Escape, expansión estable, temas/sistema/movimiento reducido, aislamiento producción; ${screenshots} capturas reales, DPR 1.5/2 emulado.`,
  );
} finally {
  await browser?.close();
  server.kill();
}
