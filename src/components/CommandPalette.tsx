import { useEffect, useState } from "react";
import { HardDrive, Moon, Sun } from "lucide-react";
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
import { useActiveProfile } from "@/store/profiles";
import { useTabs } from "@/store/tabs";
import { useBuckets } from "@/hooks/use-s3";
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const theme = useTheme((s) => s.theme);
  const profile = useActiveProfile();
  const openTab = useTabs((s) => s.openTab);
  const { data: buckets } = useBuckets(profile.id, { enabled: open });
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
        {buckets && buckets.length > 0 && (
          <CommandGroup heading="Buckets">
            {buckets.map((b) => (
              <CommandItem
                key={b.name}
                value={b.name}
                onSelect={() =>
                  run(() =>
                    openTab({
                      id: `bucket:${b.name}`,
                      kind: "bucket",
                      bucketName: b.name,
                      title: b.name,
                    }),
                  )
                }
              >
                <HardDrive />
                {b.name}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
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
