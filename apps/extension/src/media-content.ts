import { normalizeMediaCandidate } from "./media-model";

type MediaSourceInput = {
  playerId: string;
  url: string;
  kind: "audio" | "video";
  title: string;
  mimeType: string | null;
  videoCodec: string | null;
  audioCodec: string | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
};
type MediaSettings = { globalEnabled?: boolean; siteEnabled?: Record<string, boolean> };
type ContentApi = {
  runtime: { sendMessage(message: unknown): Promise<unknown> };
  storage: {
    local: { get(key: string): Promise<Record<string, unknown>> };
    onChanged: { addListener(listener: (changes: unknown, area: string) => void): void };
  };
};
type MediaNode = HTMLMediaElement;
type OverlayRecord = { host: HTMLDivElement; button: HTMLButtonElement; raw: MediaSourceInput };

function extensionApi(): ContentApi {
  const root = globalThis as typeof globalThis & { browser?: ContentApi; chrome?: ContentApi };
  const api = root.browser ?? root.chrome;
  if (!api) throw new Error("La API de extensión no está disponible.");
  return api;
}

function absoluteUrl(value: string, base: string): string {
  try { return new URL(value, base).href; } catch { return value; }
}

function parseType(value: string | null, kind: "audio" | "video") {
  const mimeType = value?.split(";", 1)[0].trim() || null;
  const match = value && value.length <= 512
    ? /(?:^|;)\s*codecs\s*=\s*(?:"([^"]*)"|'([^']*)'|([^;]*))/i.exec(value)
    : null;
  const codecs = (match?.[1] ?? match?.[2] ?? match?.[3] ?? "")
    .split(",")
    .map((codec) => codec.trim())
    .filter((codec) => /^[a-z0-9._-]{1,100}$/i.test(codec));
  const videoCodec = codecs.find((codec) => /^(avc|hvc|hev|vp0?8|vp9|av01|theora|mp4v)/i.test(codec)) ?? null;
  const audioCodec = codecs.find((codec) => /^(mp4a|aac|ac-3|ec-3|opus|vorbis|flac|alac|dts)/i.test(codec)) ?? null;
  return {
    mimeType,
    videoCodec: kind === "video" ? videoCodec : null,
    audioCodec: audioCodec ?? (kind === "audio" ? videoCodec : null),
  };
}

const root = globalThis as typeof globalThis & {
  __idgMediaScan?: () => Promise<MediaSourceInput[]>;
  __idgMediaInstalled?: boolean;
};

