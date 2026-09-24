import { createRoot } from "react-dom/client";
import { desktop, useDownloads } from "./desktop";
import { App } from "./App";
import { RuntimeConnection } from "./RuntimeConnection";
import "../../../packages/ui/tokens.css";
import "./style.css";
import "./workspace.css";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useState } from "react";
import { formatBytes, stateLabels } from "./model";
function DesktopApp() {
  const { rows, error } = useDownloads();
  return (
    <App
      rows={rows}
      backend={desktop}
      connection={
        <>
          <RuntimeConnection />
          {error && <p role="alert">{error}</p>}
        </>
      }
    />
  );
}
function MiniApp() {
  const { rows, error, online } = useDownloads(true);
  const row = rows.find((r) => r.state === "Downloading") ?? rows.at(-1);
  return (
    <main
      className="aux-window mini-window"
      aria-label="Mini ventana de progreso"
    >
      <h2>IDG · Progreso</h2>
      {!online && <p role="status">Desconectado · último estado recibido</p>}
      {row ? (
        <>
          <strong>{row.name}</strong>
          <p>
            {stateLabels[row.state]} · {formatBytes(row.received)} /{" "}
            {formatBytes(row.total)}
          </p>
        </>
      ) : (
        <p>No hay trabajos.</p>
      )}
      {error && <p role="alert">{error}</p>}
      <button onClick={() => void invoke("show_desktop")}>Mostrar IDG</button>
    </main>
  );
}
function DropApp() {
  const [error, setError] = useState("");
  return (
    <main className="aux-window drop-window">
      <section
        className="empty"
        aria-label="Zona para soltar enlaces"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const url =
            e.dataTransfer
              .getData("text/uri-list")
              .split("\n")
              .find((s) => s && !s.startsWith("#")) ??
            e.dataTransfer.getData("text/plain");
          void invoke("review_dropped_url", { url })
            .then(() => setError(""))
            .catch((e) => setError(String(e)));
        }}
      >
        <strong>Suelta un enlace</strong>
        <p>Se abrirá Nueva descarga para que lo revises.</p>
      </section>
      {error && <p role="alert">{error}</p>}
      <button onClick={() => void invoke("show_desktop")}>Mostrar IDG</button>
    </main>
  );
}
let surface = "main";
try {
  surface = getCurrentWindow().label;
} catch {
  /* Browser preview has no native window. */
}
createRoot(document.getElementById("root")!).render(
  surface === "mini" ? (
    <MiniApp />
  ) : surface === "drop" ? (
    <DropApp />
  ) : (
    <DesktopApp />
  ),
);
