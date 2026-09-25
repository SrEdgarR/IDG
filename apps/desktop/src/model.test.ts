import { describe, expect, it } from "vitest";
import { formatBytes, validateDraft } from "./model";

describe("validateDraft", () => {
  it("accepts a Windows-safe filename and a public HTTPS URL", () => {
    expect(validateDraft("release.zip", "https://cdn.example/release.zip")).toEqual({});
  });

  it.each(["ftp://cdn.example/release.zip", "ftps://cdn.example/release.zip"])(
    "rejects unsupported transfer schemes: %s",
    (url) => {
      expect(validateDraft("release.zip", url).url).toBe(
        "Introduce una URL HTTP o HTTPS válida, sin credenciales incrustadas.",
      );
    },
  );

  it.each([
    ["CON.txt", "https://cdn.example/file.zip"],
    ["../file.zip", "https://cdn.example/file.zip"],
    ["file.zip", "https://user:secret@cdn.example/file.zip"],
    ["x".repeat(241), "https://cdn.example/file.zip"],
  ])("rejects unsafe draft values (%s)", (name, url) => {
    expect(validateDraft(name, url)).not.toEqual({});
  });
});

describe("formatBytes", () => {
  it("uses bigint arithmetic for u64 values before truncating the display", () => {
    expect(formatBytes(18_446_744_073_709_551_615n)).toBe("17.179.869.183,9 GiB");
  });

  it("keeps zero distinct from an unknown size", () => {
    expect(formatBytes(0n)).toBe("0 B");
    expect(formatBytes(null)).toBe("Tamaño desconocido");
  });
});
