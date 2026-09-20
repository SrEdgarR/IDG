import { useEffect, useState } from "react";
export type Theme = "system" | "light" | "dark";
export function useViewMode(persist = true) {
  const [mode, setMode] = useState(() => {
    try {
      const saved = localStorage.getItem("idg.ui.view");
      return saved === "Compacta" || saved === "Expandida"
        ? saved
        : "Automática";
    } catch {
      return "Automática";
    }
  });
  useEffect(() => {
    try {
      if (persist) localStorage.setItem("idg.ui.view", mode);
    } catch {
      /* Optional UI preference. */
    }
  }, [mode, persist]);
  return { mode, setMode };
}
export function useAppearance(persist = true) {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const t = localStorage.getItem("idg.ui.theme");
      return t === "light" || t === "dark" ? t : "system";
    } catch {
      return "system";
    }
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      if (persist) localStorage.setItem("idg.ui.theme", theme);
    } catch {
      /* UI remains usable without storage. */
    }
  }, [theme, persist]);
  return { theme, setTheme };
}
