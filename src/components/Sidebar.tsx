import { useState, useEffect } from "react";
import {
  Check,
  ChevronsUpDown,
  Container,
  Globe,
  Moon,
  Sun,
  PanelLeftClose,
  PanelLeft,
  Server,
  Settings,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
import { resolveMode, useTheme } from "@/store/theme";
import { useTabs } from "@/store/tabs";
import { useSidebar } from "@/store/sidebar";
import type { ConnectionProfile, ServiceKind } from "@/types";

function toErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
export function openServiceTab(kind: ServiceKind, title: string) {
  useTabs
    .getState()
    .openTab({ id: `service:${kind}`, kind: "service", service: kind, title });
}

export function openDockerTab() {
  useTabs.getState().openTab({ id: "docker", kind: "docker", title: "Docker" });
}

export function openSettingsTab() {
  useTabs.getState().openTab({ id: "settings", kind: "settings", title: "Settings" });
}

export function Sidebar() {
  const activeTabId = useTabs((s) => s.activeTabId);
  const profiles = useProfiles((s) => s.profiles);
  const activeProfile = useActiveProfile();
  const setActiveProfile = useProfiles((s) => s.setActiveProfile);
  const updateProfile = useProfiles((s) => s.updateProfile);
  const removeProfile = useProfiles((s) => s.removeProfile);
  const queryClient = useQueryClient();
  const mode = useTheme((s) => s.mode);
  const { data: healthData } = useHealth();
  const isCollapsed = useSidebar((s) => s.isCollapsed);
  const toggleSidebar = useSidebar((s) => s.toggle);

  const [isConnectionDialogOpen, setIsConnectionDialogOpen] = useState(false);
  const [dialogProfile, setDialogProfile] = useState<ConnectionProfile | undefined>(
    undefined,
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleSidebar]);

  return (
    <aside
      className={cn(
        "flex h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-in-out",
        isCollapsed ? "w-14" : "w-60",
      )}
    >
      {/* Top Header Row with Collapse Toggle */}
      <div
        className={cn(
          "flex shrink-0 items-center pt-3 pb-1",
          isCollapsed ? "justify-center" : "justify-between px-3",
        )}
      >
        {!isCollapsed ? (
          <>
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              LocalStacker
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-muted-foreground hover:text-foreground"
                  aria-label="Collapse sidebar"
                  onClick={toggleSidebar}
                >
                  <PanelLeftClose className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Collapse sidebar (⌘B)</TooltipContent>
            </Tooltip>
          </>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-muted-foreground hover:text-foreground"
                aria-label="Expand sidebar"
                onClick={toggleSidebar}
              >
                <PanelLeft className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Expand sidebar (⌘B)</TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Connection & Region Controls */}
      <div
        className={cn(
          "flex shrink-0 flex-col gap-2",
          isCollapsed ? "px-2 py-2" : "p-3",
        )}
      >
        {/* Profile Switcher Dropdown */}
        <DropdownMenu>
          {!isCollapsed ? (
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="h-auto w-full justify-between gap-2 px-3 py-2"
              >
                <span className="flex min-w-0 flex-col items-start gap-0.5">
                  <span className="text-sm font-medium leading-tight">
                    {activeProfile.name}
                  </span>
                  <span className="max-w-full truncate text-xs font-normal leading-tight text-muted-foreground">
                    {activeProfile.endpoint}
                  </span>
                </span>
                <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-9 p-0 mx-auto justify-center"
                    aria-label={`Connection: ${activeProfile.name}`}
                  >
                    <Server className="size-4 text-primary" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side="right">
                <div className="flex flex-col">
                  <span className="font-semibold">{activeProfile.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {activeProfile.endpoint}
                  </span>
                </div>
              </TooltipContent>
            </Tooltip>
          )}
          <DropdownMenuContent
            align="start"
            side={isCollapsed ? "right" : "bottom"}
            className="w-56"
          >
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

        {/* Region Switcher Select */}
        <Select
          value={activeProfile.region}
          onValueChange={async (newRegion) => {
            updateProfile(activeProfile.id, { region: newRegion });
            await queryClient.invalidateQueries();
            toast.success(`Region switched to ${newRegion}`);
          }}
        >
          {!isCollapsed ? (
            <SelectTrigger
              className="h-8 w-full text-xs font-mono"
              aria-label="Active AWS region"
            >
              <div className="flex items-center gap-1.5 truncate">
                <Globe className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{activeProfile.region}</span>
              </div>
            </SelectTrigger>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <SelectTrigger
                  className="size-9 p-0 mx-auto justify-center [&>svg:last-child]:hidden"
                  aria-label="Active AWS region"
                >
                  <Globe className="size-4 text-muted-foreground" />
                </SelectTrigger>
              </TooltipTrigger>
              <TooltipContent side="right">
                Region: {activeProfile.region}
              </TooltipContent>
            </Tooltip>
          )}
          <SelectContent side={isCollapsed ? "right" : "bottom"}>
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

        {/* Health Status Indicator */}
        <HealthBadge collapsed={isCollapsed} />

        <ConnectionDialog
          open={isConnectionDialogOpen}
          onOpenChange={setIsConnectionDialogOpen}
          profile={dialogProfile}
        />
      </div>

      {/* Services Navigation */}
      <nav
        className={cn(
          "min-h-0 flex-1 overflow-y-auto flex flex-col gap-0.5 [&>*]:shrink-0",
          "scrollbar-thin-sidebar",
          isCollapsed ? "px-2" : "px-3",
        )}
      >
        {!isCollapsed ? (
          <p className="px-2 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Docker
          </p>
        ) : (
          <div className="my-1 border-t border-sidebar-border/40" />
        )}
        {isCollapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={openDockerTab}
                aria-label="Docker"
                className={cn(
                  "relative flex size-9 items-center justify-center rounded-md mx-auto text-sm transition-colors hover:bg-sidebar-accent/50",
                  activeTabId === "docker" &&
                    "bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent",
                )}
              >
                <Container className="size-4 shrink-0" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Docker</TooltipContent>
          </Tooltip>
        ) : (
          <button
            type="button"
            onClick={openDockerTab}
            aria-label="Docker"
            className={cn(
              "relative flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-sidebar-accent/50",
              activeTabId === "docker" &&
                "bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent",
            )}
          >
            <Container className="size-4 shrink-0" />
            <span>Docker</span>
          </button>
        )}
        {!isCollapsed ? (
          <p className="px-2 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Services
          </p>
        ) : (
          <div className="my-1 border-t border-sidebar-border/40" />
        )}
        {SERVICES.map((meta) => {
          const Icon = meta.icon;
          const active = activeTabId === `service:${meta.kind}`;
          const lsName = LOCALSTACK_SERVICE_NAMES[meta.kind];
          const isOff =
            healthData?.status === "up" &&
            healthData.services.find((s) => s.name === lsName)?.status ===
              "disabled";

          if (isCollapsed) {
            return (
              <Tooltip key={meta.kind}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => openServiceTab(meta.kind, meta.shortLabel)}
                    aria-label={meta.label}
                    className={cn(
                      "relative flex size-9 items-center justify-center rounded-md mx-auto text-sm transition-colors hover:bg-sidebar-accent/50",
                      active &&
                        "bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent",
                      isOff && "opacity-75 hover:opacity-100",
                    )}
                  >
                    <Icon
                      className={cn(
                        "size-4 shrink-0",
                        isOff && "text-muted-foreground/70",
                      )}
                    />
                    {isOff && (
                      <span
                        className="absolute top-1 right-1 size-1.5 rounded-full bg-amber-500"
                        title="Disabled in LocalStack"
                      />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <div className="flex flex-col">
                    <span className="font-semibold">{meta.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {meta.blurb}
                    </span>
                    {isOff && (
                      <span className="text-[10px] text-amber-500 font-medium mt-0.5">
                        Disabled in LocalStack
                      </span>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            );
          }

          return (
            <button
              key={meta.kind}
              type="button"
              onClick={() => openServiceTab(meta.kind, meta.shortLabel)}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-sidebar-accent/50",
                active &&
                  "bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent",
                isOff && "opacity-75 hover:opacity-100",
              )}
            >
              <Icon
                className={cn(
                  "size-4 shrink-0",
                  isOff && "text-muted-foreground/70",
                )}
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-1">
                  <span className="truncate font-medium">{meta.label}</span>
                  {isOff && (
                    <span className="rounded px-1.5 py-0 text-[10px] font-normal text-muted-foreground bg-muted/60">
                      Off
                    </span>
                  )}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {meta.blurb}
                </span>
              </span>
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div
        className={cn(
          "mt-auto shrink-0 border-t border-sidebar-border p-2 flex items-center",
          isCollapsed ? "flex-col gap-1" : "justify-between",
        )}
      >
        {isCollapsed ? (
          <>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Toggle theme"
              onClick={() => useTheme.getState().toggle()}
            >
              {resolveMode(mode) === "dark" ? <Sun /> : <Moon />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Open settings (⌘,)"
              onClick={openSettingsTab}
            >
              <Settings />
            </Button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Toggle theme"
                onClick={() => useTheme.getState().toggle()}
              >
                {resolveMode(mode) === "dark" ? <Sun /> : <Moon />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Open settings (⌘,)"
                onClick={openSettingsTab}
              >
                <Settings />
              </Button>
            </div>
            <span className="text-[10px] font-mono text-muted-foreground pr-1">
              ⌘B to collapse
            </span>
          </>
        )}
      </div>
    </aside>
  );
}
