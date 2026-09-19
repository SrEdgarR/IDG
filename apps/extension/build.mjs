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
    entryPoints: [fileURLToPath(new URL("./src/popup.ts", import.meta.url))],
    outdir: fileURLToPath(output),
    bundle: true,
    format: "iife",
    target: "es2022",
  });
  for (const name of ["popup.html", "popup.css"])
    await copyFile(
      new URL(`./src/${name}`, import.meta.url),
      new URL(name, output),
    );
  const manifest = {
    manifest_version: 3,
    name: "IDG — Puente de desarrollo",
    version: "0.1.0",
    description:
      "Prueba local del puente IDG. No descarga ni captura navegación.",
    permissions: ["nativeMessaging"],
    action: { default_popup: "popup.html" },
  };
  if (browser === "chromium") manifest.key = identity.chromium_public_key;
  else
    manifest.browser_specific_settings = {
      gecko: {
        id: identity.firefox_id,
        strict_min_version: "140.0",
        data_collection_permissions: { required: ["none"] },
      },
    };
  await writeFile(
    new URL("manifest.json", output),
    JSON.stringify(manifest, null, 2) + "\n",
  );
}
