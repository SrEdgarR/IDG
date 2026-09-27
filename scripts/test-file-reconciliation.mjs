import assert from "node:assert/strict";
import { mkdir, readFile, rename } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import os from "node:os";
import { desktopHarness } from "./desktop-harness.mjs";
import { expectedHash, startSegments } from "../fixtures/http/segments.mjs";

const fixture = await startSegments({ size: 128 * 1024, rate: 512 * 1024 });
const app = await desktopHarness({ tempRoot: os.tmpdir() });
const library = (operation) => app.command({ library: { operation } });

try {
  const name = "phase12-reconcile.bin";
  await app.add(name, fixture.url + "/file", "Descargar ahora");
  const job = await app.waitJob(name, (item) => item.state === "completed");

  const movedDirectory = path.join(app.dir, "relocated");
  await mkdir(movedDirectory);
  const movedFile = path.join(movedDirectory, "relinked.bin");
  await rename(path.join(app.files, name), movedFile);
  const missing = await app.command({ get_download: { job_id: job.id } });
  assert.equal(missing.kind, "download");
  assert.equal(missing.job.file_presence, "missing");
  const rowTitle = app.page.locator(".row-title").filter({ hasText: name });
  if ((await rowTitle.getAttribute("aria-expanded")) !== "true") {
    await rowTitle.click();
  }
  await app.page.getByText(/No encontrado en su ubicación/).waitFor();
  await app.page.locator(`summary[aria-label="Acciones de ${name}"]`).click();
  const locateButton = app.page.getByRole("button", {
    name: "Localizar archivo",
    exact: true,
  });
  await locateButton.waitFor();
  assert.equal(await locateButton.isEnabled(), true);

  // The native file picker is not automated in this environment. Exercise the
  // same typed IPC operation with a fixture path owned by this isolated test.
  const located = await library({
    action: "locate_file",
    job_id: job.id,
    path: movedFile,
  });
  assert.equal(located.kind, "download");
  assert.equal(located.job.file_presence, "available");
  assert.equal(located.job.id, job.id);
  assert.equal(
    app.jobs().filter((item) => item.id === job.id).length,
    1,
    "locating updates an existing association, without a second job",
  );
  await app.restart();
  const restored = await app.command({ get_download: { job_id: job.id } });
  assert.equal(restored.kind, "download");
  assert.equal(restored.job.file_presence, "available");
  assert.equal(app.jobs().filter((item) => item.id === job.id).length, 1);

  const bytes = await readFile(movedFile);
  assert.equal(bytes.length, fixture.size);
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    expectedHash(fixture.size),
  );
  const security = await library({
    action: "inspect_file_security",
    job_id: job.id,
  });
  assert.equal(security.kind, "file_security");
  assert.equal(security.info.status, "not_applicable");
  assert.ok([true, false, null].includes(security.info.mark_of_web_present));

  await app.page.getByRole("button", { name: "Configuración" }).click();
  const settings = app.page.getByRole("dialog", { name: "Configuración" });
  await settings.getByRole("button", { name: "Privacidad" }).click();
  await settings
    .getByRole("button", { name: "Eliminar metadatos terminados" })
    .waitFor();
  await settings.getByRole("checkbox", { name: /Confirmo quitar/ }).check();
  await settings
    .getByRole("button", { name: "Eliminar metadatos terminados" })
    .click();
  await settings.getByText(/Se quitaron 1 registro terminado/).waitFor();
  assert.equal(
    app.jobs().some((item) => item.id === job.id),
    false,
  );
  await rowTitle.waitFor({ state: "detached" });
  assert.equal(
    createHash("sha256")
      .update(await readFile(movedFile))
      .digest("hex"),
    expectedHash(fixture.size),
  );
  await settings.getByRole("button", { name: "Cerrar", exact: true }).click();
  await app.restart();
  assert.equal(
    app.jobs().some((item) => item.id === job.id),
    false,
  );
  assert.equal((await readFile(movedFile)).length, fixture.size);
  console.log(
    `PASS Tauri/WebView2 → runtime HTTP local → mover → watcher → LocateFile/hash → limpieza de metadatos sin borrar el archivo. Mark of the Web observado: ${security.info.mark_of_web_present ?? "desconocido"}.`,
  );
} finally {
  await app.close();
  await fixture.close();
}
