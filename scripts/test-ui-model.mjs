import test from "node:test";
import assert from "node:assert/strict";
import {
  autoExpanded,
  filterDownloads,
  validateDraft,
} from "../apps/desktop/src/model.ts";
const row = {
  id: "test",
  name: "Manual.pdf",
  state: "Completed",
  category: "Documentos",
  domain: "example.org",
  date: "2026-09-19",
  total: null,
};
test("expansion is bounded by count and space", () => {
  assert.equal(autoExpanded(1, 300), true);
  assert.equal(autoExpanded(3, 800), true);
  assert.equal(autoExpanded(3, 400), false);
  assert.equal(autoExpanded(20, 2000), false);
});
test("combined filters preserve unknown size semantics", () => {
  const f = {
    query: "manual",
    view: "Documentos",
    site: "example",
    after: "2026-09-01",
    size: "unknown",
    status: "Completadas",
  };
  assert.equal(filterDownloads([row], f).length, 1);
  assert.equal(filterDownloads([row], { ...f, size: "small" }).length, 0);
  assert.equal(filterDownloads([row], { ...f, view: "Videos" }).length, 0);
});
test("draft rejects Windows reserved names, traversal and unsafe URLs", () => {
  for (const name of ["CON.txt", "../file", "bad:stream", "trailing.", "a\\b"])
    assert.ok(validateDraft(name, "https://example.org").name);
  for (const url of [
    "javascript:alert(1)",
    "https://u:p@example.org",
    "not url",
  ])
    assert.ok(validateDraft("file.pdf", url).url);
  assert.deepEqual(validateDraft("Manual.pdf", "https://example.org/file"), {});
});
