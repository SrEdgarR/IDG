import { getBrowserApi } from "./browser-api";
import {
  dedupeMediaCandidates,
  mergeObservedMedia,
  normalizeMediaCandidate,
  type MediaCandidate,
  type MediaRequestObservation,
} from "./media-model";

type BrowserTab = { id?: number; url?: string; title?: string };
type MediaSettings = { globalEnabled: boolean; siteEnabled: Record<string, boolean> };
type InjectionResult = { frameId: number; result?: unknown };
const api = getBrowserApi();
const emptySettings: MediaSettings = { globalEnabled: false, siteEnabled: {} };

async function scanInjectedPage(): Promise<unknown[]> {
  const root = globalThis as typeof globalThis & { __idgMediaScan?: () => unknown[] | Promise<unknown[]> };
  const result = await (root.__idgMediaScan?.() ?? []);
  return Array.isArray(result) ? result : [];
}

function formatDuration(value: string | null): string {
  if (!value || !/^\d+$/.test(value)) return "duración desconocida";
  const seconds = Math.floor(Number(value) / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function describe(candidate: MediaCandidate): string {
  const dimensions = candidate.media.width && candidate.media.height
    ? `${candidate.media.width} × ${candidate.media.height}`
    : "resolución desconocida";
  const mime = candidate.media.mime_type ?? "MIME desconocido";
  const size = candidate.media.size_bytes
    ? ` · ${candidate.media.size_bytes} bytes (${candidate.media.size_kind === "exact" ? "respuesta HTTP" : "estimado"})`
    : " · tamaño desconocido";
  const codecs = [candidate.media.video_codec, candidate.media.audio_codec]
    .filter((value): value is string => value !== null)
    .join(" · ");
  const fps = candidate.media.frame_rate_milli
    ? ` · ${(candidate.media.frame_rate_milli / 1000).toFixed(3).replace(/0+$/, "").replace(/\.$/, "")} FPS`
    : "";
  return `${candidate.media.kind === "video" ? "Vídeo" : "Audio"} · ${mime} · ${dimensions} · ${formatDuration(candidate.media.duration_ms)}${fps}${codecs ? ` · ${codecs}` : ""}${size}`;
}

function createCandidateRow(candidate: MediaCandidate, pageOrigin: string, notice: HTMLElement): HTMLLIElement {
  const row = document.createElement("li");
  row.className = "media-candidate";
  const title = document.createElement("strong");
  title.textContent = candidate.media.title || "Medio sin título";
  const details = document.createElement("p");
  details.textContent = describe(candidate);
  row.append(title, details);
  if (candidate.availability !== "direct") {
    const reason = document.createElement("p");
    reason.className = "media-limitation";
    reason.textContent = candidate.transferReason ?? "Este medio no es transferible en esta fase.";
    row.append(reason);
  }
  const button = document.createElement("button");
  button.type = "button";
  button.disabled = candidate.availability !== "direct";
  button.textContent = candidate.availability === "direct" ? "Seleccionar y continuar en IDG" : "No transferible en fase 09";
  button.addEventListener("click", async () => {
    if (button.disabled) return;
    button.disabled = true;
    notice.textContent = "Enviando el medio seleccionado a IDG para confirmación…";
    try {
      const result = await api.runtime.sendMessage({
        type: "idg-media-capture",
        candidate,
        pageOrigin,
      }) as { ok?: boolean; error?: string } | undefined;
      if (!result?.ok) throw new Error(result?.error ?? "No se pudo enviar el medio a IDG.");
      notice.textContent = "Solicitud enviada. Revisa y confirma los datos del medio en la aplicación IDG.";
      button.textContent = "Revisa IDG";
    } catch (error) {
      notice.textContent = error instanceof Error ? error.message : "No se pudo enviar el medio a IDG.";
      button.disabled = false;
    }
  });
  row.append(button);
  return row;
}

export function initializeMediaPopup(): void {
  const globalInput = document.querySelector<HTMLInputElement>("#media-global");
  const siteInput = document.querySelector<HTMLInputElement>("#media-site");
  const resetSite = document.querySelector<HTMLButtonElement>("#media-site-reset");
  const scanButton = document.querySelector<HTMLButtonElement>("#media-scan");
  const notice = document.querySelector<HTMLElement>("#media-notice");
  const list = document.querySelector<HTMLUListElement>("#media-candidates");
  const siteLabel = document.querySelector<HTMLElement>("#media-site-label");
  if (!globalInput || !siteInput || !resetSite || !scanButton || !notice || !list || !siteLabel) return;
  const globalControl = globalInput as HTMLInputElement;
  const siteControl = siteInput as HTMLInputElement;
  const resetControl = resetSite as HTMLButtonElement;
  const scanControl = scanButton as HTMLButtonElement;
  const noticeText = notice as HTMLElement;
  const candidateList = list as HTMLUListElement;
  const labelText = siteLabel as HTMLElement;

  let settings = emptySettings;
  let tab: BrowserTab | undefined;
  let origin = "";
  let generation = 0;

  async function pageContext(): Promise<void> {
    tab = (await api.tabs.query({ active: true, currentWindow: true }))[0];
    origin = "";
    if (typeof tab?.id !== "number" || typeof tab.url !== "string") return;
    try {
      const page = new URL(tab.url);
      if (["http:", "https:"].includes(page.protocol)) origin = page.origin;
    } catch { /* restricted browser page */ }
  }

  async function loadSettings(): Promise<void> {
    const stored = (await api.storage.local.get("idg_media_settings")).idg_media_settings as Partial<MediaSettings> | undefined;
    settings = {
      globalEnabled: stored?.globalEnabled === true,
      siteEnabled: stored?.siteEnabled && typeof stored.siteEnabled === "object" ? stored.siteEnabled : {},
    };
  }

  function isEnabled(): boolean {
    return origin ? settings.siteEnabled[origin] ?? settings.globalEnabled : false;
  }

  function showUnavailablePage(): void {
    noticeText.textContent = "Esta pestaña no permite detectar medios (página interna o acceso restringido del navegador).";
    scanControl.disabled = true;
  }

  async function scan(): Promise<void> {
    const current = ++generation;
    candidateList.replaceChildren();
    if (!tab || typeof tab.id !== "number" || !origin) { showUnavailablePage(); return; }
    if (!isEnabled()) {
      noticeText.textContent = "Activa la detección global o para este sitio. No se analiza la página mientras está desactivada.";
      return;
    }
    scanControl.disabled = true;
    noticeText.textContent = "Analizando los elementos multimedia de esta pestaña…";
    try {
      const target = { tabId: tab.id, allFrames: true };
      await api.scripting.executeScript({ target, files: ["media-content.js"] });
      const results = await api.scripting.executeScript({ target, func: scanInjectedPage }) as InjectionResult[];
      if (current !== generation) return;
      const candidates: MediaCandidate[] = [];
      for (const result of results) {
        if (!Array.isArray(result.result)) continue;
        for (const raw of result.result) {
          const candidate = normalizeMediaCandidate(raw as never, { tabId: tab.id, frameId: result.frameId });
          if (candidate) candidates.push(candidate);
        }
      }
      let observed: MediaRequestObservation[] = [];
      try {
        const response = await api.runtime.sendMessage({ type: "idg-media-observations", tabId: tab.id, pageOrigin: origin }) as {
          ok?: boolean; observations?: MediaRequestObservation[];
        } | undefined;
        if (response?.ok && Array.isArray(response.observations)) observed = response.observations;
      } catch { /* DOM candidates remain usable without response headers. */ }
      const enriched = dedupeMediaCandidates(candidates.map((candidate) => {
        let value = candidate;
        for (const item of observed) value = mergeObservedMedia(value, item);
        return value;
      }));
      for (const candidate of enriched) candidateList.append(createCandidateRow(candidate, origin, noticeText));
      noticeText.textContent = enriched.length
        ? `${enriched.length} medio(s) de esta pestaña. ${api.webRequest ? "Los encabezados observables solo completan datos del mismo origen; no se leen cuerpos ni credenciales." : "Este navegador no expone encabezados de medios con el acceso temporal disponible; esos datos permanecerán desconocidos."}`
        : "No se encontraron elementos de audio o video con URL accesible en esta pestaña.";
    } catch {
      if (current === generation) noticeText.textContent = "El navegador no permitió analizar esta pestaña o alguno de sus marcos. No se solicitaron permisos de otros sitios.";
    } finally {
      if (current === generation) scanControl.disabled = !isEnabled();
    }
  }

  async function refresh(scanAfter = false): Promise<void> {
    await Promise.all([loadSettings(), pageContext()]);
    if (typeof tab?.id === "number" && origin) {
      try {
        await api.runtime.sendMessage({
          type: "idg-media-observe-tab",
          enabled: isEnabled(),
          tabId: tab.id,
          pageOrigin: origin,
        });
      } catch { /* DOM scanning can still work without response metadata. */ }
    }
    globalControl.checked = settings.globalEnabled;
    const override = origin ? settings.siteEnabled[origin] : undefined;
    siteControl.checked = origin ? override ?? settings.globalEnabled : false;
    siteControl.disabled = !origin;
    labelText.textContent = origin ? `Detectar medios en ${origin}` : "Sitio actual no disponible";
    resetControl.hidden = !origin || override === undefined;
    scanControl.disabled = !isEnabled();
    if (!origin) showUnavailablePage();
    else if (scanAfter && isEnabled()) await scan();
    else if (!isEnabled()) noticeText.textContent = "La detección está desactivada. El permiso temporal solo se usa al abrir la extensión en una pestaña web.";
  }

  globalControl.addEventListener("change", () => {
    settings = { ...settings, globalEnabled: globalControl.checked };
    void api.storage.local.set({ idg_media_settings: settings }).then(() => refresh(globalControl.checked));
  });
  siteControl.addEventListener("change", () => {
    if (!origin) return;
    settings = { ...settings, siteEnabled: { ...settings.siteEnabled, [origin]: siteControl.checked } };
    void api.storage.local.set({ idg_media_settings: settings }).then(() => refresh(siteControl.checked));
  });
  resetControl.addEventListener("click", () => {
    if (!origin) return;
    const siteEnabled = { ...settings.siteEnabled };
    delete siteEnabled[origin];
    settings = { ...settings, siteEnabled };
    void api.storage.local.set({ idg_media_settings: settings }).then(() => refresh(settings.globalEnabled));
  });
  scanControl.addEventListener("click", () => void scan());
  void refresh(true);
}
