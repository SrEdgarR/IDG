import type { ExtensionState } from "../../../packages/shared-types/protocol";

type Reply = {
  ok: boolean;
  error?: string;
  connected: boolean;
  processId: number;
  engine: ExtensionState | null;
  notice: string;
};
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const status = $("status"), detail = $("detail"), notice = $("notice");
let renderedJobs: string | null = null;

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
async function load() {
  try {
    const response = await send({ type: "state" });
    status.textContent = response.connected ? "Conectado" : "Desconectado";
    status.dataset.state = response.connected ? "online" : "offline";
    detail.textContent = response.connected ? `Motor ${response.processId} · ${response.engine?.active_count ?? 0} activos.` : "Host ausente, motor detenido o versión incompatible. Consulta la guía de desarrollo.";
    renderJobs(response.engine);
    notice.textContent = response.notice;
  } catch (e) { status.textContent = "Desconectado"; status.dataset.state = "offline"; error(e); }
}
$("reconnect").addEventListener("click", () => {
  status.textContent = "Conectando…";
  status.dataset.state = "connecting";
  void send({ type: "reconnect" }).then(load).catch((e) => { error(e); void load(); });
});
$("open").addEventListener("click", () => { void send({ type: "open" }).then(() => { notice.textContent = "Se solicitó abrir IDG."; }).catch(error); });
$("find-links").addEventListener("click", async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw Error("No hay una página activa.");
    const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => {
      const urls = [...document.querySelectorAll<HTMLAnchorElement>("a[href]")].map((a) => ({ url: a.href, name: a.download || a.href.split("/").pop() || "descarga.bin" }));
      return urls.filter((x) => { try { const u = new URL(x.url); return ["http:", "https:"].includes(u.protocol) && !u.search && !u.hash && !u.username && !u.password; } catch { return false; } }).slice(0, 100);
    } });
    const list = $("links"); list.replaceChildren();
    const links = result.result ?? [];
    for (const item of links) {
      const li = document.createElement("li");
      const button = document.createElement("button");
      button.textContent = `Preparar ${item.name}`;
      button.addEventListener("click", () => {
        button.disabled = true;
        void send({ type: "direct", url: item.url, name: item.name }).then(() => { notice.textContent = "Revisa y confirma la solicitud en IDG."; }).catch(error);
      });
      li.append(button); list.append(li);
    }
    if (!links.length) { const li = document.createElement("li"); li.textContent = "No hay enlaces directos HTTP/HTTPS sin parámetros transferibles."; list.append(li); }
  } catch (e) { error(e); }
});
chrome.runtime.onMessage.addListener((message: { type: string }) => { if (message.type === "updated") void load(); });
void load();
