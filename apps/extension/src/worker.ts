import type { ExtensionState, DownloadSnapshot } from "../../../packages/shared-types/protocol";
import { request, watch } from "./bridge";

type Settings = {
  ignoredSites: string[];
  ignoredExtensions: string[];
  ignoredMimes: string[];
  minBytes: number;
  unknownSize: "browser" | "offer";
  suspendedUntil: number;
};
type Pending = { id: string; source: "direct" | "observed"; url: string; name: string; downloadId?: number; phase?: "prepared" | "accepted" | "started" };
type Offer = { downloadId: number; url: string; name: string };
const defaults: Settings = { ignoredSites: [], ignoredExtensions: [], ignoredMimes: [], minBytes: 0, unknownSize: "browser", suspendedUntil: 0 };
let connected = false;
let snapshotId = "";
let processId = 0;
let engine: ExtensionState | null = null;
let watchClose: (() => void) | null = null;
let watchGeneration = 0;
let connecting = false;
let notice = "";
const running = new Set<string>();
const observed = new Set<number>();
const preparing = new Map<string, Promise<boolean>>();
let pendingWrite: Promise<void> = Promise.resolve();
const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

async function settings(): Promise<Settings> {
  const saved = (await chrome.storage.local.get("settings")).settings as Partial<Settings> | undefined;
  return { ...defaults, ...saved };
}
async function pending(): Promise<Pending[]> {
  return ((await chrome.storage.local.get("pending")).pending as Pending[] | undefined) ?? [];
}
async function offers(): Promise<Offer[]> { return ((await chrome.storage.local.get("offers")).offers as Offer[] | undefined) ?? []; }
async function saveOffers(items: Offer[]) { await chrome.storage.local.set({ offers: items.slice(-20) }); await broadcast(); }
async function savePending(item: Pending | null, id?: string) {
  pendingWrite = pendingWrite.catch(() => {}).then(async () => {
    const items = (await pending()).filter((p) => p.id !== (item?.id ?? id));
    if (item) items.push(item);
    await chrome.storage.local.set({ pending: items });
  });
  await pendingWrite;
}
async function broadcast() {
  try { await chrome.runtime.sendMessage({ type: "updated" }); } catch { /* popup closed */ }
}
async function refresh() {
  const wasConnected = connected;
  try {
    const payload = await request("get_extension_state");
    if (payload.kind !== "extension_state") throw Error("Estado incompatible");
    engine = payload.state;
    connected = true;
    await chrome.action.setBadgeText({ text: payload.state.active_count ? String(payload.state.active_count) : "" });
    await chrome.action.setBadgeBackgroundColor({ color: "#2563eb" });
  } catch {
    connected = false;
    engine = null;
    await chrome.action.setBadgeText({ text: "!" });
    await chrome.action.setBadgeBackgroundColor({ color: "#9ca3af" });
  }
  if (connected) void pending().then((items) => items.forEach((item) => { if (!running.has(item.id)) void runCapture(item); }));
  if (wasConnected !== connected || connected) await broadcast();
}
function connect() {
  if (connecting || watchClose) return;
  connecting = true;
  const generation = ++watchGeneration;
  let closed = false;
  watchClose = watch((snap) => {
    if (closed || generation !== watchGeneration) return;
    if (snap.stopping) { connected = false; void broadcast(); return; }
    processId = snap.process_id;
    if (snap.runtime_id !== snapshotId) {
      snapshotId = snap.runtime_id;
      void refresh();
    }
  }, () => { if (!closed && generation === watchGeneration) void refresh(); }, () => {
    closed = true;
    if (generation !== watchGeneration) return;
    connecting = false; watchClose = null;
    connected = false; engine = null; snapshotId = "";
    void chrome.action.setBadgeText({ text: "!" });
    void broadcast();
  });
  connecting = false;
}
function closeWatch() {
  const close = watchClose;
  if (!close) return;
  watchClose = null;
  watchGeneration++;
  close();
}

