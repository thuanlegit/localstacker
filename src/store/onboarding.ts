import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface OnboardingStore {
  completedAt: number | null;
  complete: () => void;
}

export const useOnboarding = create<OnboardingStore>()(
  persist(
    (set) => ({
      completedAt: null,
      complete: () => set({ completedAt: Date.now() }),
    }),
    {
      name: "localstacker.onboarding",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
