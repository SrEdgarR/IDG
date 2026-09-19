import { execFileSync } from "node:child_process";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
const cargo = JSON.parse(
  execFileSync("cargo", ["metadata", "--locked", "--format-version", "1"], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  }),
);
const rust = cargo.packages
  .filter((p) => p.source)
  .map((p) => ({
    name: p.name,
    version: p.version,
    license: p.license,
    source: p.source,
  }));
const js = new Map();
for (const entry of await readdir("node_modules/.pnpm", {
  withFileTypes: true,
})) {
  if (!entry.isDirectory() || entry.name === "node_modules") continue;
  const base = path.join("node_modules/.pnpm", entry.name, "node_modules");
  let children;
  try {
    children = await readdir(base, { withFileTypes: true });
  } catch {
    continue;
  }
  for (const child of children) {
    if (child.name.startsWith(".")) continue;
    const folder = path.join(base, child.name);
    const folders = child.name.startsWith("@")
      ? (await readdir(folder)).map((n) => path.join(folder, n))
      : [folder];
    for (const dir of folders) {
      try {
        const p = JSON.parse(
          await readFile(path.join(dir, "package.json"), "utf8"),
        );
        js.set(`${p.name}@${p.version}`, {
          name: p.name,
          version: p.version,
          license: p.license ?? null,
          source: `https://registry.npmjs.org/${p.name}/${p.version}`,
        });
      } catch {}
    }
  }
}
const sorted = (items) =>
  items.sort(
    (a, b) =>
      a.name.localeCompare(b.name) || a.version.localeCompare(b.version),
  );
await writeFile(
  "docs/DEPENDENCIES.json",
  JSON.stringify(
    {
      notice:
        "Metadatos de licencias; no sustituye incluir textos y avisos al distribuir binarios. Inventario del entorno Windows resuelto.",
      rust: sorted(rust),
      javascript: sorted([...js.values()]),
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Inventario: ${rust.length} crates, ${js.size} paquetes JS. Sin licencia declarada: ${[...rust, ...js.values()].filter((x) => !x.license).length}`,
);