function eligible(url: string): boolean {
  try {
    const value = new URL(url);
    return ["http:", "https:"].includes(value.protocol) && !!value.hostname &&
      !value.username && !value.password && !value.search && !value.hash && url.length <= 2048;
  } catch { return false; }
}
function safeName(name: string): string {
  const last = name.split(/[\\/]/).pop() ?? "";
  return last.length <= 240 && last.length > 0 && !/[<>:"|?*\u0000-\u001f]/.test(last) ? last : "";
}
function downloadName(item: chrome.downloads.DownloadItem, url: string): string {
  const provided = safeName(item.filename);
  let fromUrl = "";
  try { fromUrl = safeName(decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "")); } catch { /* invalid path encoding */ }
  // Playwright/Chromium may expose a temporary GUID while the final name is
  // still being decided. A URL basename is more useful in that narrow case.
  return (!provided || /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(provided)) && fromUrl ? fromUrl : provided;
}
async function browserItem(id: number) {
  try { return (await chrome.downloads.search({ id }))[0]; } catch { return undefined; }
}
async function fallback(item: Pending) {
  if (item.source !== "direct") return;
  try {
    await chrome.downloads.download({ url: item.url, filename: item.name, conflictAction: "uniquify", saveAs: false });
  } catch { notice = "No se pudo iniciar en el navegador. Abre el enlace original de nuevo."; await broadcast(); }
}
async function checkTransfer(item: Pending): Promise<boolean> {
  const original = item.downloadId === undefined ? undefined : await browserItem(item.downloadId);
  if (item.downloadId !== undefined && original?.state === "interrupted" && item.phase === "started") {
    const status = await request({ get_capture_status: { capture_id: item.id } });
    if (status.kind !== "capture_status" || !status.job || ["failed", "cancelled"].includes(status.job.state) ||
      (BigInt(status.job.durable_bytes) === 0n && status.job.state !== "completed")) {
      throw Error("El original se interrumpió antes de confirmar bytes durables en IDG.");
    }
    return true;
  }
  if (item.downloadId !== undefined && original?.state !== "in_progress") return false;
  const started = await request({ start_capture: { capture_id: item.id } });
  if (started.kind !== "download") return false;
  await savePending({ ...item, phase: "started" });
  // The browser retains the original until IDG actually receives and checkpoints bytes.
  for (let n = 0; n < 60; n++) {
    if (item.downloadId !== undefined && (await browserItem(item.downloadId))?.state !== "in_progress") return false;
    const status = await request({ get_capture_status: { capture_id: item.id } });
    if (status.kind !== "capture_status" || !status.job) return false;
    const job: DownloadSnapshot = status.job;
    if (["failed", "cancelled"].includes(job.state)) return false;
    if (BigInt(job.durable_bytes) > 0n || job.state === "completed") {
      if (item.downloadId === undefined) return true;
      await chrome.downloads.cancel(item.downloadId);
      const after = await browserItem(item.downloadId);
      return after?.state === "interrupted";
    }
    await sleep(500);
  }
  return false;
}
async function runCapture(item: Pending) {
  if (running.has(item.id)) return;
  running.add(item.id);
  let finish = false;
  try {
    // Status is persisted by IDG after the desktop accepts. Worker restarts repeat this query.
    for (let n = 0; n < 240; n++) {
      const status = await request({ get_capture_status: { capture_id: item.id } });
      if (status.kind !== "capture_status") throw Error("Estado incompatible");
      if (status.decision === "rejected") { await fallback(item); finish = true; return; }
      if (status.decision === "accepted") {
        if (status.job && ["failed", "cancelled"].includes(status.job.state)) {
          const originalState = item.downloadId === undefined ? undefined : (await browserItem(item.downloadId))?.state;
          notice = originalState === "interrupted"
            ? "IDG falló y el original de Chromium también se interrumpió. Revisa ambos trabajos antes de repetir."
            : item.source === "observed"
              ? "IDG no pudo continuar; Chromium conserva la descarga original."
              : "IDG no pudo continuar; se intenta abrir el enlace en Chromium.";
          await fallback(item);
          await broadcast();
          finish = true;
          return;
        }
        if (item.phase !== "started") { await savePending({ ...item, phase: "accepted" }); item.phase = "accepted"; }
        const ok = await checkTransfer(item);
        if (!ok) {
          const aborted = await request({ abort_capture: { capture_id: item.id } }).then(() => true, () => false);
          if (!aborted) throw Error("No se confirmó el aborto");
          await fallback(item);
          notice = "La transferencia no se confirmó; la descarga original permanece en el navegador.";
          await broadcast();
        }
        finish = true;
        return;
      }
      await sleep(500);
    }
    // A late acceptance may have been persisted while the last response was lost.
    // Only a confirmed rejection may hand a direct link back to Chromium.
    notice = "No se confirmó la solicitud a tiempo. Reconecta IDG para resolverla antes de repetir el enlace.";
    await broadcast();
  } catch {
    const browserState = item.downloadId === undefined ? undefined : (await browserItem(item.downloadId))?.state;
    notice = browserState === "interrupted"
      ? "El original se interrumpió sin confirmar el traspaso. Reconecta y comprueba el trabajo en IDG."
      : item.source === "observed"
        ? "Se perdió la conexión con IDG; Chromium conserva la descarga original. Reconecta para resolver el traspaso."
        : "No se confirmó el enlace en IDG. Reconecta para resolverlo antes de volver a descargar.";
    await broadcast();
  } finally {
    if (finish) await savePending(null, item.id);
    if (item.downloadId !== undefined) observed.delete(item.downloadId);
    running.delete(item.id);
  }
}
function captureKey(item: Pending) {
  return item.downloadId === undefined ? `direct:${item.url}\u0000${item.name}` : `observed:${item.downloadId}`;
}
async function prepareOnce(item: Pending): Promise<boolean> {
  if (!eligible(item.url) || !safeName(item.name)) return false;
  if ((await pending()).some((existing) => captureKey(existing) === captureKey(item))) {
    notice = "Esta solicitud ya está pendiente; reconecta para conocer su resultado.";
    await broadcast();
    return true;
  }
  await savePending(item);
  try {
    const result = await request({ prepare_capture: { proposal: { id: item.id, url: item.url, name: item.name, source: item.source } } }, item.id);
    if (result.kind !== "capture_status") throw Error("No se confirmó la preparación");
    void request("open_desktop").catch(() => {});
    void runCapture(item);
    return true;
  } catch {
    // The runtime may have committed this proposal even if its reply was lost.
    // Keep its stable ID and query it again after the host reconnects.
    void runCapture(item);
    notice = "No se confirmó la preparación. Reconecta IDG antes de repetir este enlace.";
    await broadcast();
    return false;
  }
}
async function prepare(item: Pending): Promise<boolean> {
  const key = captureKey(item);
  const ongoing = preparing.get(key);
  if (ongoing) return ongoing;
  const task = prepareOnce(item);
  preparing.set(key, task);
  try { return await task; }
  finally { if (preparing.get(key) === task) preparing.delete(key); }
}
async function maybeObserve(item: chrome.downloads.DownloadItem) {
  if (observed.has(item.id) || item.byExtensionId === chrome.runtime.id || item.state !== "in_progress") return;
  observed.add(item.id);
  try {
    if (!await chrome.permissions.contains({ permissions: ["downloads"] })) return;
    if (!engine) await refresh();
    const prefs = await settings();
    if (!connected || engine?.autopick_mode === "browser" || Date.now() < prefs.suspendedUntil) return;
    if ((await pending()).some((p) => p.downloadId === item.id) || (await offers()).some((o) => o.downloadId === item.id)) return;
    if (!eligible(item.finalUrl || item.url)) return;
    const url = item.finalUrl || item.url;
    const sites = [new URL(url).origin];
    try { if (item.referrer) sites.push(new URL(item.referrer).origin); } catch { /* no referrer */ }
    const name = downloadName(item, url);
    if (!name) return;
    const dot = name.lastIndexOf(".");
    const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
    if (sites.some((site) => prefs.ignoredSites.includes(site)) || prefs.ignoredExtensions.includes(ext) || prefs.ignoredMimes.includes(item.mime.toLowerCase())) return;
    if (item.totalBytes < 0 && prefs.unknownSize === "browser") return;
    if (item.totalBytes >= 0 && item.totalBytes < 1024 * 1024) return;
    if (item.totalBytes >= 0 && item.totalBytes < prefs.minBytes) return;
    // downloads.DownloadItem has no method or request-body field. Keep unknown
    // observed requests in Chromium instead of replaying them as an improvised GET.
    notice = "Chromium no informa el método HTTP de esta descarga. Se conserva en el navegador; usa un enlace directo si confirmas que es un GET público y repetible.";
    await broadcast();
  } finally { observed.delete(item.id); }
}
async function menu() {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({ id: "idg-link", title: "Enviar enlace directo a IDG", contexts: ["link"] });
}
chrome.contextMenus.onClicked.addListener((info) => {
  const url = info.menuItemId === "idg-link" ? info.linkUrl : undefined;
  if (!url || !eligible(url)) { notice = "Este enlace requiere el navegador (URL o sesión no transferible)."; void broadcast(); return; }
  let name = "";
  try { name = safeName(decodeURIComponent(new URL(url).pathname.split("/").pop() || "descarga.bin")); } catch { return; }
  if (!name) return;
  void prepare({ id: crypto.randomUUID(), source: "direct", url, name }).then((ok) => {
    if (!ok) { notice = "No se confirmó el enlace en IDG. Abre el enlace en Chromium si quieres continuar allí."; void broadcast(); }
  });
});
function downloadCreated(item: chrome.downloads.DownloadItem) { void maybeObserve(item); }
function downloadChanged(delta: chrome.downloads.DownloadDelta) {
  if (delta.state?.current === "complete" || delta.state?.current === "interrupted") {
    void offers().then((items) => saveOffers(items.filter((entry) => entry.downloadId !== delta.id)));
  } else if (delta.filename || delta.totalBytes || delta.mime) {
    void browserItem(delta.id).then((item) => { if (item) void maybeObserve(item); });
  }
}
let downloadsAttached = false;
async function attachDownloads() {
  if (downloadsAttached || !await chrome.permissions.contains({ permissions: ["downloads"] }) || !chrome.downloads) return;
  chrome.downloads.onCreated.addListener(downloadCreated);
  chrome.downloads.onChanged.addListener(downloadChanged);
  downloadsAttached = true;
}
chrome.runtime.onInstalled.addListener(() => { void menu(); });
chrome.permissions.onAdded.addListener(() => { void attachDownloads(); void menu(); });
chrome.permissions.onRemoved.addListener(() => {
  if (downloadsAttached && chrome.downloads) {
    chrome.downloads.onCreated.removeListener(downloadCreated);
    chrome.downloads.onChanged.removeListener(downloadChanged);
  }
  downloadsAttached = false;
  void menu();
});

