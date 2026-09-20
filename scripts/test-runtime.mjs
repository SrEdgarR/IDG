import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import net from "node:net";
import path from "node:path";
import assert from "node:assert/strict";
import {mkdir,mkdtemp} from "node:fs/promises";
const root = process.cwd();
const binary = (name) => path.join(root, `target/debug/${name}.exe`);
const probe = (command = "ping") =>
  execFileSync(binary("idg-probe"), [command], {
    encoding: "utf8",
    windowsHide: true,
    stdio: ["ignore", "pipe", "ignore"],
  });
let existing;
try {
  existing = probe();
} catch {}
if (existing) throw new Error("Detén el runtime antes de esta prueba aislada.");
await mkdir('.local',{recursive:true});
const dataDir=await mkdtemp(path.join(root,'.local/pipe-state-'));
const sid = execFileSync(
  "powershell.exe",
  [
    "-NoProfile",
    "-Command",
    "[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value",
  ],
  { encoding: "utf8", windowsHide: true },
).trim();
const pipe = `\\\\.\\pipe\\IDG.dev.v1.${sid}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = (name) =>
  spawn(binary(name), [], {
    env:{...process.env,IDG_DATA_DIR:dataDir},
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  });
const exited = async (child) => {
  if (child.exitCode !== null) return child.exitCode;
  return Promise.race([
    once(child, "exit").then(([code]) => code),
    new Promise((_, reject) => {
      const t = setTimeout(() => {
        child.kill();
        reject(new Error("Proceso no terminó en plazo"));
      }, 8000);
      t.unref();
    }),
  ]);
};
const frame = (value) => {
  const body = Buffer.from(JSON.stringify(value));
  const prefix = Buffer.alloc(4);
  prefix.writeUInt32LE(body.length);
  return Buffer.concat([prefix, body]);
};
let runtime = run("idg-runtime");
try {
  for (let i = 0; i < 40; i++) {
    try {
      probe();
      break;
    } catch {
      await sleep(100);
    }
  }
  const initial = JSON.parse(probe());
  console.log(probe("self-test").trim());
  const duplicate = run("idg-runtime");
  assert.equal(await exited(duplicate), 1);
  assert.equal(JSON.parse(probe()).runtime_id, initial.runtime_id);
  // Node is deliberately not on the runtime executable allowlist.
  const client = net.connect(pipe);
  client.on("error", () => {});
  const closed = new Promise((resolve) => client.once("close", resolve));
  client.write(frame({ version: 1, id: "untrusted", command: "handshake" }));
  let received = 0;
  client.on("data", (b) => (received += b.length));
  await Promise.race([
    closed,
    sleep(6000).then(() => {
      client.destroy();
      throw new Error("Unauthorized client not closed");
    }),
  ]);
  assert.equal(received, 0);
  for (const input of [
    Buffer.from([255, 255, 255, 127]),
    Buffer.from([1]),
    frame("invalid request"),
  ]) {
    const host = run("idg-native-host");
    host.stdin.on("error", () => {});
    host.stdin.write(input);
    assert.ok(
      [0, 1].includes(await exited(host)),
      "Host must terminate on invalid/unfinished frame",
    );
  }
  const host = run("idg-native-host");
  host.stdin.on("error", () => {});
  let bytes = Buffer.alloc(0);
  host.stdout.on("data", (b) => (bytes = Buffer.concat([bytes, b])));
  const hello = frame({ version: 1, id: "fragmented", command: "handshake" });
  for (const b of hello) host.stdin.write(Buffer.from([b]));
  for (let i = 0; i < 50 && bytes.length < 4; i++) await sleep(20);
  for (
    let i = 0;
    i < 50 &&
    bytes.length < 4 + (bytes.length >= 4 ? bytes.readUInt32LE() : Infinity);
    i++
  )
    await sleep(20);
  assert.equal(JSON.parse(bytes.subarray(4).toString()).payload.kind, "hello");
  assert.ok(!JSON.parse(bytes.subarray(4).toString()).payload.capabilities.includes('get_download_capabilities'));
  bytes = Buffer.alloc(0);
  host.stdin.write(frame({ version: 1, id: "forbidden-download", command: { list_downloads: { offset: 0 } } }));
  await exited(host);
  assert.deepEqual(JSON.parse(bytes.subarray(4).toString()).payload, { kind: "error", code: "unauthorized" });
  host.stdin.end();
  assert.equal(await exited(host), 0);
  assert.equal(JSON.parse(probe()).runtime_id, initial.runtime_id);
  const lingering = run("idg-native-host");
  lingering.stdin.on("error", () => {});
  lingering.stdin.write(hello);
  await once(lingering.stdout, "data");
  probe("shutdown");
  assert.equal(await exited(runtime), 0);
  await exited(lingering); // Open browser stdin must not leave an orphan host.
  assert.throws(() => probe());
  const absent = run("idg-native-host");
  assert.equal(await exited(absent), 1);
  // Fake pipe owned by this same user: authenticated client refuses Node's image.
  const fake = net.createServer((socket) => {
    socket.on("error", () => {});
    socket.resume();
  });
  await new Promise((resolve, reject) => {
    fake.once("error", reject);
    fake.listen(pipe, resolve);
  });
  try {
    assert.throws(() => probe());
  } finally {
    await new Promise((r) => fake.close(r));
  }
  console.log(
    "PASS runtime: singleton, cliente no autorizado, frames excesivos/parciales/JSON, EOF, host sin motor, pérdida del motor y rechazo de servidor falso.",
  );
} finally {
  if (runtime.exitCode === null) {
    try {
      probe("shutdown");
    } catch {
      runtime.kill();
    }
  }
}
