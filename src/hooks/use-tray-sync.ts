import { useEffect, useRef } from "react";
import { trayUpdateFor } from "@/lib/tray";
import { useHealth } from "./use-health";
import { useOnboarding } from "@/store/onboarding";
import { usePreferences } from "@/store/preferences";

/**
 * Pushes tray state to Rust. No business logic: the tray icon/menu live in
 * Rust; this only forwards the preference toggle and health transitions.
 */
export function useTraySync() {
  const healthStatus = useHealth().data?.status;
  const keepInMenuBar = usePreferences((s) => s.keepInMenuBar);
  const connectionConfigured = useOnboarding((s) => s.completedAt !== null);
  const lastUpdate = useRef<{ status: string; label: string } | null>(null);

  useEffect(() => {
    // Dynamic import: Tauri-only API, never loaded in browser preview.
    import("@tauri-apps/api/core")
      .then(({ invoke }) => invoke("tray_set_enabled", { enabled: keepInMenuBar }))
      .catch(() => undefined);
  }, [keepInMenuBar]);

  useEffect(() => {
    const update = trayUpdateFor(healthStatus, connectionConfigured);
    const last = lastUpdate.current;
    if (last && last.status === update.status && last.label === update.label) return;
    lastUpdate.current = update;
    import("@tauri-apps/api/core")
      .then(({ invoke }) =>
        invoke("tray_set_status", { status: update.status, label: update.label }),
      )
      .catch(() => undefined);
  }, [healthStatus, connectionConfigured]);
}
