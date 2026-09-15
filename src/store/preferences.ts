import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface PreferencesStore {
  autoCheckUpdates: boolean;
  setAutoCheckUpdates: (v: boolean) => void;
  keepInMenuBar: boolean;
  setKeepInMenuBar: (v: boolean) => void;
}

export const usePreferences = create<PreferencesStore>()(
  persist(
    (set) => ({
      autoCheckUpdates: true,
      setAutoCheckUpdates: (autoCheckUpdates) => set({ autoCheckUpdates }),
      keepInMenuBar: false,
      setKeepInMenuBar: (keepInMenuBar) => set({ keepInMenuBar }),
    }),
    {
      name: "localstacker.preferences",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
