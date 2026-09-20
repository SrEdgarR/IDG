import { useEffect, useState } from "react";
import { execute } from "./desktop";
export function ClipboardNotice({
  enabled,
  onReview,
}: {
  enabled: boolean;
  onReview: (text: string) => void;
}) {
  const [pending, setPending] = useState<{
      id: number;
      count: number;
      domains: string[];
    } | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    if (!enabled) {
      setPending(null);
      return;
    }
    let disposed = false,
      busy = false;
    async function load() {
      if (busy) return;
      busy = true;
      try {
        const r = await execute({
          library: { operation: { action: "clipboard_status" } },
        });
        if (!disposed && r.kind === "clipboard_status")
          setPending(
            r.id === null
              ? null
              : { id: r.id, count: r.count, domains: r.domains },
          );
      } catch (e) {
        if (!disposed) setError(String(e));
      } finally {
        busy = false;
      }
    }
    void load();
    const timer = setInterval(() => void load(), 2000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [enabled]);
  if (!enabled || !pending) return null;
  return (
    <aside role="status" className="connection-banner">
      <p>
        Portapapeles: {pending.count} enlaces de{" "}
        {[...new Set(pending.domains)].join(", ")}. Aún no se han creado
        trabajos.
      </p>
      <button
        onClick={() =>
          void execute({
            library: {
              operation: { action: "take_clipboard", id: pending.id },
            },
          })
            .then((r) => {
              if (r.kind === "clipboard_text") {
                setPending(null);
                onReview(r.text);
              }
            })
            .catch((e) => setError(String(e)))
        }
      >
        Revisar enlaces del portapapeles
      </button>
      <button
        onClick={() =>
          void execute({
            library: {
              operation: { action: "dismiss_clipboard", id: pending.id },
            },
          })
            .then(() => setPending(null))
            .catch((e) => setError(String(e)))
        }
      >
        Descartar propuesta
      </button>
      {error && <p role="alert">{error}</p>}
    </aside>
  );
}
