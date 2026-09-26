import { describe, expect, it } from "vitest";
import {
  decodeImport,
  importEntry,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  parseImport,
} from "./import-parser";

describe("parseImport CSV edge cases", () => {
  it("decodes escaped quotes, marks extra columns, and rejects text after a closing quote", () => {
    expect(parseImport('https://cdn.example/file,"a""b.txt"', true)).toEqual([
      {
        url: "https://cdn.example/file",
        name: 'a"b.txt',
        error: "Nombre no válido para Windows.",
      },
    ]);

    expect(
      parseImport("https://cdn.example/file,custom-name.bin,ignored", true),
    ).toEqual([
      {
        url: "https://cdn.example/file",
        name: "custom-name.bin",
        error: "CSV admite solo URL y nombre opcional.",
      },
    ]);

    expect(() =>
      parseImport('"https://cdn.example/file"oops,custom-name.bin', true),
    ).toThrow("Texto después de cerrar una celda CSV.");
  });

  it("accepts exactly 1000 rows and rejects the next one", () => {
    const batch = Array.from(
      { length: MAX_IMPORT_ROWS },
      (_, index) => `https://cdn.example/${index}.bin`,
    ).join("\n");

    expect(parseImport(batch)).toHaveLength(MAX_IMPORT_ROWS);
    expect(() => parseImport(`${batch}\nhttps://cdn.example/extra.bin`)).toThrow(
      "Máximo 1000 enlaces por lote.",
    );
  });
});

describe("decodeImport and importEntry boundaries", () => {
  it("decodes UTF-16BE and enforces the encoded byte limit for multibyte text", () => {
    expect(decodeImport(Uint8Array.of(254, 255, 0, 65))).toBe("A");

    const text = "é".repeat(Math.floor(MAX_IMPORT_BYTES / 2) + 1);
    expect(text.length).toBeLessThanOrEqual(MAX_IMPORT_BYTES);
    expect(() => parseImport(text)).toThrow("El lote supera 1 MiB.");
  });

  it.each([
    ["https://cdn.example/%43ON.bin", "CON.bin"],
    ["https://cdn.example/%2E%2E%2Fsecret.txt", "../secret.txt"],
  ])("rejects a percent-decoded unsafe Windows filename", (url, decodedName) => {
    const entry = importEntry(url);
    expect(entry.name).toBe(decodedName);
    expect(entry.error).toBe("Nombre no válido para Windows.");
  });
});
