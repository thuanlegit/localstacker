import { useEffect, useState } from "react";
import { Heart, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { openDonate } from "@/lib/support";
import { checkForUpdates, isTauri } from "@/lib/updater";
import { usePreferences } from "@/store/preferences";

export function UpdatesSection() {
  const [version, setVersion] = useState("dev");
  const autoCheckUpdates = usePreferences((s) => s.autoCheckUpdates);
  const setAutoCheckUpdates = usePreferences((s) => s.setAutoCheckUpdates);
  const runningInTauri = isTauri();

  useEffect(() => {
    if (!isTauri()) return;
    // Dynamic import: Tauri-only API, never loaded in browser preview.
    import("@tauri-apps/api/app")
      .then(({ getVersion }) => getVersion())
      .then(setVersion)
      .catch(() => undefined);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Updates &amp; About</h2>
        <p className="text-sm text-muted-foreground">Version, updates, and support.</p>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex items-start gap-3 p-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted">
            <Layers className="size-5 text-muted-foreground" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-base font-semibold">LocalStacker</span>
              <span className="rounded-md border bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                v{version}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">Desktop client for LocalStack.</p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-4 border-t border-border px-4 py-3">
          <p className="text-xs text-muted-foreground">
            If LocalStacker saves you time, buy the author a coffee.
          </p>
          <button
            type="button"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border bg-card px-2 py-1 text-xs text-foreground transition-colors hover:bg-accent"
            onClick={() => void openDonate()}
          >
            <Heart className="size-3.5 text-muted-foreground" aria-hidden />
            Buy me a coffee
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-border p-4">
        <div className="space-y-1">
          <Button
            variant="outline"
            disabled={!runningInTauri}
            onClick={() => void checkForUpdates(true)}
          >
            Check for updates
          </Button>
          {!runningInTauri && (
            <p className="text-xs text-muted-foreground">
              Updates run inside the installed app — browser preview can't check.
            </p>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between gap-4 border-t border-border pt-4">
          <div className="space-y-0.5">
            <Label htmlFor="auto-check-updates-select" className="text-sm font-medium">
              Check for updates on startup
            </Label>
            <p className="text-xs text-muted-foreground">
              Automatically check for new releases when LocalStacker starts.
            </p>
          </div>
          <Select
            value={autoCheckUpdates ? "on" : "off"}
            onValueChange={(val) => setAutoCheckUpdates(val === "on")}
          >
            <SelectTrigger
              id="auto-check-updates-select"
              className="w-[100px]"
              aria-label="Check for updates on startup"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="on">On</SelectItem>
              <SelectItem value="off">Off</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
