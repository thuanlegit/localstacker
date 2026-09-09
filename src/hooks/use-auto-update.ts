import { useEffect } from "react";
import { toast } from "sonner";

export function useAutoUpdate(): void {
  useEffect(() => {
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
      return;
    }

    let isMounted = true;

    async function checkForUpdates() {
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const update = await check();

        if (!update || !isMounted) return;

        toast.info(`LocalStacker ${update.version} is available`, {
          duration: Infinity,
          action: {
            label: "Update & restart",
            onClick: async () => {
              const tid = toast.loading("Downloading update…");
              try {
                await update.downloadAndInstall();
                const { relaunch } = await import("@tauri-apps/plugin-process");
                await relaunch();
              } catch {
                toast.dismiss(tid);
                toast.error("Update failed — try again later");
              }
            },
          },
          cancel: { label: "Later", onClick: () => undefined },
        });
      } catch (err) {
        console.warn("Failed to check for updates:", err);
      }
    }

    void checkForUpdates();

    return () => {
      isMounted = false;
    };
  }, []);
}
