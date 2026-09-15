import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePreferences } from "@/store/preferences";

export function GeneralSection() {
  const keepInMenuBar = usePreferences((s) => s.keepInMenuBar);
  const setKeepInMenuBar = usePreferences((s) => s.setKeepInMenuBar);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">General</h2>
        <p className="text-sm text-muted-foreground">App behavior.</p>
      </div>

      <div className="rounded-lg border border-border p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Label htmlFor="keep-in-menu-bar-select" className="text-sm font-medium">
              Keep running in the menu bar
            </Label>
            <p className="text-xs text-muted-foreground">
              When on, closing the window keeps LocalStacker running in the macOS menu bar with
              LocalStack status.
            </p>
          </div>
          <Select
            value={keepInMenuBar ? "on" : "off"}
            onValueChange={(val) => setKeepInMenuBar(val === "on")}
          >
            <SelectTrigger
              id="keep-in-menu-bar-select"
              className="w-[100px]"
              aria-label="Keep running in the menu bar"
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