if (!root.__idgMediaInstalled) {
  root.__idgMediaInstalled = true;
  const api = extensionApi();
  const active = new Set<MediaNode>();
  const overlays = new WeakMap<MediaNode, OverlayRecord>();
  const playerIds = new WeakMap<MediaNode, string>();
  const watched = new WeakSet<MediaNode>();
  let nextPlayer = 0;
  let enabled = false;
  let observer: MutationObserver | null = null;
  let resizeObserver: ResizeObserver | null = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => scheduleLayout());
  let frame = 0;

  function settingsEnabled(settings: MediaSettings): boolean {
    return settings.siteEnabled?.[location.origin] ?? settings.globalEnabled === true;
  }

  function scheduleLayout() {
    if (typeof requestAnimationFrame !== "function") {
      for (const element of active) position(element);
      return;
    }
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      for (const element of active) position(element);
    });
  }

  function ensureOverlay(element: MediaNode, raw: MediaSourceInput) {
    const prior = overlays.get(element);
    if (prior) {
      prior.raw = raw;
      const candidate = normalizeMediaCandidate(raw, { tabId: 0, frameId: 0 });
      prior.button.disabled = candidate?.availability !== "direct";
      prior.button.textContent = candidate?.availability === "direct" ? "Enviar a IDG" : "Medio detectado";
      prior.button.title = candidate?.transferReason ?? "Enviar el archivo original a IDG; requiere confirmación en el escritorio.";
      return;
    }
    const host = document.createElement("div");
    host.dataset.idgMediaOverlay = "true";
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `:host{all:initial;position:fixed;z-index:2147483647;font-family:system-ui,sans-serif}button{font:600 12px system-ui,sans-serif;color:#fff;background:#111827;border:1px solid #475569;border-radius:6px;padding:7px 10px;box-shadow:0 2px 10px #0005;cursor:pointer}button:focus-visible{outline:2px solid #60a5fa;outline-offset:2px}button:disabled{opacity:.76;cursor:default}`;
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("aria-label", "Enviar este medio a IDG");
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const current = overlays.get(element);
      if (!current || current.button.disabled) return;
      current.button.disabled = true;
      current.button.textContent = "Enviando…";
      void api.runtime.sendMessage({ type: "idg-media-capture", candidate: current.raw }).then((reply) => {
        const result = reply as { ok?: boolean; error?: string } | undefined;
        current.button.disabled = result?.ok === true;
        current.button.textContent = result?.ok ? "Revisa IDG" : "Enviar a IDG";
        current.button.title = result?.ok ? "Confirma el medio en la aplicación IDG." : result?.error ?? "No se pudo enviar el medio.";
      }).catch(() => {
        current.button.disabled = false;
        current.button.textContent = "Enviar a IDG";
        current.button.title = "No se pudo conectar con la extensión.";
      });
    });
    shadow.append(style, button);
    const candidate = normalizeMediaCandidate(raw, { tabId: 0, frameId: 0 });
    button.disabled = candidate?.availability !== "direct";
    button.textContent = candidate?.availability === "direct" ? "Enviar a IDG" : "Medio detectado";
    button.title = candidate?.transferReason ?? "Enviar el archivo original a IDG; requiere confirmación en el escritorio.";
    const record = { host, button, raw };
    overlays.set(element, record);
    active.add(element);
    (document.documentElement ?? document.body).append(host);
    resizeObserver?.observe(element);
    position(element);
  }

  function position(element: MediaNode) {
    const record = overlays.get(element);
    if (!record || !enabled || !element.isConnected) {
      record?.host.remove();
      active.delete(element);
      return;
    }
    const rect = element.getBoundingClientRect();
    const visible = rect.width > 40 && rect.height > 30 && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
    if (!visible) { record.host.style.display = "none"; return; }
    record.host.style.display = "block";
    const fullscreen = document.fullscreenElement;
    if (fullscreen && fullscreen !== element && fullscreen.contains(element)) {
      if (record.host.parentElement !== fullscreen) fullscreen.append(record.host);
      const fullRect = fullscreen.getBoundingClientRect();
      record.host.style.position = "absolute";
      record.host.style.left = `${Math.max(0, rect.right - fullRect.left - 128)}px`;
      record.host.style.top = `${Math.max(0, rect.top - fullRect.top + 10)}px`;
    } else if (!fullscreen) {
      if (record.host.parentElement !== document.documentElement) document.documentElement.append(record.host);
      record.host.style.position = "fixed";
      record.host.style.left = `${Math.max(4, Math.min(innerWidth - 132, rect.right - 124))}px`;
      record.host.style.top = `${Math.max(4, Math.min(innerHeight - 42, rect.top + 8))}px`;
    } else {
      // A media element in fullscreen may not host an overlay. Popup detection
      // remains available, so do not insert a button over browser-owned controls.
      record.host.style.display = "none";
    }
  }

  function refreshMedia() {
    collect();
    scheduleLayout();
  }

  function collect(): MediaSourceInput[] {
    const result: MediaSourceInput[] = [];
    const players = [...document.querySelectorAll<MediaNode>("video, audio")];
    const currentPlayers = new Set(players);
    for (const element of players) {
      let player = playerIds.get(element);
      if (!player) { player = `player-${++nextPlayer}`; playerIds.set(element, player); }
      const kind = element.tagName.toLowerCase() === "audio" ? "audio" : "video";
      const sources: Array<{ url: string; mimeType: string | null; videoCodec: string | null; audioCodec: string | null }> = [];
      const current = element.currentSrc || element.getAttribute("src");
      if (current) sources.push({ url: absoluteUrl(current, document.baseURI), ...parseType(element.getAttribute("type"), kind) });
      for (const source of element.querySelectorAll("source[src]")) {
        const url = source.getAttribute("src");
        if (url) sources.push({ url: absoluteUrl(url, document.baseURI), ...parseType(source.getAttribute("type"), kind) });
      }
      const video = kind === "video" ? element as HTMLVideoElement : null;
      const durationMs = Number.isFinite(element.duration) && element.duration >= 0 && element.duration <= 604_800
        ? Math.round(element.duration * 1000)
        : null;
      const playerSources: MediaSourceInput[] = [];
      for (const source of sources) {
        const raw: MediaSourceInput = {
          playerId: player,
          url: source.url,
          kind,
          title: document.title,
          mimeType: source.mimeType,
          videoCodec: source.videoCodec,
          audioCodec: source.audioCodec,
          width: video?.videoWidth && video.videoWidth <= 16_384 ? video.videoWidth : null,
          height: video?.videoHeight && video.videoHeight <= 16_384 ? video.videoHeight : null,
          durationMs,
        };
        result.push(raw);
        playerSources.push(raw);
      }
      if (!sources.length && current?.startsWith("blob:")) {
        const raw: MediaSourceInput = { playerId: player, url: current, kind, title: document.title, mimeType: null, videoCodec: null, audioCodec: null, width: null, height: null, durationMs };
        result.push(raw);
        playerSources.push(raw);
      }
      if (enabled && playerSources.length) {
        const transferable = playerSources.find((raw) => normalizeMediaCandidate(raw, { tabId: 0, frameId: 0 })?.availability === "direct");
        ensureOverlay(element, transferable ?? playerSources[0]);
      }
      if (!watched.has(element)) {
        watched.add(element);
        element.addEventListener("loadedmetadata", refreshMedia);
        element.addEventListener("durationchange", refreshMedia);
        resizeObserver?.observe(element);
      }
    }
    for (const element of active) {
      if (!currentPlayers.has(element)) {
        overlays.get(element)?.host.remove();
        resizeObserver?.unobserve(element);
        active.delete(element);
      }
    }
    return result;
  }

  function activate(next: boolean) {
    enabled = next;
    if (enabled) {
      observer ??= new MutationObserver((records) => {
        if (records.length > 0 && records.every((record) =>
          record.type === "childList" && record.removedNodes.length === 0 && record.addedNodes.length > 0 &&
          [...record.addedNodes].every((node) => node instanceof Element && node.hasAttribute("data-idg-media-overlay")))) return;
        collect();
        scheduleLayout();
      });
      if (!observer.takeRecords().length) observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["src", "type"] });
      collect();
      scheduleLayout();
    } else {
      observer?.disconnect();
      for (const element of active) overlays.get(element)?.host.remove();
      active.clear();
    }
  }

  async function syncSettings() {
    const saved = (await api.storage.local.get("idg_media_settings")).idg_media_settings as MediaSettings | undefined;
    const next = settingsEnabled(saved ?? {});
    activate(next);
    try {
      await api.runtime.sendMessage({ type: "idg-media-observe-tab", enabled: next, pageOrigin: location.origin });
    } catch { /* The popup can retry after the user invokes the extension. */ }
  }

  window.addEventListener("scroll", scheduleLayout, true);
  window.addEventListener("resize", scheduleLayout);
  document.addEventListener("fullscreenchange", scheduleLayout);
  api.storage.onChanged.addListener((_changes, area) => { if (area === "local") void syncSettings(); });
  const ready = syncSettings();
  root.__idgMediaScan = async () => { await ready; return collect(); };
  // Used by content scripts after an observed setting change; no page content
  // is read until the user invokes the extension on this tab.
  void api;
}
