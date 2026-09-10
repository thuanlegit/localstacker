import { create } from "zustand";
import type { TabDescriptor } from "@/types";

interface TabsStore {
  tabs: TabDescriptor[];
  activeTabId: string | null;
  openTab: (tab: TabDescriptor) => void;
  closeTab: (id: string) => void;
  closeAllTabs: () => void;
  closeOtherTabs: (id: string) => void;
  setActiveTab: (id: string) => void;
}

export const useTabs = create<TabsStore>()((set, get) => ({
  tabs: [],
  activeTabId: null,

  openTab: (tab) =>
    set((state) => ({
      tabs: state.tabs.some((t) => t.id === tab.id) ? state.tabs : [...state.tabs, tab],
      activeTabId: tab.id,
    })),

  closeTab: (id) =>
    set((state) => {
      const index = state.tabs.findIndex((t) => t.id === id);
      if (index === -1) return state;
      const tabs = state.tabs.filter((t) => t.id !== id);
      let activeTabId = state.activeTabId;
      if (activeTabId === id) {
        const neighbor = tabs[Math.min(index, tabs.length - 1)];
        activeTabId = neighbor?.id ?? null;
      }
      return { tabs, activeTabId };
    }),

  closeAllTabs: () =>
    set({
      tabs: [],
      activeTabId: null,
    }),

  closeOtherTabs: (id) =>
    set((state) => {
      const remaining = state.tabs.filter((t) => t.id === id);
      return {
        tabs: remaining,
        activeTabId: remaining.length > 0 ? id : null,
      };
    }),

  setActiveTab: (id) => {
    if (!get().tabs.some((t) => t.id === id)) return;
    set({ activeTabId: id });
  },
}));

export function useActiveTab(): TabDescriptor | null {
  return useTabs((state) => state.tabs.find((t) => t.id === state.activeTabId) ?? null);
}
