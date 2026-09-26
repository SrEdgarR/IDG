import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = "apps/extension/build/firefox";
const manifest = JSON.parse(await readFile(`${root}/manifest.json`, "utf8"));
const chromium = JSON.parse(await readFile("apps/extension/build/chromium/manifest.json", "utf8"));
const identity = JSON.parse(await readFile("apps/extension/development-identity.json", "utf8"));

assert.equal(manifest.manifest_version, 3);
assert.deepEqual(manifest.background, { scripts: ["background.js"] });
assert.equal(manifest.incognito, "not_allowed");
assert.deepEqual(manifest.permissions, ["nativeMessaging", "menus"]);
assert.equal(manifest.action.default_popup, "popup.html");
assert.deepEqual(manifest.browser_specific_settings.gecko, {
  id: identity.firefox_id,
  strict_min_version: "140.0",
  data_collection_permissions: { required: ["none"] },
});
assert.equal("host_permissions" in manifest, false);
assert.equal("optional_permissions" in manifest, false);
assert.equal("service_worker" in manifest.background, false);
await readFile(`${root}/background.js`, "utf8");
assert.equal(chromium.incognito, "not_allowed");
assert.ok(chromium.permissions.includes("contextMenus"));
assert.equal(chromium.permissions.includes("downloads"), false);
assert.equal("optional_permissions" in chromium, false);
console.log("PASS extension manifests: Firefox MV3 scripts and stable ID; minimal permissions and private windows excluded.");
