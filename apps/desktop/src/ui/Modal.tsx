import {
  useEffect,
  useRef,
  useId,
  type ReactNode,
  type KeyboardEvent,
} from "react";
import { Icon } from "./Icon";
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    const node = ref.current!;
    node.showModal();
    node.querySelector("button")?.focus();
    return () => {
      node.close();
      if (trigger?.isConnected) trigger.focus();
    };
  }, []);
  function trap(e: KeyboardEvent<HTMLDialogElement>) {
    if (
      e.key !== "Tab" ||
      (e.target as HTMLElement).closest("dialog") !== ref.current
    )
      return;
    const items = Array.from(
      ref.current!.querySelectorAll<HTMLElement>(
        'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,a[href],[tabindex="0"]',
      ),
    ).filter((n) => n.getClientRects().length > 0);
    const first = items[0],
      last = items.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
  }
  return (
    <dialog
      ref={ref}
      className={wide ? "modal wide" : "modal"}
      aria-labelledby={titleId}
      onKeyDown={trap}
      onCancel={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }}
    >
      <header>
        <div>
          <p className="eyebrow">IDG</p>
          <h2 id={titleId}>{title}</h2>
        </div>
        <button aria-label="Cerrar diálogo" onClick={onClose}>
          <Icon name="close" />
        </button>
      </header>
      {children}
    </dialog>
  );
}
export function Pending({
  children = "Disponible al integrar el motor de descargas en fase 05.",
}: {
  children?: ReactNode;
}) {
  return (
    <p className="pending" id="backend-pending">
      {children}
    </p>
  );
}
