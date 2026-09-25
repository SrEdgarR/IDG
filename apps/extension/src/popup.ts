import type { ExtensionState } from "../../../packages/shared-types/protocol";

type Settings = { ignoredSites: string[]; ignoredExtensions: string[]; ignoredMimes: string[]; minBytes: number; unknownSize: "browser" | "offer"; suspendedUntil: number };
type Reply = { ok: boolean; error?: string; connected: boolean; engine: ExtensionState | null; processId: number; settings: Settings; captureEnabled: boolean; offers: { downloadId: number; name: string }[]; notice: string };
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const status = $("status"), detail = $("detail"), notice = $("notice");
const mode = $<HTMLSelectElement>("autopick");
const site = $<HTMLInputElement>("ignore-site");
const ruleFields = [$<HTMLInputElement>("ignore-ext"), $<HTMLInputElement>("ignore-mime"), $<HTMLInputElement>("min-kib"), $<HTMLSelectElement>("unknown")];
let currentSite = "";
let settings: Settings | null = null;
let rulesDirty = false;
let renderedJobs: string | null = null;
let renderedOffers: string | null = null;
for (const field of ruleFields) {
  field.addEventListener("input", () => { rulesDirty = true; });
  field.addEventListener("change", () => { rulesDirty = true; });
}

