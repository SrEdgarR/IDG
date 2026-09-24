import type {
  Response,
  Request,
  Snapshot,
} from "../../../packages/shared-types/protocol";

const api =
  typeof chrome !== "undefined"
    ? chrome
    : (globalThis as unknown as { browser: typeof chrome }).browser;
const status = document.getElementById("status")!;
const detail = document.getElementById("detail")!;
const button = document.getElementById("reconnect") as HTMLButtonElement;
let port: chrome.runtime.Port | undefined;
let deadline: ReturnType<typeof setTimeout> | undefined;
let session = 0;
let runtimeId: string | undefined;
let sequence = 0;

function disconnected(message: string) {
  status.textContent = "Desconectado";
  status.dataset.state = "offline";
  detail.textContent = message;
  button.disabled = false;
  clearTimeout(deadline);
}
function snapshot(value: Snapshot) {
  if (value.stopping) {
    disconnected("El motor se está deteniendo.");
    return;
  }
  if (
    runtimeId &&
    (runtimeId !== value.runtime_id || value.sequence < sequence)
  )
    throw new Error("orden");
  runtimeId = value.runtime_id;
  sequence = value.sequence;
  status.textContent = "Conectado";
  status.dataset.state = "online";
  detail.textContent = `Motor ${value.process_id} · ${value.clients} clientes. Sin descargas implementadas.`;
  button.disabled = false;
}
function connect() {
  const generation = ++session;
  clearTimeout(deadline);
  port?.disconnect();
  runtimeId = undefined;
  sequence = 0;
  status.textContent = "Conectando…";
  status.dataset.state = "connecting";
  detail.textContent = "Esperando una respuesta real del motor.";
  button.disabled = true;
  const current = api.runtime.connectNative("io.github.sredgarr.idg.dev");
  port = current;
  let stage: "hello" | "subscribe" | "events" = "hello";
  const send = (request: Request) => current.postMessage(request);
  deadline = setTimeout(() => {
    if (generation === session) {
      disconnected("El motor no respondió a tiempo.");
      current.disconnect();
    }
  }, 5000);
  current.onDisconnect.addListener(() => {
    // Read lastError to consume Chrome's diagnostic, but never display raw host data.
    void api.runtime.lastError;
    if (generation === session)
      disconnected(
        "Host ausente, motor detenido o conexión cerrada. Consulta la guía de desarrollo.",
      );
  });
  current.onMessage.addListener((message: Response) => {
    if (generation !== session) return;
    try {
      if (message.version !== 1 || !message.payload) throw new Error("versión");
      const payload = message.payload;
      if (
        stage === "hello" &&
        message.id === "extension-hello" &&
        payload.kind === "hello"
      ) {
        stage = "subscribe";
        send({ version: 1, id: "extension-watch", command: "subscribe" });
      } else if (
        stage === "subscribe" &&
        message.id === "extension-watch" &&
        payload.kind === "subscribed"
      ) {
        snapshot(payload.snapshot);
        stage = "events";
        clearTimeout(deadline);
      } else if (
        stage === "events" &&
        message.id === "" &&
        payload.kind === "snapshot"
      ) {
        snapshot(payload.snapshot);
      } else throw new Error("respuesta");
    } catch {
      disconnected("Respuesta incompatible del motor.");
      current.disconnect();
    }
  });
  send({ version: 1, id: "extension-hello", command: "handshake" });
}
button.addEventListener("click", connect);
window.addEventListener("pagehide", () => {
  ++session;
  clearTimeout(deadline);
  port?.disconnect();
});
connect();
