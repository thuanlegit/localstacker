import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { PaletteId } from "@/types";

export type ThemeMode = "system" | "light" | "dark";

interface ThemeStore {
  mode: ThemeMode;
  palette: PaletteId;
  setMode: (mode: ThemeMode) => void;
  setPalette: (palette: PaletteId) => void;
  toggle: () => void;
}

export function resolveMode(mode: ThemeMode): "dark" | "light" {
  if (mode !== "system") return mode;
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyThemeToDocument(mode: ThemeMode, palette: PaletteId) {
  document.documentElement.classList.toggle("dark", resolveMode(mode) === "dark");
  document.documentElement.dataset.palette = palette;
}

export const useTheme = create<ThemeStore>()(
  persist(
    (set, get) => ({
      mode: "dark",
      palette: "default",
      setMode: (mode) => set({ mode }),
      setPalette: (palette) => set({ palette }),
      toggle: () =>
        set({ mode: resolveMode(get().mode) === "dark" ? "light" : "dark" }),
    }),
    {
      name: "localstacker.theme",
      storage: createJSONStorage(() => localStorage),
      version: 2,
      migrate: (persisted, version) =>
        version < 2
          ? {
              mode:
                (persisted as { theme?: string })?.theme === "light"
                  ? "light"
                  : "dark",
              palette: "default" as PaletteId,
            }
          : (persisted as { mode: ThemeMode; palette: PaletteId }),
    },
  ),
);
