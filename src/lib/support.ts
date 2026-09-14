import { toast } from "sonner";
import { isTauri } from "@/lib/updater";

export const DONATE_URL = "https://buymeacoffee.com/ryleth";

export async function openDonate(): Promise<void> {
  try {
    if (isTauri()) {
      // Dynamic import: platform-specific Tauri plugin, kept out of browser bundles.
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(DONATE_URL);
    } else {
      window.open(DONATE_URL, "_blank", "noopener,noreferrer");
    }
  } catch {
    toast.error("Failed to open donation page");
  }
}
