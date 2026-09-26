import type { MediaMetadata } from "../../../packages/shared-types/protocol";

export type MediaAvailability = "direct" | "hls" | "dash" | "blob" | "unavailable";

export type MediaCandidate = {
  tabId: number;
  frameId: number;
  playerId: string;
  url: string;
  availability: MediaAvailability;
  transferReason: string | null;
  thumbnail: string | null;
  media: MediaMetadata;
};

export type MediaRequestObservation = {
  tabId: number;
  frameId: number;
  url: string;
  pageOrigin: string;
  responseOrigin: string;
  mimeType: string | null;
  contentLength: string | null;
  statusCode: number;
  contentEncoding: string | null;
};

type MediaInput = {
  playerId?: unknown;
  url?: unknown;
  kind?: unknown;
  title?: unknown;
  mimeType?: unknown;
  videoCodec?: unknown;
  audioCodec?: unknown;
  width?: unknown;
  height?: unknown;
  durationMs?: unknown;
  thumbnail?: unknown;
};

const MAX_URL = 2048;
const MAX_DURATION_MS = 604_800_000;
const extensions = new Set([
  "aac", "aif", "aiff", "flac", "m4a", "m4v", "mkv", "mov", "mp3", "mp4",
  "oga", "ogg", "ogv", "opus", "wav", "weba", "webm",
]);

function cleanTitle(value: unknown): string | null {
  if (typeof value !== "string") return "";
  const title = value.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/\s+/g, " ").trim();
  return title.length <= 500 ? title : null;
}

function mime(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const type = value.split(";", 1)[0].trim().toLowerCase();
  return type.length <= 120 && /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(type)
    ? type
    : null;
}

function boundedNumber(value: unknown, min: number, max: number): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max
    ? value
    : null;
}

function codec(value: unknown): string | null {
  return typeof value === "string" && value.length <= 100 && /^[a-z0-9._-]+$/i.test(value)
    ? value
    : null;
}

function decimalU64(value: unknown, maxDigits: number): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > maxDigits || !/^\d+$/.test(value)) return null;
  try {
    return BigInt(value) <= 18_446_744_073_709_551_615n ? value : null;
  } catch {
    return null;
  }
}

