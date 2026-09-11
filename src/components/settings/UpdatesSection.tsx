import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { checkForUpdates, isTauri } from "@/lib/updater";
import { usePreferences } from "@/store/preferences";

export function UpdatesSection() {
  const [version, setVersion] = useState("dev");
  const autoCheckUpdates = usePreferences((s) => s.autoCheckUpdates);
  const setAutoCheckUpdates = usePreferences((s) => s.setAutoCheckUpdates);
  const runningInTauri = isTauri();

  useEffect(() => {
    if (!isTauri()) return;
    import("@tauri-apps/api/app")
      .then(({ getVersion }) => getVersion())
      .then(setVersion)
      .catch(() => undefined);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Updates & About</h2>
        <p className="text-sm text-muted-foreground">Version and update preferences.</p>
      </div>

      <div className="rounded-lg border border-border p-4 space-y-4">
        <div>
          <div className="text-base font-medium">LocalStacker v{version}</div>
          <p className="text-sm text-muted-foreground">Desktop client for LocalStack.</p>
        </div>

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
      </div>

      <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-4">
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
  );
}
