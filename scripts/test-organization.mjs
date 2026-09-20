import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { desktopHarness, sleep } from "./desktop-harness.mjs";
import { startSegments, expectedHash } from "../fixtures/http/segments.mjs";
const fixture = await startSegments({ size: 1024 * 1024, rate: 256 * 1024 });
const h = await desktopHarness();
try {
  await h.page.getByRole("button", { name: "En cola", exact: true }).click();
  await h.page
    .getByRole("button", { name: "Gestionar colas", exact: true })
    .click();
  const editor = h.page.getByRole("dialog", { name: "Colas y programación" });
  await editor
    .getByLabel("Nombre de la cola", { exact: true })
    .fill("Documentos de prueba");
  await editor.getByLabel("Simultáneas", { exact: true }).fill("1");
  await editor
    .getByRole("button", { name: "Guardar cola", exact: true })
    .click();
  let config;
  for (let i = 0; i < 50; i++) {
    config = (await h.org({ action: "get" })).state;
    if (config.queues.length === 2) break;
    await sleep(100);
  }
  assert.equal(config.queues.length, 2);
  const q = config.queues.find((q) => q.id !== "main");
  await editor.getByRole("button", { name: "Cerrar", exact: true }).click();
  await h.add("a.bin", fixture.url + "/file", "Añadir a cola", q.id);
  await h.add("b.bin", fixture.url + "/file", "Añadir a cola", q.id);
  await h.add("later.bin", fixture.url + "/file", "Descargar después", q.id);
  assert.equal(fixture.records.length, 0);
  const a = h.jobs().find((j) => j.name === "a.bin"),
    b = h.jobs().find((j) => j.name === "b.bin");
  await h.page
    .getByRole("button", { name: "Gestionar colas", exact: true })
    .click();
  await editor
    .getByRole("combobox", { name: "Cola", exact: true })
    .selectOption(q.id);
  await editor
    .getByRole("button", { name: "Subir b.bin", exact: true })
    .click();
  for (let i = 0; i < 50; i++) {
    if (h.jobs().find((j) => j.id === b.id).queue_order === 0) break;
    await sleep(100);
  }
  assert.equal(h.jobs().find((j) => j.id === b.id).queue_order, 0);
  await editor.getByRole("button", { name: "Cerrar", exact: true }).click();
  assert.equal(
    (await h.org({ action: "reorder", queue_id: q.id, ids: [b.id, a.id] }))
      .kind,
    "organization",
  );
  const started = await h.org({ action: "run_queue", id: q.id, running: true });
  assert.equal(started.kind, "organization");
  await h.waitJob("b.bin", (j) => BigInt(j.received_bytes) > 65536n);
  assert.equal(h.jobs().find((j) => j.id === a.id).state, "queued");
  const refusedId = crypto.randomUUID();
  const refused = await h.command(
    {
      create_download: {
        draft: {
          queue_id: q.id,
          input: {
            url: fixture.url + "/file",
            name: "refused.bin",
            directory: h.files,
            expected_sha256: null,
            conflict: "reject",
          },
          options: {
            mode: "automatic",
            replay_safe: false,
            bytes_per_second: null,
            priority: "normal",
          },
          category: "Otros",
          start: "now",
        },
      },
    },
    refusedId,
  );
  assert.equal(refused.code, "busy");
  assert.ok(
    !h.jobs().some((j) => j.id === refusedId),
    "Full queue must not leave an unstarted probing job",
  );
  await h.org({ action: "run_queue", id: q.id, running: false });
  await h.waitJob("b.bin", (j) => j.state === "completed");
  assert.equal(h.jobs().find((j) => j.id === a.id).state, "queued");
  await h.org({ action: "run_queue", id: q.id, running: true });
  await h.waitJob("a.bin", (j) => BigInt(j.received_bytes) > 65536n);
  await h.org({ action: "pause_queue", id: q.id });
  await h.waitJob("a.bin", (j) => j.state === "paused");
  const id = crypto.randomUUID();
  const moved = await h.org(
    { action: "move_jobs", ids: [a.id], queue_id: "main" },
    id,
  );
  assert.equal(moved.kind, "organization");
  const before = h.jobs().find((j) => j.id === a.id).queue_order;
  await h.org({ action: "move_jobs", ids: [a.id], queue_id: "main" }, id);
  assert.equal(h.jobs().find((j) => j.id === a.id).queue_order, before);
  await h.command({ resume_download: { job_id: a.id } });
  await h.waitJob("a.bin", (j) => j.state === "completed");
  for (const name of ["a.bin", "b.bin"])
    assert.equal(
      createHash("sha256")
        .update(await readFile(path.join(h.files, name)))
        .digest("hex"),
      expectedHash(fixture.size),
    );
  assert.equal(h.jobs().find((j) => j.name === "later.bin").state, "deferred");
  const scheduled = {
    ...q,
    running: false,
    schedule: { at: Math.floor(Date.now() / 1000) + 3, state: "pending" },
  };
  assert.equal(
    (await h.org({ action: "save_queue", queue: scheduled })).kind,
    "organization",
  );
  await h.add("scheduled.bin", fixture.url + "/file", "Añadir a cola", q.id);
  await h.waitJob("scheduled.bin", (j) => j.state === "completed");
  assert.equal(
    (await h.org({ action: "get" })).state.queues.find((x) => x.id === q.id)
      .schedule.state,
    "applied",
  );
  assert.equal(
    (await h.org({ action: "delete_queue", id: q.id, reassign_to: "main" }))
      .kind,
    "organization",
  );
  assert.ok(h.jobs().every((j) => j.queue_id === "main"));
  assert.equal(h.jobs().length, 4);
  assert.equal(
    (await h.org({ action: "get" })).state.power_simulated,
    true,
    "Mandatory simulated power adapter",
  );
  await h.org({ action: "arm_power", id: "main", power: "shutdown" });
  await sleep(1500);
  assert.equal(
    (await h.org({ action: "get" })).state.power_remaining,
    null,
    "Deferred job blocks power",
  );
  const later = h.jobs().find((j) => j.name === "later.bin");
  await h.command({ resume_download: { job_id: later.id } });
  await h.waitJob("later.bin", (j) => j.state === "completed");
  await h.page
    .getByRole("button", { name: "Cancelar acción de energía", exact: true })
    .click();
  assert.equal((await h.org({ action: "get" })).state.power_remaining, null);
  assert.equal(
    (await h.org({ action: "get" })).state.queues[0].power_armed,
    false,
  );
  await sleep(1200);
  assert.equal(
    (await h.org({ action: "get" })).state.power_remaining,
    null,
    "Cancelled activation does not rearm",
  );
  console.log(
    "PASS energía simulada: trabajos pendientes bloquean, cuenta atrás real visible, cancelar desde Tauri, sin reactivación ni acciones Windows.",
  );
  console.log(
    "PASS fase06 colas Tauri: crear, orden, concurrencia, detener versus pausar, mover idempotente, horario único, Después preservado, reasignar sin borrar y hashes reales.",
  );
} finally {
  await h.close();
  await fixture.close();
}
