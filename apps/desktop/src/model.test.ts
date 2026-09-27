import { describe, expect, it } from "vitest";
import { formatBytes, validateDraft } from "./model";

describe("validateDraft", () => {
  it("accepts a Windows-safe filename and a public HTTPS URL", () => {
    expect(validateDraft("release.zip", "https://cdn.example/release.zip")).toEqual({});
  });

  it("accepts FTPS and requires explicit consent for cleartext FTP", () => {
    expect(validateDraft("release.zip", "ftps://cdn.example/release.zip")).toEqual({});
    expect(validateDraft("release.zip", "ftp://cdn.example/release.zip").cleartextFtp).toBeTruthy();
    expect(validateDraft("release.zip", "ftp://cdn.example/release.zip", undefined, true)).toEqual({});
  });

  it.each([
    "ftp://user:secret@cdn.example/release.zip",
    "ftps://user@cdn.example/release.zip",
    "ftp://cdn.example/release.zip?token=secret",
    "ftps://cdn.example/release.zip#fragment",
  ])("rejects embedded credentials and FTP(S) query/fragment data", (url) => {
    expect(validateDraft("release.zip", url, undefined, true).url).toBeTruthy();
  });

  it("accepts manual FTP credentials and safe HTTP headers, while rejecting reserved or unsafe headers", () => {
    const credentials = { username: "user", password: "secret", headers: [] };
    expect(validateDraft("release.zip", "ftp://cdn.example/release.zip", credentials, true)).toEqual({});
    expect(validateDraft("release.zip", "https://cdn.example/release.zip", {
      username: "",
      password: "",
      headers: [{ name: "X-Client-Id", value: "client-1" }],
    })).toEqual({});
    expect(validateDraft("release.zip", "https://cdn.example/release.zip", {
      username: "",
      password: "",
      headers: [{ name: "Authorization", value: "Bearer secret" }],
    }).headers).toBeTruthy();
    expect(validateDraft("release.zip", "https://cdn.example/release.zip", {
      username: "",
      password: "",
      headers: [{ name: "X-Client-Id", value: "first\r\nAuthorization: secret" }],
    }).headers).toBeTruthy();
    expect(validateDraft("release.zip", "ftps://cdn.example/release.zip", {
      username: "user",
      password: "secret",
      headers: [{ name: "X-Client-Id", value: "client-1" }],
    }).headers).toBeTruthy();
  });

  it("validates explicit proxy endpoints and blocks per-download overrides for FTP(S)", () => {
    const explicit = { mode: "explicit", url: "socks5h://proxy.example:1080" } as const;
    expect(validateDraft("release.zip", "https://cdn.example/release.zip", undefined, false, explicit)).toEqual({});
    for (const proxyUrl of [
      "https://user:secret@proxy.example:443",
      "http://proxy.example:8080/path",
      "socks5://proxy.example",
      "file://proxy.example:1080",
    ]) {
      expect(validateDraft("release.zip", "https://cdn.example/release.zip", undefined, false, {
        mode: "explicit",
        url: proxyUrl,
      }).proxy).toBeTruthy();
    }
    expect(validateDraft("release.zip", "ftp://cdn.example/release.zip", undefined, true, {
      mode: "direct",
      url: "",
    }).proxy).toBeTruthy();
  });

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
