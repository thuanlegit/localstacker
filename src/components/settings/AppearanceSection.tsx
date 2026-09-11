import { Check } from "lucide-react";
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
        <div className="grid w-full grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
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
                  "flex flex-col gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:bg-accent/50",
                  isActive && "ring-2 ring-ring",
                )}
              >
                <div
                  className="h-14 w-full rounded-md border border-border/50 p-2.5"
                  style={{ backgroundColor: p.swatch.bg }}
                >
                  <div className="flex h-full flex-col justify-between">
                    <span
                      className="h-2.5 w-2/3 rounded-full"
                      style={{ backgroundColor: p.swatch.primary }}
                    />
                    <div className="flex items-center gap-1.5">
                      <span
                        className="size-2.5 rounded-full"
                        style={{ backgroundColor: p.swatch.accent }}
                      />
                      <span
                        className="h-1.5 w-8 rounded-full opacity-55"
                        style={{ backgroundColor: p.swatch.accent }}
                      />
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{p.label}</span>
                  {isActive && <Check className="size-4 text-primary" aria-hidden />}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
