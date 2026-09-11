import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { TabDescriptor } from "@/types";

const MAX_RECENTS = 6;

interface RecentsStore {
  recent: TabDescriptor[];
  record: (tab: TabDescriptor) => void;
}

export const useRecents = create<RecentsStore>()(
  persist(
    (set) => ({
      recent: [],
      record: (tab) =>
        set((state) => ({
          recent: [tab, ...state.recent.filter((t) => t.id !== tab.id)].slice(0, MAX_RECENTS),
        })),
    }),
    { name: "localstacker.recents", storage: createJSONStorage(() => localStorage) },
  ),
);
