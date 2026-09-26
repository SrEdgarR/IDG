import type { DownloadSnapshot, ExtensionState } from "../../../packages/shared-types/protocol";
import { request, watch } from "./bridge";
import { getBrowserApi } from "./browser-api";

const api = getBrowserApi();
const status = document.getElementById("status")!;
const detail = document.getElementById("detail")!;
const reconnect = document.getElementById("reconnect") as HTMLButtonElement;
const directForm = document.getElementById("direct-form") as HTMLFormElement;
const directUrl = document.getElementById("direct-url") as HTMLInputElement;
const downloadLink = document.getElementById("download-link") as HTMLButtonElement;
const open = document.getElementById("open") as HTMLButtonElement;
const notice = document.getElementById("notice")!;
const jobs = document.getElementById("jobs")!;
let connected = false;
let generation = 0;
let renderedJobs: string | null = null;
let closeWatch: (() => void) | undefined;

function disconnected(message: string) {
  connected = false;
  status.textContent = "Desconectado";
  status.dataset.state = "offline";
  detail.textContent = message;
  reconnect.disabled = false;
  downloadLink.disabled = true;
  open.disabled = true;
  jobs.replaceChildren();
  const empty = document.createElement("li");
  empty.textContent = "Sin conexión con el motor.";
  jobs.append(empty);
  renderedJobs = null;
}

function renderJobs(state: ExtensionState) {
  const signature = JSON.stringify(state.jobs.map(({ id, name, state: progress }) => [id, name, progress]));
  if (signature === renderedJobs) return;
  renderedJobs = signature;
  jobs.replaceChildren();
  if (!state.jobs.length) {
    const empty = document.createElement("li");
    empty.textContent = "No hay trabajos activos o en cola.";
    jobs.append(empty);
    return;
  }
  for (const job of state.jobs) {
    const row = document.createElement("li");
    const title = document.createElement("span");
    title.textContent = `${job.name} · ${job.state}`;
    row.append(title);
    if (job.state === "downloading" || job.state === "probing") {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Pausar";
      button.addEventListener("click", () => { void changeJob(job, "pause_download"); });
      row.append(button);
    } else if (job.state === "paused") {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Reanudar";
      button.addEventListener("click", () => { void changeJob(job, "resume_download"); });
      row.append(button);
    }
    jobs.append(row);
  }
}

async function refreshJobs(current: number) {
  const result = await request("get_extension_state");
  if (current !== generation || !connected) return;
  if (result.kind !== "extension_state") throw new Error("El motor devolvió un estado incompatible.");
  renderJobs(result.state);
}

async function changeJob(job: DownloadSnapshot, action: "pause_download" | "resume_download") {
  notice.textContent = "Actualizando el trabajo…";
  try {
    const command = action === "pause_download"
      ? { pause_download: { job_id: job.id } }
      : { resume_download: { job_id: job.id } };
    await request(command);
    await refreshJobs(generation);
    notice.textContent = "Estado actualizado por el motor.";
  } catch (error) {
    notice.textContent = error instanceof Error ? error.message : "No se pudo actualizar el trabajo.";
  }
}

function connect() {
  const current = ++generation;
  closeWatch?.();
  closeWatch = undefined;
  connected = false;
  status.textContent = "Conectando…";
  status.dataset.state = "connecting";
  detail.textContent = "Esperando una respuesta real del motor.";
  reconnect.disabled = true;
  downloadLink.disabled = true;
  open.disabled = true;
  closeWatch = watch((snapshot) => {
    if (current !== generation) return;
    if (snapshot.stopping) {
      disconnected("El motor se está deteniendo.");
      return;
    }
    connected = true;
    status.textContent = "Conectado";
    status.dataset.state = "online";
    detail.textContent = `Motor ${snapshot.process_id}. Solo acciones manuales.`;
    reconnect.disabled = false;
    downloadLink.disabled = false;
    open.disabled = false;
    void refreshJobs(current).catch(() => {
      if (current === generation) notice.textContent = "No se pudieron leer los trabajos del motor.";
    });
  }, () => {
    void refreshJobs(current).catch(() => {});
  }, () => {
    if (current === generation) disconnected("Host ausente, motor detenido o conexión cerrada.");
  });
}

reconnect.addEventListener("click", connect);
open.addEventListener("click", async () => {
  open.disabled = true;
  notice.textContent = "Abriendo IDG…";
  try {
    await request("open_desktop");
    notice.textContent = "Se solicitó abrir IDG.";
  } catch {
    notice.textContent = "No se pudo abrir IDG. Comprueba que el motor esté conectado.";
  } finally {
    open.disabled = !connected;
  }
});

directForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  downloadLink.disabled = true;
  notice.textContent = "Esperando la confirmación de la solicitud en IDG…";
  try {
    const result = await api.runtime.sendMessage({ type: "download-direct", url: directUrl.value }) as {
      ok?: boolean; error?: string;
    } | undefined;
    if (!result?.ok) throw new Error(result?.error ?? "No se pudo enviar el enlace a IDG.");
    notice.textContent = "IDG aceptó el enlace y empezó la descarga.";
    directUrl.value = "";
  } catch (error) {
    notice.textContent = error instanceof Error ? error.message : "No se pudo enviar el enlace a IDG.";
  } finally {
    downloadLink.disabled = !connected;
  }
});

window.addEventListener("pagehide", () => {
  ++generation;
  closeWatch?.();
  closeWatch = undefined;
});
connect();
