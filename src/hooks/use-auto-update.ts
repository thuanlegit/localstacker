import { useEffect } from "react";
import { checkForUpdates, isTauri } from "@/lib/updater";
import { usePreferences } from "@/store/preferences";

export function useAutoUpdate(): void {
  useEffect(() => {
    if (!isTauri() || !usePreferences.getState().autoCheckUpdates) return;
    void checkForUpdates(false);
  }, []);
}
