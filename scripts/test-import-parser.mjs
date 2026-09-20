import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseImport,
  decodeImport,
  MAX_IMPORT_BYTES,
} from "../apps/desktop/src/import-parser.ts";
test("TXT y CSV son datos; comillas, BOM, vacíos, correcciones y límites", () => {
  const rows = parseImport(
    '\uFEFFurl,nombre\r\n"https://example.org/a","a,b.bin"\r\n\r\n=cmd,invalid.bin\r\nhttps://example.org/b,b.bin',
    true,
  );
  assert.equal(rows.length, 3);
  assert.equal(rows[0].name, "a,b.bin");
  assert.equal(rows[1].error.length > 0, true);
  assert.equal(rows[2].error, "");
  assert.throws(() => parseImport('"https://example.org/unclosed', true));
  assert.throws(() => parseImport("a".repeat(MAX_IMPORT_BYTES + 1)));
  assert.throws(() =>
    parseImport(Array(1001).fill("https://example.org/f").join("\n")),
  );
  assert.equal(
    parseImport(
      "https://example.org/a?token=one\nhttps://example.org/a?token=two",
    ).length,
    2,
  );
  assert.throws(() => decodeImport(Uint8Array.of(255, 255, 255)));
  assert.equal(decodeImport(Uint8Array.of(255, 254, 65, 0)), "A");
  assert.ok(parseImport("https://example.org/f,CON.bin", true)[0].error);
});
