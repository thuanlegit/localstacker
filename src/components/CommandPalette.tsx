import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { openServiceTab } from "@/components/Sidebar";
import { SERVICES } from "@/lib/services";
import { useTheme } from "@/store/theme";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const theme = useTheme((s) => s.theme);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const run = (action: () => void) => {
    action();
    setOpen(false);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Go to">
          {SERVICES.map((meta) => {
            const Icon = meta.icon;
            return (
              <CommandItem
                key={meta.kind}
                value={meta.label}
                onSelect={() => run(() => openServiceTab(meta.kind, meta.shortLabel))}
              >
                <Icon />
                {meta.label}
              </CommandItem>
            );
          })}
        </CommandGroup>
        <CommandGroup heading="Preferences">
          <CommandItem
            value="Toggle theme"
            onSelect={() => run(() => useTheme.getState().toggle())}
          >
            {theme === "dark" ? <Sun /> : <Moon />}
            Toggle theme
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