function fileName(url: URL): string | null {
  const encoded = url.pathname.split("/").at(-1) ?? "";
  let name: string;
  try { name = decodeURIComponent(encoded); } catch { return null; }
  if (!name || name.length > 240 || name === "." || name === ".." || /[\\/<>:"|?*\u0000-\u001f]/.test(name)) return null;
  return name;
}

function availability(rawUrl: unknown, mimeType: string | null): {
  url: string;
  availability: MediaAvailability;
  transferReason: string | null;
} {
  if (typeof rawUrl !== "string" || rawUrl.length > MAX_URL) {
    return { url: "", availability: "unavailable", transferReason: "La URL supera el límite permitido." };
  }
  if (rawUrl.startsWith("blob:")) {
    return { url: rawUrl, availability: "blob", transferReason: "Un blob local de MediaSource no es un archivo público transferible." };
  }
  let url: URL;
  try { url = new URL(rawUrl); } catch {
    return { url: rawUrl, availability: "unavailable", transferReason: "La URL del medio no es válida." };
  }
  const path = url.pathname.toLowerCase();
  const type = mimeType ?? "";
  if (path.endsWith(".m3u8") || type.includes("mpegurl")) {
    return { url: rawUrl, availability: "hls", transferReason: "Manifiesto HLS identificado; su resolución corresponde a la fase 10." };
  }
  if (path.endsWith(".mpd") || type === "application/dash+xml") {
    return { url: rawUrl, availability: "dash", transferReason: "Manifiesto DASH identificado; su resolución corresponde a la fase 10." };
  }
  if (!(["http:", "https:"].includes(url.protocol)) || !url.hostname || url.username || url.password || url.search || url.hash || rawUrl.includes("?") || rawUrl.includes("#")) {
    return { url: rawUrl, availability: "unavailable", transferReason: "Solo se envían enlaces HTTP(S) públicos, sin credenciales, parámetros ni fragmento." };
  }
  const extension = path.split(".").at(-1) ?? "";
  const mediaMime = type.startsWith("audio/") || type.startsWith("video/");
  if (!mediaMime && !extensions.has(extension)) {
    return { url: rawUrl, availability: "unavailable", transferReason: "No se pudo confirmar un archivo de audio o video directo." };
  }
  if (!fileName(url)) {
    return { url: rawUrl, availability: "unavailable", transferReason: "El recurso no tiene un nombre de archivo seguro." };
  }
  return { url: rawUrl, availability: "direct", transferReason: null };
}

export function normalizeMediaCandidate(raw: MediaInput, context: { tabId: number; frameId: number }): MediaCandidate | null {
  if (!raw || typeof raw !== "object" || !Number.isInteger(context.tabId) || context.tabId < 0 || !Number.isInteger(context.frameId) || context.frameId < 0) return null;
  if (typeof raw.playerId !== "string" || !/^player-[a-z0-9-]{1,56}$/.test(raw.playerId)) return null;
  if (raw.kind !== "audio" && raw.kind !== "video") return null;
  const title = cleanTitle(raw.title);
  if (title === null) return null;
  const mimeType = mime(raw.mimeType);
  const state = availability(raw.url, mimeType);
  const width = boundedNumber(raw.width, 1, 16_384);
  const height = boundedNumber(raw.height, 1, 16_384);
  const duration = typeof raw.durationMs === "number" && Number.isSafeInteger(raw.durationMs) && raw.durationMs >= 0 && raw.durationMs <= MAX_DURATION_MS
    ? String(raw.durationMs)
    : null;
  // Poster URLs are deliberately not retained or rendered; arbitrary remote
  // page images must not trigger hidden network requests from the popup.
  const media: MediaMetadata = {
    kind: raw.kind,
    title,
    mime_type: mimeType,
    width,
    height,
    frame_rate_milli: null,
    video_codec: codec(raw.videoCodec),
    audio_codec: codec(raw.audioCodec),
    video_tracks: null,
    audio_tracks: null,
    duration_ms: duration,
    size_bytes: null,
    size_kind: "unknown",
    manifest_kind: state.availability === "hls" ? "hls" : state.availability === "dash" ? "dash" : "none",
  };
  return {
    tabId: context.tabId,
    frameId: context.frameId,
    playerId: raw.playerId,
    url: state.url,
    availability: state.availability,
    transferReason: state.transferReason,
    thumbnail: null,
    media,
  };
}

function validExactSize(value: string | null): string | null {
  if (!value || value.length > 20 || !/^\d+$/.test(value)) return null;
  return decimalU64(value, 20);
}

export function mergeObservedMedia(candidate: MediaCandidate, observation: MediaRequestObservation): MediaCandidate {
  if (
    candidate.tabId !== observation.tabId || candidate.frameId !== observation.frameId ||
    candidate.url !== observation.url || candidate.availability !== "direct"
  ) return candidate;
  try {
    const candidateUrl = new URL(candidate.url);
    const responseOrigin = new URL(observation.responseOrigin).origin;
    const pageOrigin = new URL(observation.pageOrigin).origin;
    if (candidateUrl.origin !== responseOrigin || pageOrigin !== responseOrigin) return candidate;
  } catch { return candidate; }

  const safeMime = mime(observation.mimeType) ?? candidate.media.mime_type;
  const size = observation.statusCode === 200 && !observation.contentEncoding
    ? validExactSize(observation.contentLength)
    : null;
  return {
    ...candidate,
    media: {
      ...candidate.media,
      mime_type: safeMime,
      size_bytes: candidate.media.size_bytes ?? size,
      size_kind: candidate.media.size_bytes
        ? candidate.media.size_kind
        : size ? "exact" : "unknown",
    },
  };
}

export function dedupeMediaCandidates(candidates: MediaCandidate[]): MediaCandidate[] {
  const unique = new Map<string, MediaCandidate>();
  for (const candidate of candidates) {
    const key = `${candidate.tabId}\u0000${candidate.frameId}\u0000${candidate.playerId}\u0000${candidate.url}`;
    const current = unique.get(key);
    if (!current || (current.availability !== "direct" && candidate.availability === "direct")) unique.set(key, candidate);
  }
  return [...unique.values()];
}

export function candidateFileName(candidate: MediaCandidate): string | null {
  if (candidate.availability !== "direct") return null;
  try { return fileName(new URL(candidate.url)); } catch { return null; }
}
