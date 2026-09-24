import assert from "node:assert/strict";
import { stat, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { desktopHarness, sleep } from "./desktop-harness.mjs";
import { startSegments } from "../fixtures/http/segments.mjs";
const f = await startSegments({ size: 128 * 1024, rate: 512 * 1024 }),
  h = await desktopHarness();
const library = (operation, id) => h.command({ library: { operation } }, id);
try {
  await h.add("Árbol [1].bin", f.url + "/file", "Descargar ahora");
  const first = await h.waitJob(
    "Árbol [1].bin",
    (j) => j.state === "completed",
  );
  await sleep(1200);
  assert.equal((await h.org({ action: "get" })).state.statistics.completed, 0);
  let state = (await h.org({ action: "get" })).state;
  await h.org({
    action: "set_library_settings",
    settings: { ...state.library, statistics: true },
  });
  await h.add("second.bin", f.url + "/file", "Descargar después");
  const second = h.jobs().find((j) => j.name === "second.bin");
  const bulkId = crypto.randomUUID();
  const result = await library(
    {
      action: "bulk",
      ids: [first.id, second.id, "missing"],
      operation: { kind: "resume" },
    },
    bulkId,
  );
  assert.deepEqual(
    result.items.map((x) => x.outcome),
    ["skipped", "accepted", "failed"],
  );
  await h.waitJob("second.bin", (j) => j.state === "completed");
  assert.deepEqual(
    await library(
      {
        action: "bulk",
        ids: [first.id, second.id, "missing"],
        operation: { kind: "resume" },
      },
      bulkId,
    ),
    result,
    "IPC replay uses durable receipt",
  );
  await sleep(1200);
  assert.equal((await h.org({ action: "get" })).state.statistics.completed, 1);
  const measured = (await h.org({ action: "get" })).state.statistics;
  assert.equal(measured.bytes, String(f.size));
  assert.equal(measured.sites.length, 1);
  assert.equal(measured.sites[0].domain, "127.0.0.1");
  assert.equal(measured.sites[0].completed, 1);
  // A sub-second fixture can legitimately finish in the same wall-clock second.
  assert.equal(
    measured.timed_bytes,
    BigInt(measured.cycle_seconds) > 0n ? String(f.size) : "0",
  );
  const privateId = crypto.randomUUID();
  await h.command(
    {
      create_download: {
        draft: {
          input: {
            url: f.url + "/file",
            directory: h.files,
            name: "private.bin",
            expected_sha256: null,
            conflict: "reject",
          },
          options: {
            mode: "automatic",
            replay_safe: false,
            bytes_per_second: null,
            priority: "normal",
          },
          start: "now",
          category: "Otros",
          private: true,
        },
      },
    },
    privateId,
  );
  await h.waitJob("private.bin", (j) => j.state === "completed");
  await sleep(1200);
  assert.equal(
    (await h.org({ action: "get" })).state.statistics.completed,
    1,
    "Private excluded",
  );
  await h.page
    .getByRole("searchbox", { name: "Buscar descargas", exact: true })
    .fill("ÁRBOL [1]");
  await h.page
    .getByRole("checkbox", { name: "Seleccionar Árbol [1].bin", exact: true })
    .check();
  await h.page.getByText("Organizar selección", { exact: true }).click();
  await h.page
    .getByRole("button", { name: "Quitar del historial", exact: true })
    .click();
  for (let i = 0; i < 50; i++) {
    if (
      (await library({ action: "search", query: { text: "Árbol" } })).total ===
      0
    )
      break;
    await sleep(100);
  }
  assert.equal(
    (await library({ action: "search", query: { text: "Árbol" } })).total,
    0,
  );
  await stat(path.join(h.files, "Árbol [1].bin"));
  const restored = await library({
    action: "bulk",
    ids: [first.id],
    operation: { kind: "restore" },
  });
  assert.equal(restored.items[0].outcome, "accepted");
  assert.equal(
    (await library({ action: "search", query: { text: "Árbol" } })).total,
    1,
  );
  await h.org({ action: "clear_statistics" });
  await sleep(1200);
  assert.equal(
    (await h.org({ action: "get" })).state.statistics.completed,
    0,
    "Cleared totals do not reappear",
  );
  // Altered content is never deleted just because the path and original hash match the job.
  const preview = await library({
    action: "preview_delete",
    job_id: second.id,
  });
  const original = await readFile(path.join(h.files, "second.bin"));
  await writeFile(
    path.join(h.files, "second.bin"),
    Buffer.alloc(original.length, 7),
  );
  assert.equal(h.env.IDG_POWER_ADAPTER, "simulate");
  await h.org({ action: "arm_power", id: "main", power: "shutdown" });
  let countdown;
  for (let i = 0; i < 40; i++) {
    countdown = (await h.org({ action: "get" })).state.power_remaining;
    if (countdown !== null) break;
    await sleep(100);
  }
  assert.notEqual(
    countdown,
    null,
    "Only the simulated adapter can be armed by this test",
  );
  const refused = await library({
    action: "delete_file",
    job_id: second.id,
    path: preview.path,
    sha256: preview.sha256,
  });
  assert.equal(refused.items[0].outcome, "failed");
  assert.equal(
    (await h.org({ action: "get" })).state.power_remaining,
    null,
    "An explicit file operation consumes/cancels pending power even when verification refuses deletion",
  );
  await stat(path.join(h.files, "second.bin"));
  await writeFile(path.join(h.files, "second.bin"), original);
  const removed = await library({
    action: "delete_file",
    job_id: second.id,
    path: preview.path,
    sha256: preview.sha256,
  });
  assert.equal(removed.items[0].outcome, "accepted");
  await assert.rejects(stat(path.join(h.files, "second.bin")));
  assert.ok(
    h.jobs().some((j) => j.id === second.id),
    "History preserved after disk delete",
  );
  await h.page
    .getByRole("searchbox", { name: "Buscar descargas", exact: true })
    .fill("private.bin");
  await h.page.locator('summary[aria-label="Acciones de private.bin"]').click();
  await h.page
    .getByRole("button", { name: "Eliminar del disco…", exact: true })
    .click();
  const deletion = h.page.getByRole("dialog", {
    name: "Eliminar archivo del disco",
    exact: true,
  });
  await deletion
    .getByRole("checkbox", {
      name: "Confirmo eliminar este archivo sin posibilidad de deshacer",
      exact: true,
    })
    .check();
  await deletion
    .getByRole("button", {
      name: "Eliminar definitivamente el archivo enumerado",
      exact: true,
    })
    .click();
  await deletion
    .getByText("Archivo eliminado del disco.", { exact: false })
    .waitFor();
  await assert.rejects(stat(path.join(h.files, "private.bin")));
  console.log(
    "PASS biblioteca Tauri/IPC: búsqueda Unicode, selección estable, ocultar/restaurar sin borrar, lote parcial y replay, estadísticas opt-in/privadas/borrado, archivo cambiado preservado y eliminación explícita verificada solo de fixture.",
  );
} finally {
  await h.close();
  await f.close();
}
