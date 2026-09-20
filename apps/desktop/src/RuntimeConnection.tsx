import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ConnectionState } from "../../../packages/shared-types/protocol";
export function RuntimeConnection() {
  const [state, setState] = useState<ConnectionState>({
    connected: false,
    snapshot: null,
    error: null,
  });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  async function action(command: string) {
    setBusy(true);
    setNotice("");
    try {
      await invoke(command);
      if (command === "start_runtime") await invoke("connect_runtime");
      if (command === "ping_runtime") setNotice("El motor respondió al ping.");
    } catch (e) {
      setNotice(
        typeof e === "string" ? e : "No se pudo conectar con el motor.",
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen<ConnectionState>("runtime-state", ({ payload }) => {
      if (!disposed) setState(payload);
    })
      .then(async (stop) => {
        if (disposed) {
          stop();
          return;
        }
        unlisten = stop;
      })
      .catch(() =>
        setNotice(
          "Esta ventana necesita ejecutarse dentro de IDG Desktop (Tauri).",
        ),
      );
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);
  return (
    <section className="runtime" aria-label="Estado de conexión">
      <span
        className={state.connected ? "connection online" : "connection"}
        role="status"
      >
        {state.connected ? "Conectado" : "Desconectado"}
      </span>
      <span className="runtime-detail muted">
        {state.snapshot
          ? `Motor ${state.snapshot.process_id} · ${state.snapshot.clients} clientes`
          : "El motor está detenido o desconectado. Puedes iniciarlo explícitamente."}
      </span>
      <div className="runtime-actions">
        <button
          disabled={busy}
          onClick={() => void action("request_desktop_exit")}
        >
          Salir completamente
        </button>
        <button
          disabled={busy}
          onClick={() =>
            void action(state.connected ? "connect_runtime" : "start_runtime")
          }
        >
          {state.connected ? "Reconectar" : "Iniciar motor"}
        </button>
        <button
          disabled={busy || !state.connected}
          onClick={() => void action("ping_runtime")}
        >
          Comprobar conexión
        </button>
        <button
          disabled={busy || !state.connected}
          onClick={() => void action("shutdown_runtime")}
        >
          Detener motor
        </button>
      </div>
      {(state.error || notice) && (
        <p className="runtime-message" role="status">
          {notice ||
            (state.error &&
              "No se pudo conectar con el motor. Comprueba que esté iniciado")}
        </p>
      )}
    </section>
  );
}
