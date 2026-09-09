import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { ConnectionProfile, NewProfile } from "@/types";

export const LOCAL_PROFILE_ID = "local";

export interface ProfilesState {
  profiles: ConnectionProfile[];
  activeProfileId: string;
}

export function localProfile(): ConnectionProfile {
  return {
    id: LOCAL_PROFILE_ID,
    name: "Local",
    endpoint: "http://localhost:4566",
    region: "us-east-1",
    builtIn: true,
  };
}

interface ProfilesStore extends ProfilesState {
  addProfile: (input: NewProfile) => ConnectionProfile;
  updateProfile: (id: string, patch: Partial<Omit<ConnectionProfile, "id">>) => void;
  removeProfile: (id: string) => void;
  setActiveProfile: (id: string) => void;
}

export const useProfiles = create<ProfilesStore>()(
  persist(
    (set, get) => ({
      profiles: [localProfile()],
      activeProfileId: LOCAL_PROFILE_ID,

      addProfile: (input) => {
        const profile: ConnectionProfile = {
          ...input,
          id: crypto.randomUUID(),
        };
        set((state) => ({ profiles: [...state.profiles, profile] }));
        return profile;
      },

      updateProfile: (id, patch) =>
        set((state) => ({
          profiles: state.profiles.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        })),

      removeProfile: (id) => {
        const doomed = get().profiles.find((p) => p.id === id);
        if (doomed?.builtIn) {
          throw new Error("The built-in Local profile cannot be removed.");
        }
        set((state) => {
          const profiles = state.profiles.filter((p) => p.id !== id);
          const activeProfileId =
            state.activeProfileId === id
              ? (profiles[0]?.id ?? LOCAL_PROFILE_ID)
              : state.activeProfileId;
          return { profiles, activeProfileId };
        });
      },

      setActiveProfile: (id) => {
        if (!get().profiles.some((p) => p.id === id)) return;
        set({ activeProfileId: id });
      },
    }),
    {
      name: "localstacker.profiles",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

export function useActiveProfile(): ConnectionProfile {
  return useProfiles((state) => {
    const active = state.profiles.find((p) => p.id === state.activeProfileId);
    return active ?? state.profiles[0] ?? localProfile();
  });
}
