import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface ThemeStore {
  theme: "dark" | "light";
  toggle: () => void;
}

export const useTheme = create<ThemeStore>()(
  persist(
    (set, get) => ({
      theme: "dark",
      toggle: () => set({ theme: get().theme === "dark" ? "light" : "dark" }),
    }),
    {
      name: "localstacker.theme",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

export function applyThemeToDocument(theme: "dark" | "light") {
  document.documentElement.classList.toggle("dark", theme === "dark");
}
