import { toast } from "sonner";
import type { Update } from "@tauri-apps/plugin-updater";

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function installUpdate(update: Update) {
  const tid = toast.loading("Downloading update…");
  try {
    await update.downloadAndInstall();
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  } catch {
    toast.dismiss(tid);
    toast.error("Update failed — try again later");
  }
}

/** Returns the check outcome. `manual` controls browser messaging: auto path stays silent. */
export async function checkForUpdates(
  manual: boolean,
): Promise<"unsupported" | "none" | "offered" | "error"> {
  if (!isTauri()) {
    if (manual) toast.info("Updates are only available in the installed app");
    return "unsupported";
  }
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();
    if (!update) {
      if (manual) toast.success("You're up to date");
      return "none";
    }
    toast.info(`LocalStacker ${update.version} is available`, {
      duration: Infinity,
      action: {
        label: "Update & restart",
        onClick: () => installUpdate(update),
      },
      cancel: { label: "Later", onClick: () => undefined },
    });
    return "offered";
  } catch (err) {
    if (manual) {
      toast.error("Failed to check for updates");
    } else {
      console.warn("Failed to check for updates:", err);
    }
    return "error";
  }
}
