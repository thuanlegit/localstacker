import { useState } from "react";
import { Check, ChevronsUpDown, Globe, Moon, Sun } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { AWS_REGIONS } from "@/lib/regions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConnectionDialog } from "@/components/ConnectionDialog";
import { HealthBadge } from "@/components/HealthBadge";
import { cn } from "@/lib/utils";
import { LOCALSTACK_SERVICE_NAMES, SERVICES } from "@/lib/services";
import { useHealth } from "@/hooks/use-health";
import { useActiveProfile, useProfiles } from "@/store/profiles";
import { useTheme } from "@/store/theme";
import { useTabs } from "@/store/tabs";
import type { ConnectionProfile, ServiceKind } from "@/types";

function toErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
export function openServiceTab(kind: ServiceKind, title: string) {
  useTabs.getState().openTab({ id: `service:${kind}`, kind: "service", service: kind, title });
}

export function Sidebar() {
  const activeTabId = useTabs((s) => s.activeTabId);
  const profiles = useProfiles((s) => s.profiles);
  const activeProfile = useActiveProfile();
  const setActiveProfile = useProfiles((s) => s.setActiveProfile);
  const updateProfile = useProfiles((s) => s.updateProfile);
  const removeProfile = useProfiles((s) => s.removeProfile);
  const queryClient = useQueryClient();
  const theme = useTheme((s) => s.theme);
  const { data: healthData } = useHealth();

  const [isConnectionDialogOpen, setIsConnectionDialogOpen] = useState(false);
  const [dialogProfile, setDialogProfile] = useState<ConnectionProfile | undefined>(undefined);
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
            {profiles.map((profile) =>
              profile.builtIn ? (
                <DropdownMenuItem
                  key={profile.id}
                  onSelect={() => setActiveProfile(profile.id)}
                >
                  <Check
                    className={cn(
                      "size-4",
                      profile.id !== activeProfile.id && "invisible",
                    )}
                  />
                  <span className="flex-1 truncate">{profile.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {profile.endpoint} · {profile.region}
                  </span>
                </DropdownMenuItem>
              ) : (
                <DropdownMenuSub key={profile.id}>
                  <DropdownMenuSubTrigger
                    onClick={() => setActiveProfile(profile.id)}
                  >
                    <Check
                      className={cn(
                        "size-4",
                        profile.id !== activeProfile.id && "invisible",
                      )}
                    />
                    <span className="flex-1 truncate">{profile.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {profile.endpoint} · {profile.region}
                    </span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem
                      onSelect={() => setActiveProfile(profile.id)}
                    >
                      Use connection
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => {
                        setDialogProfile(profile);
                        setIsConnectionDialogOpen(true);
                      }}
                    >
                      Edit…
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onSelect={() => {
                        try {
                          removeProfile(profile.id);
                          toast.success(`Connection ${profile.name} removed`);
                        } catch (err) {
                          toast.error(toErrorMessage(err));
                        }
                      }}
                    >
                      Remove
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              ),
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                setDialogProfile(activeProfile);
                setIsConnectionDialogOpen(true);
              }}
            >
              Edit connection…
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                setDialogProfile(undefined);
                setIsConnectionDialogOpen(true);
              }}
            >
              New connection…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Select
          value={activeProfile.region}
          onValueChange={async (newRegion) => {
            updateProfile(activeProfile.id, { region: newRegion });
            await queryClient.invalidateQueries();
            toast.success(`Region switched to ${newRegion}`);
          }}
        >
          <SelectTrigger
            className="h-8 w-full text-xs font-mono"
            aria-label="Active AWS region"
          >
            <div className="flex items-center gap-1.5 truncate">
              <Globe className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{activeProfile.region}</span>
            </div>
          </SelectTrigger>
          <SelectContent>
            {!AWS_REGIONS.some((r) => r.value === activeProfile.region) &&
              activeProfile.region && (
                <SelectItem value={activeProfile.region}>
                  {activeProfile.region}
                </SelectItem>
              )}
            {AWS_REGIONS.map((r) => (
              <SelectItem key={r.value} value={r.value} className="text-xs">
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <HealthBadge />
        <ConnectionDialog
          open={isConnectionDialogOpen}
          onOpenChange={setIsConnectionDialogOpen}
          profile={dialogProfile}
        />
      </div>

      <nav className="flex flex-col gap-0.5 px-3">
        <p className="px-2 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Services
        </p>
        {SERVICES.map((meta) => {
          const Icon = meta.icon;
          const active = activeTabId === `service:${meta.kind}`;
          const lsName = LOCALSTACK_SERVICE_NAMES[meta.kind];
          const isOff =
            healthData?.status === "up" &&
            healthData.services.find((s) => s.name === lsName)?.status === "disabled";

          return (
            <button
              key={meta.kind}
              type="button"
              onClick={() => openServiceTab(meta.kind, meta.shortLabel)}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-sidebar-accent/50",
                active && "bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent",
                isOff && "opacity-75 hover:opacity-100",
              )}
            >
              <Icon className={cn("size-4 shrink-0", isOff && "text-muted-foreground/70")} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-1">
                  <span className="truncate font-medium">{meta.label}</span>
                  {isOff && (
                    <span className="rounded px-1.5 py-0 text-[10px] font-normal text-muted-foreground bg-muted/60">
                      Off
                    </span>
                  )}
                </span>
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
