import type { Command, Payload, Request, Response, Snapshot } from "../../../packages/shared-types/protocol";
import { getBrowserApi } from "./browser-api";

const host = "io.github.sredgarr.idg.dev";
const timeoutMs = 5000;

function valid(value: unknown): value is Response {
  return typeof value === "object" && value !== null &&
    (value as Response).version === 1 && typeof (value as Response).id === "string" &&
    typeof (value as Response).payload?.kind === "string";
}

export function request(command: Command, id: string = crypto.randomUUID()): Promise<Payload> {
  const api = getBrowserApi();
  return new Promise((resolve, reject) => {
    const port = api.runtime.connectNative(host);
    let stage = 0;
    const timer = setTimeout(() => fail("El motor no respondió."), timeoutMs);
    const finish = (payload: Payload) => {
      clearTimeout(timer);
      port.disconnect();
      if (payload.kind === "error" || payload.kind === "download_failure") reject(new Error("El motor rechazó la solicitud."));
      else resolve(payload);
    };
    const fail = (message: string) => {
      clearTimeout(timer);
      port.disconnect();
      reject(new Error(message));
    };
    port.onDisconnect.addListener(() => { void api.runtime.lastError; if (stage !== 2) fail("Host o motor desconectado."); });
    port.onMessage.addListener((value: unknown) => {
      if (!valid(value)) { fail("Respuesta incompatible."); return; }
      if (stage === 0 && value.id === id + "-hello" && value.payload.kind === "hello") {
        stage = 1;
        port.postMessage({ version: 1, id, command } satisfies Request);
      } else if (stage === 1 && value.id === id) {
        stage = 2;
        finish(value.payload);
      } else fail("Respuesta fuera de orden.");
    });
    port.postMessage({ version: 1, id: id + "-hello", command: "handshake" } satisfies Request);
  });
}

export function watch(onSnapshot: (value: Snapshot) => void, onChange: () => void, onClose: () => void): () => void {
  const api = getBrowserApi();
  const port = api.runtime.connectNative(host);
  let stage = 0;
  const timer = setTimeout(() => port.disconnect(), timeoutMs);
  port.onDisconnect.addListener(() => { clearTimeout(timer); void api.runtime.lastError; onClose(); });
  port.onMessage.addListener((value: unknown) => {
    if (!valid(value)) { port.disconnect(); return; }
    if (stage === 0 && value.id === "watch-hello" && value.payload.kind === "hello") {
      stage = 1;
      port.postMessage({ version: 1, id: "watch-subscribe", command: "subscribe" } satisfies Request);
    } else if (stage === 1 && value.id === "watch-subscribe" && value.payload.kind === "subscribed") {
      stage = 2;
      clearTimeout(timer);
      onSnapshot(value.payload.snapshot);
    } else if (stage === 2 && value.id === "" && value.payload.kind === "snapshot") onSnapshot(value.payload.snapshot);
    else if (stage === 2 && value.id === "" && value.payload.kind === "extension_changed") onChange();
    else port.disconnect();
  });
  port.postMessage({ version: 1, id: "watch-hello", command: "handshake" } satisfies Request);
  return () => port.disconnect();
}
