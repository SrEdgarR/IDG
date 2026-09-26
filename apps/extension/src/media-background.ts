import type { CaptureProposal } from "../../../packages/shared-types/protocol";
import { request } from "./bridge";
import { getBrowserApi } from "./browser-api";
import {
  candidateFileName,
  mergeObservedMedia,
  normalizeMediaCandidate,
  type MediaCandidate,
  type MediaRequestObservation,
} from "./media-model";

const api = getBrowserApi();
const observations = new Map<number, MediaRequestObservation[]>();
const activeMediaTabs = new Map<number, string>();
const submitting = new Set<string>();

function header(details: chrome.webRequest.OnHeadersReceivedDetails, name: string): string | null {
  const value = details.responseHeaders?.find((item) => item.name.toLowerCase() === name)?.value;
  return typeof value === "string" && value.length <= 256 ? value : null;
}

function observedResponse(details: chrome.webRequest.OnHeadersReceivedDetails): undefined {
  if (details.tabId < 0 || details.frameId < 0 || details.method !== "GET") return;
  let url: URL;
  try { url = new URL(details.url); } catch { return; }
  if (!(["http:", "https:"].includes(url.protocol)) || url.username || url.password || url.search || url.hash) return;
  if (activeMediaTabs.get(details.tabId) !== url.origin) return;
  const item: MediaRequestObservation = {
    tabId: details.tabId,
    frameId: details.frameId,
    url: details.url,
    pageOrigin: "",
    responseOrigin: url.origin,
    mimeType: header(details, "content-type"),
    contentLength: header(details, "content-length"),
    statusCode: details.statusCode,
    contentEncoding: header(details, "content-encoding"),
  };
  const list = observations.get(details.tabId) ?? [];
  list.push(item);
  observations.set(details.tabId, list.slice(-100));
}

if (api.webRequest?.onHeadersReceived) {
  // No host_permissions are declared. The browser only delivers events for an
  // origin temporarily authorized for this tab by activeTab after user action.
  api.webRequest.onHeadersReceived.addListener(
    observedResponse,
    { urls: ["http://*/*", "https://*/*"], types: ["media"] },
    ["responseHeaders"],
  );
}
api.tabs?.onUpdated?.addListener((_tabId, change) => {
  if (change.url) {
    observations.delete(_tabId);
    activeMediaTabs.delete(_tabId);
  }
});
api.tabs?.onRemoved?.addListener((tabId) => {
  observations.delete(tabId);
  activeMediaTabs.delete(tabId);
});