chrome.runtime.onMessage.addListener((message: { type: string; [key: string]: unknown }, _sender, respond) => {
  if (message.type === "updated") return false;
  void (async () => {
    if (message.type === "reconnect") { closeWatch(); connect(); await refresh(); }
    if (message.type === "mode" && typeof message.mode === "string") {
      const result = await request({ set_extension_mode: { mode: message.mode } });
      if (result.kind !== "extension_state") throw Error("No se guardó el modo.");
      engine = result.state;
    }
    if (message.type === "settings" && typeof message.settings === "object") {
      const next = { ...await settings(), ...message.settings as Partial<Settings> };
      await chrome.storage.local.set({ settings: next });
    }
    if (message.type === "permission") { await attachDownloads(); await menu(); }
    if (message.type === "acceptOffer" && typeof message.downloadId === "number") {
      const all = await offers();
      const offer = all.find((entry) => entry.downloadId === message.downloadId);
      if (!offer || (await browserItem(offer.downloadId))?.state !== "in_progress") throw Error("Esta descarga ya no está activa en Chromium.");
      await saveOffers(all.filter((entry) => entry.downloadId !== message.downloadId));
      notice = "Chromium no informa el método HTTP de esta descarga. Se conserva en el navegador; usa un enlace directo si confirmas que es un GET público y repetible.";
      await broadcast();
      throw Error(notice);
    }
    if (message.type === "open") await request("open_desktop");
    if (message.type === "pause" && typeof message.id === "string") await request({ pause_download: { job_id: message.id } });
    if (message.type === "resume" && typeof message.id === "string") await request({ resume_download: { job_id: message.id } });
    if (message.type === "direct" && typeof message.url === "string" && typeof message.name === "string") {
      if (!await prepare({ id: crypto.randomUUID(), source: "direct", url: message.url, name: message.name })) throw Error("IDG no aceptó el enlace; ábrelo en el navegador.");
    }
    if (message.type === "state" && !engine) await refresh();
    respond({ ok: true, connected, engine, processId, settings: await settings(), captureEnabled: await chrome.permissions.contains({ permissions: ["downloads"] }), offers: await offers(), notice });
    if (message.type !== "state") await broadcast();
  })().catch((error) => respond({ ok: false, error: error instanceof Error ? error.message : "Acción no disponible" }));
  return true;
});
connect();
void attachDownloads();
void menu();
void pending().then((items) => items.forEach((item) => { void runCapture(item); }));
