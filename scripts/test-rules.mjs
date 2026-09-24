import assert from "node:assert/strict";
import { mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { desktopHarness, sleep } from "./desktop-harness.mjs";
import { startSegments, expectedHash } from "../fixtures/http/segments.mjs";
const f = await startSegments({ size: 128 * 1024, rate: 512 * 1024 });
const h = await desktopHarness();
try {
  const destination = path.join(h.dir, "rules-destination");
  await mkdir(destination);
  await h.page.getByRole("button", { name: "En cola", exact: true }).click();
  await h.page
    .getByRole("button", { name: "Gestionar reglas", exact: true })
    .click();
  const rules = h.page.getByRole("dialog", { name: "Reglas de organización" });
  await rules.getByText("Categorías personalizadas", { exact: true }).click();
  await rules.getByLabel("Nueva categoría", { exact: true }).fill("Lecturas");
  await rules
    .getByRole("button", { name: "Añadir categoría", exact: true })
    .click();
  for (let i = 0; i < 50; i++) {
    if ((await h.org({ action: "get" })).state.categories.includes("Lecturas"))
      break;
    await sleep(100);
  }
  await rules
    .getByLabel("Nombre de la regla", { exact: true })
    .fill("PDF a Lecturas");
  await rules.getByLabel("Extensión sin punto", { exact: true }).fill("pdf");
  await rules
    .getByLabel("Carpeta de destino", { exact: true })
    .fill(destination);
  await rules
    .getByRole("combobox", { name: "Categoría de destino", exact: true })
    .selectOption("Lecturas");
  await rules
    .getByRole("button", { name: "Guardar regla", exact: true })
    .click();
  for (let i = 0; i < 50; i++) {
    if ((await h.org({ action: "get" })).state.rules.length) break;
    await sleep(100);
  }
  assert.equal((await h.org({ action: "get" })).state.rules.length, 1);
  await rules.getByRole("button", { name: "Cerrar", exact: true }).click();
  await h.page
    .getByRole("button", { name: "Nueva descarga", exact: true })
    .click();
  const dialog = h.page.getByRole("dialog", {
    name: "Nueva descarga",
    exact: true,
  });
  await dialog
    .getByLabel("URL del archivo", { exact: true })
    .fill(f.url + "/file");
  await dialog
    .getByLabel("Nombre del archivo", { exact: true })
    .fill("manual.pdf");
  await dialog.getByText("Avanzado", { exact: true }).click();
  await dialog
    .getByRole("button", { name: "Previsualizar reglas", exact: true })
    .click();
  await dialog.getByText("1 reglas coincidentes.", { exact: false }).waitFor();
  assert.equal(f.records.length, 0);
  await dialog
    .getByRole("button", { name: "Descargar ahora", exact: true })
    .click();
  await dialog.waitFor({ state: "hidden" });
  const downloaded = await h.waitJob(
    "manual.pdf",
    (j) => j.state === "completed",
  );
  assert.equal(downloaded.category, "Lecturas");
  assert.equal(
    createHash("sha256")
      .update(await readFile(path.join(destination, "manual.pdf")))
      .digest("hex"),
    expectedHash(f.size),
  );
  // Explicit destination survives automatically applied rules; no silent redirection.
  await h.add("explicit.pdf", f.url + "/file", "Descargar ahora");
  await h.waitJob("explicit.pdf", (j) => j.state === "completed");
  await stat(path.join(h.files, "explicit.pdf"));
  const config = (await h.org({ action: "get" })).state;
  const modified = {
    ...config.rules[0],
    effect: {
      ...config.rules[0].effect,
      category: "Documentos",
      directory: h.files,
    },
  };
  await h.org({ action: "save_rule", rule: modified });
  assert.equal(
    h.jobs().find((j) => j.id === downloaded.id).category,
    "Lecturas",
  );
  await stat(path.join(destination, "manual.pdf"));
  await h.page
    .getByRole("button", { name: "Gestionar reglas", exact: true })
    .click();
  await rules
    .getByText("Previsualizar y aplicar a un trabajo existente", {
      exact: true,
    })
    .click();
  await rules
    .getByRole("button", { name: "Cargar trabajos", exact: true })
    .click();
  await rules
    .getByRole("combobox", { name: "Trabajo", exact: true })
    .selectOption(downloaded.id);
  await rules
    .getByRole("button", {
      name: "Previsualizar reglas guardadas",
      exact: true,
    })
    .click();
  await rules.getByText("Carpeta omitida:", { exact: false }).waitFor();
  await rules
    .getByRole("button", {
      name: "Aceptar cambios previsualizados",
      exact: true,
    })
    .click();
  await h.waitJob("manual.pdf", (j) => j.category === "Documentos");
  await stat(path.join(destination, "manual.pdf"));
  assert.equal(h.jobs().length, 2);
  console.log(
    "PASS reglas Tauri: categoría personalizada, regla guardada, preview sin GET, carpeta/categoría efectivas, SHA real, elección explícita, aplicar retroactivamente con aceptación sin mover archivos.",
  );
} finally {
  await h.close();
  await f.close();
}