async function send(message: object): Promise<Reply> {
  const response = await chrome.runtime.sendMessage(message) as Reply;
  if (!response?.ok) throw Error(response?.error || "No se pudo contactar al worker.");
  return response;
}
function error(e: unknown) { notice.textContent = e instanceof Error ? e.message : "Acción no disponible."; }
function renderJobs(engine: ExtensionState | null) {
  const signature = JSON.stringify(engine?.jobs.map(({ id, name, state }) => [id, name, state]) ?? []);
  if (signature === renderedJobs) return;
  renderedJobs = signature;
  const list = $("jobs");
  list.replaceChildren();
  if (!engine?.jobs.length) { const li = document.createElement("li"); li.textContent = "Sin trabajos activos."; list.append(li); return; }
  for (const job of engine.jobs) {
    const li = document.createElement("li");
    const title = document.createElement("span");
    title.textContent = `${job.name} · ${job.state}`;
    li.append(title);
    if (job.state === "downloading" || job.state === "probing") {
      const pause = document.createElement("button");
      pause.textContent = "Pausar";
      pause.addEventListener("click", () => { void send({ type: "pause", id: job.id }).then(load).catch(error); });
      li.append(pause);
    } else if (job.state === "paused") {
      const resume = document.createElement("button");
      resume.textContent = "Reanudar";
      resume.addEventListener("click", () => { void send({ type: "resume", id: job.id }).then(load).catch(error); });
      li.append(resume);
    }
    list.append(li);
  }
}
function renderOffers(offers: Reply["offers"]) {
  const signature = JSON.stringify(offers);
  if (signature === renderedOffers) return;
  renderedOffers = signature;
  const list = $("offers"); list.replaceChildren();
  if (!offers.length) { const li = document.createElement("li"); li.textContent = "No hay propuestas pendientes."; list.append(li); return; }
  for (const offer of offers) {
    const li = document.createElement("li");
    const button = document.createElement("button");
    button.textContent = `Proponer ${offer.name} a IDG`;
    button.addEventListener("click", () => { void send({ type: "acceptOffer", downloadId: offer.downloadId }).then(load).catch(error); });
    li.append(button); list.append(li);
  }
}
async function load() {
  try {
    const response = await send({ type: "state" });
    settings = response.settings;
    status.textContent = response.connected ? "Conectado" : "Desconectado";
    status.dataset.state = response.connected ? "online" : "offline";
    detail.textContent = response.connected ? `Motor ${response.processId} · ${response.engine?.active_count ?? 0} activos.` : "Host ausente, motor detenido o versión incompatible. Consulta la guía de desarrollo.";
    mode.disabled = !response.connected;
    if (response.engine) mode.value = response.engine.autopick_mode;
    $("capture-permission").textContent = response.captureEnabled ? "Detección global autorizada" : "Activar detección global";
    ($("capture-permission") as HTMLButtonElement).disabled = response.captureEnabled;
    $("suspend").textContent = response.settings.suspendedUntil > Date.now() ? "Reanudar AutoPick" : "Suspender una hora";
    site.disabled = !currentSite;
    site.checked = currentSite ? response.settings.ignoredSites.includes(currentSite) : false;
    if (!rulesDirty && !ruleFields.includes(document.activeElement as HTMLInputElement)) {
      ($<HTMLInputElement>("ignore-ext")).value = response.settings.ignoredExtensions.join(", ");
      ($<HTMLInputElement>("ignore-mime")).value = response.settings.ignoredMimes.join(", ");
      ($<HTMLInputElement>("min-kib")).value = String(response.settings.minBytes / 1024);
      ($<HTMLSelectElement>("unknown")).value = response.settings.unknownSize;
    }
    renderJobs(response.engine);
    renderOffers(response.offers);
    notice.textContent = response.notice;
  } catch (e) { status.textContent = "Desconectado"; status.dataset.state = "offline"; error(e); }
}
function listValues(value: string) { return [...new Set(value.split(",").map((v) => v.trim().toLowerCase()).filter(Boolean))].slice(0, 32); }
$("reconnect").addEventListener("click", () => {
  status.textContent = "Conectando…";
  status.dataset.state = "connecting";
  void send({ type: "reconnect" }).then(load).catch((e) => { error(e); void load(); });
});
mode.addEventListener("change", () => { void send({ type: "mode", mode: mode.value }).then(load).catch((e) => { error(e); void load(); }); });
$("capture-permission").addEventListener("click", async () => {
  try {
    const granted = await chrome.permissions.request({ permissions: ["downloads"] });
    if (!granted) { notice.textContent = "Permiso rechazado. Chromium continuará descargando."; return; }
    await send({ type: "permission" }); await load();
  } catch (e) { error(e); }
});
$("suspend").addEventListener("click", () => {
  if (!settings) return;
  const until = settings.suspendedUntil > Date.now() ? 0 : Date.now() + 60 * 60 * 1000;
  void send({ type: "settings", settings: { suspendedUntil: until } }).then(load).catch(error);
});
site.addEventListener("change", () => {
  if (!settings || !currentSite) return;
  const sites = settings.ignoredSites.filter((s) => s !== currentSite);
  if (site.checked) sites.push(currentSite);
  void send({ type: "settings", settings: { ignoredSites: sites } }).then(load).catch(error);
});
$("save-rules").addEventListener("click", () => {
  const kb = Number(($<HTMLInputElement>("min-kib")).value);
  if (!Number.isFinite(kb) || kb < 0 || kb > 1048576) { notice.textContent = "Tamaño mínimo inválido."; return; }
  void send({ type: "settings", settings: {
    ignoredExtensions: listValues(($<HTMLInputElement>("ignore-ext")).value).map((s) => s.replace(/^\./, "")),
    ignoredMimes: listValues(($<HTMLInputElement>("ignore-mime")).value),
    minBytes: Math.floor(kb * 1024), unknownSize: ($<HTMLSelectElement>("unknown")).value,
  } }).then(() => { rulesDirty = false; return load(); }).catch(error);
});
$("open").addEventListener("click", () => { void send({ type: "open" }).then(() => { notice.textContent = "Se solicitó abrir IDG."; }).catch(error); });
$("find-links").addEventListener("click", async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw Error("No hay una página activa.");
    const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => {
      const urls = [...document.querySelectorAll<HTMLAnchorElement>("a[href]")].map((a) => ({ url: a.href, name: a.download || a.href.split("/").pop() || "descarga.bin" }));
      const videos = [...document.querySelectorAll<HTMLVideoElement>("video[src]")].map((v) => ({ url: v.currentSrc || v.src, name: (v.currentSrc || v.src).split("/").pop() || "video.bin" }));
      return [...urls, ...videos].filter((x) => { try { const u = new URL(x.url); return ["http:", "https:"].includes(u.protocol) && !u.search && !u.hash && !u.username && !u.password; } catch { return false; } }).slice(0, 100);
    } });
    const list = $("links"); list.replaceChildren();
    const links = result.result ?? [];
    for (const item of links) {
      const li = document.createElement("li");
      const button = document.createElement("button");
      button.textContent = `Preparar ${item.name}`;
      button.addEventListener("click", () => { void send({ type: "direct", url: item.url, name: item.name }).then(() => { notice.textContent = "Revisa la solicitud en IDG."; }).catch(error); });
      li.append(button); list.append(li);
    }
    if (!links.length) { const li = document.createElement("li"); li.textContent = "No hay enlaces GET simples transferibles en esta página."; list.append(li); }
  } catch (e) { error(e); }
});
chrome.runtime.onMessage.addListener((message: { type: string }) => { if (message.type === "updated") void load(); });
void chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
  try { if (tab.url) currentSite = new URL(tab.url).origin; } catch { /* browser/internal page */ }
  void load();
});
void load();
