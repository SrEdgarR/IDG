import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { desktopHarness, sleep } from "./desktop-harness.mjs";
import { startSegments } from "../fixtures/http/segments.mjs";
const a = await startSegments({ size: 512 * 1024, rate: 256 * 1024 }),
  b = await startSegments({ size: 512 * 1024, rate: 256 * 1024 }),
  h = await desktopHarness();
const options = {
  mode: { manual: { requests: 4 } },
  replay_safe: true,
  bytes_per_second: 128 * 1024,
  priority: "normal",
};
async function add(id, queue, url) {
  const r = await h.command(
    {
      create_download: {
        draft: {
          queue_id: queue,
          input: {
            url,
            directory: h.files,
            name: id + ".bin",
            expected_sha256: null,
            conflict: "reject",
          },
          options,
          category: "Otros",
          start: "queue",
        },
      },
    },
    id,
  );
  assert.equal(r.kind, "download");
}
try {
  const main = (await h.org({ action: "get" })).state.queues[0];
  const qa = {
      ...main,
      id: "queue-a",
      name: "Alta",
      priority: "high",
      concurrency: 1,
    },
    qb = {
      ...main,
      id: "queue-b",
      name: "Baja",
      priority: "low",
      concurrency: 1,
    };
  await h.org({ action: "save_queue", queue: qa });
  await h.org({ action: "save_queue", queue: qb });
  await h.command({
    set_resource_limits: {
      limits: {
        max_downloads: 1,
        global_requests: 1,
        origin_requests: 1,
        bytes_per_second: 192 * 1024,
      },
    },
  });
  await h.org({
    action: "save_queue",
    queue: { ...qa, name: "Alta renombrada" },
  });
  await add("a1", qa.id, a.url + "/a1");
  await add("a2", qa.id, a.url + "/a2");
  await add("b1", qb.id, b.url + "/b1");
  await h.org({ action: "run_queue", id: qa.id, running: true });
  await h.org({ action: "run_queue", id: qb.id, running: true });
  let peak = 0;
  for (let i = 0; i < 300; i++) {
    const jobs = h.jobs();
    const total = jobs.reduce((n, j) => n + j.active_requests, 0);
    peak = Math.max(peak, total);
    assert.ok(total <= 1);
    if (jobs.every((j) => j.state === "completed")) break;
    await sleep(100);
  }
  assert.ok(h.jobs().every((j) => j.state === "completed"));
  assert.equal(peak, 1);
  assert.ok(
    b.records[0].at < a.records.find((r) => r.route === "/a2").at,
    "Low-priority queue receives next turn before high-priority backlog",
  );
  assert.ok(
    b.records[0].at - a.records[0].at >= 3500,
    "Per-job 128 KiB/s cap paces a 512 KiB transfer",
  );
  await h.command({
    set_resource_limits: {
      limits: {
        max_downloads: 3,
        global_requests: 2,
        origin_requests: 1,
        bytes_per_second: 256 * 1024,
      },
    },
  });
  await add("a3", qa.id, a.url + "/a3");
  await add("a4", qa.id, a.url + "/a4");
  await add("b2", qb.id, a.url + "/b2");
  for (let i = 0; i < 60; i++) {
    const jobs = h.jobs();
    assert.ok(
      jobs.filter(
        (j) =>
          j.queue_id === qa.id && ["probing", "downloading"].includes(j.state),
      ).length <= 1,
    );
    assert.ok(
      jobs.filter(
        (j) =>
          j.queue_id === qb.id && ["probing", "downloading"].includes(j.state),
      ).length <= 1,
    );
    assert.ok(
      jobs.reduce((n, j) => n + j.active_requests, 0) <= 1,
      "Shared origin limit across queues",
    );
    if (jobs.find((j) => j.name === "a3.bin")?.state === "downloading") break;
    await sleep(100);
  }
  await h.command({ cancel_download: { job_id: "b2" } });
  await h.waitJob("b2.bin", (j) => j.state === "cancelled");
  assert.equal(
    a.records.filter((r) => r.route === "/b2").length,
    0,
    "Cancellation removes origin-budget waiter before GET",
  );
  await h.org({ action: "run_queue", id: qa.id, running: false });
  await h.org({ action: "run_queue", id: qb.id, running: false });
  const before = a.records.filter((r) => r.route === "/a3").length;
  await h.restart(true);
  assert.equal(h.jobs().find((j) => j.name === "a3.bin").state, "paused");
  await sleep(500);
  assert.equal(
    a.records.filter((r) => r.route === "/a3").length,
    before,
    "Crash does not replay started URL",
  );
  const persisted = (await h.org({ action: "get" })).state;
  assert.equal(persisted.queues.length, 3);
  assert.equal(persisted.queues.find((q) => q.id === qa.id).concurrency, 1);
  assert.equal(h.jobs().find((j) => j.name === "a4.bin").state, "queued");
  assert.match(
    execFileSync(
      "pwsh",
      [
        "-NoProfile",
        "-File",
        "scripts/Close-TestWindow.ps1",
        "-ProcessId",
        String(h.desktopProcessId),
      ],
      { encoding: "utf8", windowsHide: true },
    ),
    /hidden/,
  );
  const runtimePid = h.probe(["ping"]).process_id;
  const duplicate = spawn(h.exe("idg-desktop"), [], {
    env: h.env,
    windowsHide: true,
    stdio: "ignore",
  });
  await new Promise((resolve) => duplicate.once("exit", resolve));
  await sleep(500);
  assert.equal(h.probe(["ping"]).process_id, runtimePid);
  assert.deepEqual(
    (await h.org({ action: "get" })).state.queues,
    persisted.queues,
  );
  console.log(
    "PASS colas: límite global/cola/trabajo/origen compartidos, turno de prioridad baja, recuperación tras caída sin GET repetido, orden persistente y cierre nativo/reapertura sin duplicar runtime.",
  );
} finally {
  await h.close();
  await a.close();
  await b.close();
}
