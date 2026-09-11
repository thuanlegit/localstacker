import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PALETTES } from "@/lib/palettes";
import { useTheme, type ThemeMode } from "@/store/theme";
import { cn } from "@/lib/utils";

export function AppearanceSection() {
  const mode = useTheme((s) => s.mode);
  const palette = useTheme((s) => s.palette);
  const setMode = useTheme((s) => s.setMode);
  const setPalette = useTheme((s) => s.setPalette);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Appearance</h2>
        <p className="text-sm text-muted-foreground">Choose how LocalStacker looks.</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="theme-mode-select">Theme</Label>
        <Select value={mode} onValueChange={(val) => setMode(val as ThemeMode)}>
          <SelectTrigger id="theme-mode-select" className="w-[180px]" aria-label="Theme">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="system">System</SelectItem>
            <SelectItem value="light">Light</SelectItem>
            <SelectItem value="dark">Dark</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Color palette</Label>
        <div className="grid w-fit grid-cols-2 gap-2">
          {PALETTES.map((p) => {
            const isActive = palette === p.id;
            return (
              <button
                key={p.id}
                type="button"
                aria-label={p.label}
                aria-pressed={isActive}
                onClick={() => setPalette(p.id)}
                className={cn(
                  "flex items-center gap-3 rounded-md border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                  isActive && "ring-2 ring-ring",
                )}
              >
                <div className="flex items-center gap-1">
                  <span
                    className="size-3 rounded-full"
                    style={{ backgroundColor: p.swatch.bg }}
                  />
                  <span
                    className="size-3 rounded-full"
                    style={{ backgroundColor: p.swatch.primary }}
                  />
                  <span
                    className="size-3 rounded-full"
                    style={{ backgroundColor: p.swatch.accent }}
                  />
                </div>
                <span>{p.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
