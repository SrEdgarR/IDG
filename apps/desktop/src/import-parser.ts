export const MAX_IMPORT_BYTES = 1024 * 1024,
  MAX_IMPORT_ROWS = 1000;
export type ImportEntry = { url: string; name: string; error: string };
export function decodeImport(bytes: Uint8Array) {
  if (bytes.byteLength > MAX_IMPORT_BYTES)
    throw Error("El archivo supera 1 MiB.");
  const encoding =
    bytes[0] === 255 && bytes[1] === 254
      ? "utf-16le"
      : bytes[0] === 254 && bytes[1] === 255
        ? "utf-16be"
        : "utf-8";
  return new TextDecoder(encoding, { fatal: true })
    .decode(bytes)
    .replace(/^\uFEFF/, "");
}
export function importEntry(url: string, name = ""): ImportEntry {
  let error = "";
  url = url.trim();
  name = name.trim();
  try {
    const u = new URL(url);
    if (
      url.length > 8192 ||
      !["http:", "https:"].includes(u.protocol) ||
      !u.hostname ||
      u.username ||
      u.password ||
      /[\u0000-\u0020]/.test(url)
    )
      throw Error();
    if (!name) {
      try {
        name = decodeURIComponent(
          u.pathname.split("/").pop() || "descarga.bin",
        );
      } catch {
        name = "descarga.bin";
      }
    }
  } catch {
    error = "URL HTTP/HTTPS no válida o con credenciales incrustadas.";
  }
  if (
    !name ||
    name.length > 240 ||
    /[<>:"/\\|?*\u0000-\u001f]/.test(name) ||
    /[. ]$/.test(name) ||
    /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(name)
  )
    error = error || "Nombre no válido para Windows.";
  return { url, name, error };
}
export function parseImport(text: string, csv = false): ImportEntry[] {
  if (
    text.length > MAX_IMPORT_BYTES ||
    new TextEncoder().encode(text).length > MAX_IMPORT_BYTES
  )
    throw Error("El lote supera 1 MiB.");
  text = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false,
    closed = false;
  const finishRow = () => {
    row.push(field);
    if (row.some((c) => c.trim())) rows.push(row);
    if (rows.length > MAX_IMPORT_ROWS + 1)
      throw Error("Máximo 1000 enlaces por lote.");
    row = [];
    field = "";
    closed = false;
  };
  if (csv) {
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            quoted = false;
            closed = true;
          }
        } else field += c;
        continue;
      }
      if (c === '"') {
        if (field || closed)
          throw Error(
            "Comillas CSV inesperadas. Corrige el archivo antes de importarlo.",
          );
        quoted = true;
      } else if (c === ",") {
        row.push(field);
        field = "";
        closed = false;
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        finishRow();
      } else {
        if (closed && !/\s/.test(c))
          throw Error("Texto después de cerrar una celda CSV.");
        if (!closed) field += c;
      }
    }
    if (quoted) throw Error("Falta cerrar una celda CSV entre comillas.");
    finishRow();
    if (rows[0]?.[0]?.trim().toLowerCase() === "url") rows.shift();
  } else {
    for (const line of text.split(/\r?\n/)) {
      if (line.trim()) rows.push([line.trim()]);
      if (rows.length > MAX_IMPORT_ROWS)
        throw Error("Máximo 1000 enlaces por lote.");
    }
  }
  if (rows.length > MAX_IMPORT_ROWS)
    throw Error("Máximo 1000 enlaces por lote.");
  return rows.map((cells) =>
    cells.length > 2
      ? {
          url: cells[0],
          name: cells[1] ?? "",
          error: "CSV admite solo URL y nombre opcional.",
        }
      : importEntry(cells[0], cells[1]),
  );
}
