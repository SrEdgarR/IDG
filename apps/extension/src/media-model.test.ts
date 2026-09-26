import { describe, expect, it } from "vitest";
import {
  dedupeMediaCandidates,
  mergeObservedMedia,
  normalizeMediaCandidate,
} from "./media-model";

const context = { tabId: 7, frameId: 0 };
const input = {
  playerId: "player-1",
  url: "https://media.example/clip.mp4",
  kind: "video",
  title: "Local fixture",
  mimeType: "video/mp4; codecs=avc1",
  width: 1280,
  height: 720,
  durationMs: 14500,
};

describe("multimedia candidate model", () => {
  it("accepts a direct public HTTP media file and leaves unknown properties unknown", () => {
    expect(normalizeMediaCandidate(input, context)).toMatchObject({
      tabId: 7,
      frameId: 0,
      playerId: "player-1",
      url: input.url,
      availability: "direct",
      media: {
        kind: "video",
        title: "Local fixture",
        mime_type: "video/mp4",
        width: 1280,
        height: 720,
        frame_rate_milli: null,
        video_codec: null,
        audio_codec: null,
        audio_tracks: null,
        video_tracks: null,
        duration_ms: "14500",
        size_bytes: null,
        size_kind: "unknown",
        manifest_kind: "none",
      },
    });
  });

  it.each([
    ["https://media.example/master.m3u8", "application/vnd.apple.mpegurl", "hls"],
    ["https://media.example/live.mpd", "application/dash+xml", "dash"],
  ] as const)("identifies %s as a manifest without making it downloadable", (url, mimeType, kind) => {
    const candidate = normalizeMediaCandidate({ ...input, url, mimeType }, context);
    expect(candidate?.availability).toBe(kind);
    expect(candidate?.transferReason).toMatch(/fase 10/i);
  });

  it("does not turn blobs, credential URLs, signed URLs, data URLs, or unsafe names into files", () => {
    for (const url of [
      "blob:https://media.example/opaque",
      "https://user:pass@media.example/clip.mp4",
      "https://media.example/clip.mp4?token=secret",
      "data:video/mp4;base64,AA==",
      "https://media.example/%2Fprivate.mp4",
      "https://media.example/",
      `https://media.example/${"a".repeat(2050)}.mp4`,
    ]) {
      expect(normalizeMediaCandidate({ ...input, url }, context)?.availability).not.toBe("direct");
    }
    expect(normalizeMediaCandidate({ ...input, url: "blob:https://media.example/opaque" }, context)?.transferReason)
      .toMatch(/blob.*no es un archivo público/i);
  });

  it("bounds hostile titles, dimensions, duration, MIME and player identifiers", () => {
    expect(normalizeMediaCandidate({ ...input, title: "  Clip\nprivado  " }, context)?.media.title)
      .toBe("Clip privado");
    expect(normalizeMediaCandidate({ ...input, title: "x".repeat(501) }, context)).toBeNull();
    expect(normalizeMediaCandidate({ ...input, width: 99_999 }, context)?.media.width).toBeNull();
    expect(normalizeMediaCandidate({ ...input, durationMs: "1e9" }, context)?.media.duration_ms).toBeNull();
    expect(normalizeMediaCandidate({ ...input, mimeType: "video/mp4\r\nSet-Cookie: x" }, context)?.media.mime_type)
      .toBeNull();
    expect(normalizeMediaCandidate({ ...input, playerId: "x".repeat(100) }, context)).toBeNull();
  });

  it("retains only syntactically safe codec names discovered in a source declaration", () => {
    expect(normalizeMediaCandidate({ ...input, videoCodec: "avc1.640028", audioCodec: "mp4a.40.2" }, context)?.media)
      .toMatchObject({ video_codec: "avc1.640028", audio_codec: "mp4a.40.2" });
    expect(normalizeMediaCandidate({ ...input, videoCodec: "<img onerror=alert(1)>" }, context)?.media.video_codec)
      .toBeNull();
  });

  it("preserves exact 64-bit sizes as decimal strings only for the same tab, frame, and URL", () => {
    const candidate = normalizeMediaCandidate(input, context)!;
    const observed = {
      tabId: 7,
      frameId: 0,
      url: input.url,
      pageOrigin: "https://media.example",
      responseOrigin: "https://media.example",
      mimeType: "video/mp4",
      contentLength: "18446744073709551615",
      statusCode: 200,
      contentEncoding: null,
    };
    const enriched = mergeObservedMedia(candidate, observed);
    expect(enriched.media.size_bytes).toBe("18446744073709551615");
    expect(enriched.media.size_kind).toBe("exact");
    expect(mergeObservedMedia(candidate, { ...observed, responseOrigin: "https://other.example" }))
      .toEqual(candidate);
    expect(mergeObservedMedia(candidate, { ...observed, statusCode: 206 }).media.size_bytes)
      .toBeNull();
  });

  it("deduplicates repeated observations by player, frame, and URL without merging players", () => {
    const first = normalizeMediaCandidate(input, context)!;
    const same = normalizeMediaCandidate({ ...input, title: "other title" }, context)!;
    const otherPlayer = normalizeMediaCandidate({ ...input, playerId: "player-2" }, context)!;
    expect(dedupeMediaCandidates([first, same, otherPlayer])).toHaveLength(2);
    expect(dedupeMediaCandidates([first, same])[0].media.title).toBe("Local fixture");
  });
});