async function waitForAcceptance(id: string, first: unknown): Promise<void> {
  let state = first as { kind?: string; decision?: string };
  if (state.kind !== "capture_status") throw new Error("IDG devolvió una respuesta incompatible.");
  if (state.decision === "rejected") throw new Error("IDG rechazó este medio.");
  if (state.decision === "pending") await request("open_desktop");
  for (let attempt = 0; attempt < 220; attempt++) {
    if (state.decision !== "accepted") {
      state = await request({ get_capture_status: { capture_id: id } }) as typeof state;
    }
    if (state.kind !== "capture_status") throw new Error("IDG devolvió una respuesta incompatible.");
    if (state.decision === "rejected") throw new Error("La solicitud se canceló en IDG.");
    if (state.decision === "accepted") {
      const started = await request({ start_capture: { capture_id: id } });
      if (started.kind !== "download") throw new Error("IDG no confirmó el inicio del medio.");
      return;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("IDG no confirmó el medio a tiempo. Revisa la aplicación antes de repetirlo.");
}

function safeCandidate(value: unknown, sender: chrome.runtime.MessageSender, pageOrigin?: unknown): MediaCandidate {
  if (!value || typeof value !== "object") throw new Error("El candidato multimedia no es válido.");
  const record = value as Record<string, unknown>;
  const fromPage = typeof sender.tab?.id === "number";
  const tabId = fromPage ? sender.tab!.id : record.tabId;
  const frameId = fromPage ? sender.frameId ?? 0 : record.frameId;
  if (typeof tabId !== "number" || typeof frameId !== "number") throw new Error("No se pudo identificar la pestaña del medio.");
  const media = record.media && typeof record.media === "object" ? record.media as Record<string, unknown> : null;
  const raw = media ? {
    playerId: record.playerId,
    url: record.url,
    kind: media.kind,
    title: media.title,
    mimeType: media.mime_type,
    videoCodec: media.video_codec,
    audioCodec: media.audio_codec,
    width: media.width,
    height: media.height,
    durationMs: typeof media.duration_ms === "string" && /^\d{1,9}$/.test(media.duration_ms)
      ? Number(media.duration_ms)
      : null,
  } : record;
  const candidate = normalizeMediaCandidate(raw, { tabId, frameId });
  if (!candidate) throw new Error("Los datos del medio exceden los límites permitidos.");
  let origin = typeof pageOrigin === "string" ? pageOrigin : "";
  if (!origin && fromPage && typeof sender.tab?.url === "string") {
    try { origin = new URL(sender.tab.url).origin; } catch { /* no page origin available */ }
  }
  if (origin) {
    const list = observations.get(candidate.tabId) ?? [];
    for (const observation of list) {
      const enriched = mergeObservedMedia(candidate, { ...observation, pageOrigin: origin });
      if (enriched !== candidate) return enriched;
    }
  }
  return candidate;
}

async function submitMedia(raw: unknown, sender: chrome.runtime.MessageSender, pageOrigin?: unknown) {
  const candidate = safeCandidate(raw, sender, pageOrigin);
  let requestedOrigin = "";
  try {
    requestedOrigin = new URL(typeof pageOrigin === "string" ? pageOrigin : sender.tab?.url ?? "").origin;
  } catch { /* invalid origin */ }
  if (!requestedOrigin || activeMediaTabs.get(candidate.tabId) !== requestedOrigin) {
    throw new Error("Activa la detección para este sitio desde el popup antes de enviar el medio.");
  }
  if (candidate.availability !== "direct" || candidate.media.manifest_kind !== "none") {
    throw new Error(candidate.transferReason ?? "Este medio no es un archivo directo transferible.");
  }
  const name = candidateFileName(candidate);
  if (!name) throw new Error("El enlace no proporciona un nombre de archivo seguro.");
  const key = `${candidate.url}\u0000${name}`;
  if (submitting.has(key)) throw new Error("Este medio ya se está enviando a IDG.");
  submitting.add(key);
  try {
    const id = crypto.randomUUID();
    const proposal: CaptureProposal = {
      id,
      url: candidate.url,
      name,
      source: "media",
      media: candidate.media,
    };
    const prepared = await request({ prepare_capture: { proposal } }, id);
    await waitForAcceptance(id, prepared);
  } finally {
    submitting.delete(key);
  }
}

type MediaMessage = { type?: unknown; candidate?: unknown; tabId?: unknown; pageOrigin?: unknown; enabled?: unknown };

export function handleMediaMessage(value: unknown, sender: chrome.runtime.MessageSender): Promise<unknown> | undefined {
  const message = value && typeof value === "object" ? value as MediaMessage : {};
  if (message?.type === "idg-media-observe-tab") {
    const tabId = sender.tab?.id ?? message.tabId;
    let origin = "";
    if (sender.tab?.id !== undefined && typeof sender.tab.url === "string") {
      try { origin = new URL(sender.tab.url).origin; } catch { /* restricted frame */ }
    } else if (typeof message.pageOrigin === "string") {
      try { origin = new URL(message.pageOrigin).origin; } catch { /* invalid origin */ }
    }
    let parsedOrigin: URL;
    try { parsedOrigin = new URL(origin); } catch {
      return Promise.resolve({ ok: false });
    }
    if (typeof tabId !== "number" || !["http:", "https:"].includes(parsedOrigin.protocol) || parsedOrigin.origin !== origin) {
      return Promise.resolve({ ok: false });
    }
    if (message.enabled === true) activeMediaTabs.set(tabId, origin);
    else {
      activeMediaTabs.delete(tabId);
      observations.delete(tabId);
    }
    return Promise.resolve({ ok: true });
  }
  if (message?.type === "idg-media-observations") {
    if (typeof message.tabId !== "number" || typeof message.pageOrigin !== "string") {
      return Promise.resolve({ ok: false, error: "La pestaña actual no está disponible." });
    }
    let pageOrigin: string;
    try {
      const parsed = new URL(message.pageOrigin);
      if (!["http:", "https:"].includes(parsed.protocol) || parsed.origin !== message.pageOrigin) throw new Error();
      pageOrigin = parsed.origin;
    } catch {
      return Promise.resolve({ ok: false, error: "El origen de la pestaña no es válido." });
    }
    if (activeMediaTabs.get(message.tabId) !== pageOrigin) {
      return Promise.resolve({ ok: false, observations: [] });
    }
    const items = (observations.get(message.tabId) ?? []).filter((item) => {
      try { return new URL(item.responseOrigin).origin === pageOrigin; }
      catch { return false; }
    });
    return Promise.resolve({ ok: true, observations: items.map((item) => ({ ...item, pageOrigin })) });
  }
  if (message?.type !== "idg-media-capture") return undefined;
  return submitMedia(message.candidate, sender, message.pageOrigin).then(
    () => ({ ok: true }),
    (error: unknown) => ({ ok: false, error: error instanceof Error ? error.message : "No se pudo enviar el medio a IDG." }),
  );
}
