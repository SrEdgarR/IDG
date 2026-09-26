import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, copyFile, writeFile } from "node:fs/promises";
const identity = JSON.parse(
  await readFile(new URL("./development-identity.json", import.meta.url)),
);
for (const browser of ["chromium", "firefox"]) {
  const output = new URL(`./build/${browser}/`, import.meta.url);
  await mkdir(output, { recursive: true });
  await build({
    entryPoints: { popup: fileURLToPath(new URL(browser === "chromium" ? "./src/popup.ts" : "./src/popup-firefox.ts", import.meta.url)) },
    outdir: fileURLToPath(output),
    bundle: true,
    format: "iife",
    target: "es2022",
  });
  if (browser === "chromium") await build({ entryPoints: [fileURLToPath(new URL("./src/worker.ts", import.meta.url))], outfile: fileURLToPath(new URL("worker.js", output)), bundle: true, format: "iife", target: "es2022" });
  else await build({ entryPoints: [fileURLToPath(new URL("./src/firefox-background.ts", import.meta.url))], outfile: fileURLToPath(new URL("background.js", output)), bundle: true, format: "iife", target: "es2022" });
  for (const name of ["popup.css"])
    await copyFile(
      new URL(`./src/${name}`, import.meta.url),
      new URL(name, output),
    );
  await copyFile(new URL(browser === "chromium" ? "./src/popup.html" : "./src/popup-firefox.html", import.meta.url), new URL("popup.html", output));
  await copyFile(
    new URL("../../packages/ui/tokens.css", import.meta.url),
    new URL("tokens.css", output),
  );
  const manifest = {
    manifest_version: 3,
    name: "IDG — Puente de desarrollo",
    version: "0.1.0",
    incognito: "not_allowed",
    description: browser === "chromium" ? "Puente de desarrollo de IDG para descargas públicas y repetibles." : "Solicitudes manuales de enlaces directos; sin captura automática.",
    permissions: browser === "chromium" ? ["nativeMessaging", "storage", "contextMenus", "activeTab", "scripting"] : ["nativeMessaging", "menus"],
    action: { default_popup: "popup.html" },
  };
  if (browser === "chromium") {
    manifest.key = identity.chromium_public_key;
    manifest.background = { service_worker: "worker.js" };
  }
  else {
    manifest.background = { scripts: ["background.js"] };
    manifest.browser_specific_settings = {
      gecko: {
        id: identity.firefox_id,
        strict_min_version: "140.0",
        data_collection_permissions: { required: ["none"] },
      },
    };
  }
  await writeFile(
    new URL("manifest.json", output),
    JSON.stringify(manifest, null, 2) + "\n",
  );
}
