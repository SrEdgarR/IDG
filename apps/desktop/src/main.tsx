import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ConnectionState } from "../../../packages/shared-types/protocol";
import "./style.css";

function App() {
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
      if (command === "ping_runtime") setNotice("El motor respondió al ping.");
    } catch {
      setNotice(
        "No se pudo completar la acción. Comprueba que el motor esté iniciado.",
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
        await action("connect_runtime");
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
    <main>
      <header>
        <span className="wordmark">IDG</span>
        <span className="tag">Desarrollo · fase 01</span>
      </header>
      <h1>Conexión con el motor</h1>
      <p className="muted">
        Esqueleto de Internet Download Genious. Las descargas todavía no están
        disponibles.
      </p>
      <section aria-label="Estado de conexión">
        <h2 role="status">{state.connected ? "Conectado" : "Desconectado"}</h2>
        {state.error && <p>{state.error}</p>}
        {state.snapshot && (
          <dl>
            <dt>Proceso del motor</dt>
            <dd>{state.snapshot.process_id}</dd>
            <dt>Clientes conectados</dt>
            <dd>{state.snapshot.clients}</dd>
          </dl>
        )}
        {!state.connected && (
          <p className="muted">
            Inicia el runtime con las instrucciones de desarrollo y pulsa
            Reconectar.
          </p>
        )}
        <div className="actions">
          <button
            disabled={busy}
            onClick={() => void action("connect_runtime")}
          >
            Reconectar
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
        <p role="status" className="notice">
          {busy ? "Comprobando…" : notice}
        </p>
      </section>
      <footer>
        Cerrar esta ventana conserva el motor. Detener motor afecta a todos sus
        clientes. Puedes iniciarlo de nuevo manualmente.
      </footer>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
