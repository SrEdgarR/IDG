import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { developmentNativeHostName, hostNameForCheckout } from "./native-host-name.mjs";

const checkout = process.cwd();
const current = developmentNativeHostName(checkout);
const equivalent = developmentNativeHostName(checkout.replaceAll("\\", "/"));
const separate = hostNameForCheckout(path.resolve(checkout, "..", "IDG-copy"));

assert.match(current, /^io\.github\.sredgarr\.idg\.dev\.[0-9a-f]{16}$/);
assert.equal(current, equivalent, "La misma ruta canónica debe producir un nombre estable.");
assert.notEqual(current, separate, "Checkouts distintos deben usar nombres de host distintos.");
assert.ok(!current.includes(checkout), "El host no debe revelar la ruta local.");
const written = execFileSync(process.execPath, [path.join(import.meta.dirname, "native-host-name.mjs"), "--write"], { encoding: "utf8" });
assert.equal(written, current, "La CLI debe aceptar --write sin confundirlo con una ruta.");
assert.equal(readFileSync(path.join(checkout, ".local/native-host/host-name.txt"), "utf8").trim(), current);
console.log("PASS nombre Native Messaging: estable por checkout, distinto entre copias y sin exponer la ruta.");
