import { Check, ChevronsUpDown, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HealthBadge } from "@/components/HealthBadge";
import { cn } from "@/lib/utils";
import { SERVICES } from "@/lib/services";
import { useActiveProfile, useProfiles } from "@/store/profiles";
import { useTheme } from "@/store/theme";
import { useTabs } from "@/store/tabs";
import type { ServiceKind } from "@/types";

export function openServiceTab(kind: ServiceKind, title: string) {
  useTabs.getState().openTab({ id: `service:${kind}`, kind: "service", service: kind, title });
}

export function Sidebar() {
  const activeProfile = useActiveProfile();
  const profiles = useProfiles((s) => s.profiles);
  const setActiveProfile = useProfiles((s) => s.setActiveProfile);
  const activeTabId = useTabs((s) => s.activeTabId);
  const theme = useTheme((s) => s.theme);

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex flex-col gap-2 p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="h-auto w-full justify-between gap-2 px-3 py-2">
              <span className="flex min-w-0 flex-col items-start gap-0.5">
                <span className="text-sm font-medium leading-tight">{activeProfile.name}</span>
                <span className="max-w-full truncate text-xs font-normal leading-tight text-muted-foreground">
                  {activeProfile.endpoint}
                </span>
              </span>
              <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {profiles.map((profile) => (
              <DropdownMenuItem key={profile.id} onSelect={() => setActiveProfile(profile.id)}>
                <Check className={cn("size-4", profile.id !== activeProfile.id && "invisible")} />
                <span className="flex-1 truncate">{profile.name}</span>
                <span className="truncate text-xs text-muted-foreground">{profile.endpoint}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <HealthBadge />
      </div>

      <nav className="flex flex-col gap-0.5 px-3">
        <p className="px-2 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Services
        </p>
        {SERVICES.map((meta) => {
          const Icon = meta.icon;
          const active = activeTabId === `service:${meta.kind}`;
          return (
            <button
              key={meta.kind}
              type="button"
              onClick={() => openServiceTab(meta.kind, meta.shortLabel)}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-sidebar-accent/50",
                active && "bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent",
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span className="min-w-0">
                <span className="block truncate font-medium">{meta.label}</span>
                <span className="block truncate text-xs text-muted-foreground">{meta.blurb}</span>
              </span>
            </button>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-sidebar-border p-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Toggle theme"
          onClick={() => useTheme.getState().toggle()}
        >
          {theme === "dark" ? <Sun /> : <Moon />}
        </Button>
      </div>
    </aside>
  );
}
