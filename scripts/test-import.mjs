import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { desktopHarness, sleep } from "./desktop-harness.mjs";
import { startSegments, expectedHash } from "../fixtures/http/segments.mjs";
const f = await startSegments({ size: 128 * 1024, rate: 512 * 1024 }),
  h = await desktopHarness();
try {
  await h.page
    .getByRole("button", { name: "Importar enlaces", exact: true })
    .click();
  const dialog = h.page.getByRole("dialog", {
    name: "Importar enlaces",
    exact: true,
  });
  // DOM drag into the real WebView; not a physical drag with the mouse.
  const dropText = `${f.url}/file\n${f.url}/file?fixture=drop`;
  const transfer = await h.page.evaluateHandle((text) => {
    const data = new DataTransfer();
    data.setData("text/plain", text);
    return data;
  }, dropText);
  await dialog
    .getByRole("textbox", { name: "Varias URLs o contenido CSV", exact: true })
    .dispatchEvent("drop", { dataTransfer: transfer });
  assert.equal(
    await dialog
      .getByRole("textbox", {
        name: "Varias URLs o contenido CSV",
        exact: true,
      })
      .inputValue(),
    dropText,
  );
  assert.equal(h.jobs().length, 0);
  assert.equal(f.records.length, 0);
  await dialog.getByLabel("Abrir TXT o CSV", { exact: true }).setInputFiles({
    name: "links.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      `url,nombre\n"${f.url}/file","a,uno.bin"\ninvalid,bad.bin\n${f.url}/file,b.bin\n`,
    ),
  });
  assert.equal(h.jobs().length, 0);
  assert.equal(f.records.length, 0);
  await dialog
    .getByRole("button", { name: "Previsualizar lote", exact: true })
    .click();
  await dialog.getByText("2 válidos · 1 inválidos", { exact: false }).waitFor();
  await dialog
    .getByLabel("URL de entrada 2", { exact: true })
    .fill(f.url + "/file");
  await dialog
    .getByRole("button", { name: "Previsualizar lote", exact: true })
    .click();
  await dialog.getByText("3 válidos · 0 inválidos", { exact: false }).waitFor();
  await dialog
    .getByRole("combobox", { name: "Al crear los trabajos", exact: true })
    .selectOption("queue");
  await dialog
    .getByRole("button", { name: "Crear trabajos revisados (2)", exact: true })
    .click();
  await dialog
    .getByText("2 creados · 0 sin confirmar", { exact: false })
    .waitFor();
  assert.equal(h.jobs().length, 2);
  assert.equal(f.records.length, 0);
  assert.ok(h.jobs().every((j) => j.state === "queued"));
  await dialog
    .getByRole("button", { name: "Crear trabajos revisados (2)", exact: true })
    .click();
  assert.equal(h.jobs().length, 2);
  await dialog.getByRole("button", { name: "Cerrar", exact: true }).click();
  await h.page.getByRole("button", { name: "En cola", exact: true }).click();
  await h.page
    .getByRole("button", { name: "Iniciar cola", exact: true })
    .click();
  for (const name of ["a,uno.bin", "b.bin"]) {
    await h.waitJob(name, (j) => j.state === "completed");
    assert.equal(
      createHash("sha256")
        .update(await readFile(path.join(h.files, name)))
        .digest("hex"),
      expectedHash(f.size),
    );
  }
  assert.ok(
    h.env.IDG_CLIPBOARD_FIXTURE,
    "Mandatory fixture adapter; no personal clipboard access",
  );
  await writeFile(h.env.IDG_CLIPBOARD_FIXTURE, f.url + "/file");
  await sleep(1200);
  assert.equal(
    (
      await h.command({
        library: { operation: { action: "clipboard_status" } },
      })
    ).count,
    0,
  );
  await h.page
    .getByRole("button", { name: "Configuración", exact: true })
    .click();
  const settings = h.page.getByRole("dialog", {
    name: "Configuración",
    exact: true,
  });
  await settings
    .getByRole("button", { name: "Privacidad", exact: true })
    .click();
  await settings
    .getByRole("checkbox", {
      name: "Monitorizar enlaces nuevos del portapapeles",
      exact: true,
    })
    .click();
  for (let i = 0; i < 50; i++) {
    if ((await h.org({ action: "get" })).state.library.clipboard) break;
    await sleep(100);
  }
  assert.equal((await h.org({ action: "get" })).state.library.clipboard, true);
  await sleep(1200);
  await writeFile(h.env.IDG_CLIPBOARD_FIXTURE, f.url + "/file?fixture=new");
  await settings
    .getByRole("button", { name: "Cerrar diálogo", exact: true })
    .click();
  await h.page
    .getByRole("button", {
      name: "Revisar enlaces del portapapeles",
      exact: true,
    })
    .click();
  await dialog.waitFor();
  assert.equal(h.jobs().length, 2);
  await dialog.getByRole("button", { name: "Cerrar", exact: true }).click();
  const state = (await h.org({ action: "get" })).state;
  await h.org({
    action: "set_library_settings",
    settings: { ...state.library, clipboard: false },
  });
  await writeFile(h.env.IDG_CLIPBOARD_FIXTURE, f.url + "/file?fixture=off");
  await sleep(1200);
  assert.equal(
    (
      await h.command({
        library: { operation: { action: "clipboard_status" } },
      })
    ).count,
    0,
  );
  console.log(
    "PASS importación Tauri: CSV sin GET, inválido corregido, excluido, duplicados visibles, alta idempotente en cola y hashes. Portapapeles de fixture: apagado, opt-in real, propuesta sin alta, desactivación.",
  );
} catch (error) {
  await writeFile(
    ".local/import-failure.txt",
    await h.page.locator("body").innerText(),
  ).catch(() => {});
  throw error;
} finally {
  await h.close();
  await f.close();
}
