import { useState } from "react";
import {
  Globe,
  Search,
  Plus,
  RotateCw,
  MoreHorizontal,
  Copy,
  Check,
  Trash2,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { CreateHostedZoneDialog } from "./CreateHostedZoneDialog";
import {
  useHostedZones,
  useHostedZoneActions,
} from "@/hooks/use-route53";
import { useTabs } from "@/store/tabs";
import type { HostedZoneSummary } from "@/lib/route53";

export function Route53ServiceView() {
  const [search, setSearch] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Dialogs
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [zoneToDelete, setZoneToDelete] = useState<HostedZoneSummary | null>(
    null,
  );
  const [isDeleting, setIsDeleting] = useState(false);

  const {
    data: zones = [],
    isLoading,
    isFetching,
    refetch,
  } = useHostedZones();

  const { deleteHostedZone } = useHostedZoneActions();
  const { openTab, closeTab } = useTabs();

  const handleCopyId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      setCopiedId(id);
      toast.success("Zone ID copied to clipboard");
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error("Failed to copy Zone ID");
    }
  };

  const handleOpenZone = (zone: HostedZoneSummary) => {
    openTab({
      id: `hostedZone:${zone.id}`,
      kind: "hostedZone",
      zoneId: zone.id,
      title: zone.name,
    });
  };

  const handleDelete = async () => {
    if (!zoneToDelete) return;
    setIsDeleting(true);
    try {
      const ok = await deleteHostedZone(zoneToDelete.id, zoneToDelete.name);
      if (ok) {
        closeTab(`hostedZone:${zoneToDelete.id}`);
        setZoneToDelete(null);
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredZones = zones.filter(
    (z) =>
      z.name.toLowerCase().includes(search.toLowerCase()) ||
      (z.comment && z.comment.toLowerCase().includes(search.toLowerCase())) ||
      z.id.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Service Header */}
      <div className="flex shrink-0 items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Globe className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Route 53</h1>
            <p className="text-xs text-muted-foreground">
              DNS Hosted Zones & Resource Record Sets
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            title="Refresh"
          >
            <RotateCw
              className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`}
            />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button size="sm" onClick={() => setIsCreateOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Create Hosted Zone
          </Button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-auto p-6 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search hosted zones..."
              className="pl-8 text-xs"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredZones.length === 0 ? (
          <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
            {search
              ? "No hosted zones match your search."
              : "No Route 53 hosted zones found."}
          </div>
        ) : (
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/50 border-b text-muted-foreground font-medium">
                <tr>
                  <th className="py-2.5 px-4">Domain Name</th>
                  <th className="py-2.5 px-4">Zone ID</th>
                  <th className="py-2.5 px-4">Type</th>
                  <th className="py-2.5 px-4">Records</th>
                  <th className="py-2.5 px-4">Comment</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredZones.map((zone) => (
                  <tr key={zone.id} className="hover:bg-muted/20">
                    <td className="py-2.5 px-4 font-medium">
                      <button
                        type="button"
                        className="font-medium hover:underline text-left text-foreground flex items-center gap-1.5"
                        onClick={() => handleOpenZone(zone)}
                      >
                        <Globe className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span>{zone.name}</span>
                      </button>
                    </td>
                    <td className="py-2.5 px-4 font-mono text-[11px] text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <span>{zone.id}</span>
                        <button
                          type="button"
                          onClick={() => handleCopyId(zone.id)}
                          className="hover:text-foreground text-muted-foreground ml-1"
                          title="Copy Zone ID"
                        >
                          {copiedId === zone.id ? (
                            <Check className="h-3 w-3 text-emerald-500" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="py-2.5 px-4">
                      <Badge
                        variant={zone.privateZone ? "secondary" : "default"}
                        className="text-[10px] px-1.5 py-0"
                      >
                        {zone.privateZone ? "Private" : "Public"}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-4 text-muted-foreground">
                      {zone.recordCount ?? "—"}
                    </td>
                    <td className="py-2.5 px-4 text-muted-foreground truncate max-w-xs">
                      {zone.comment || "—"}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                          >
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => handleOpenZone(zone)}
                          >
                            <ExternalLink className="mr-2 h-3.5 w-3.5" /> Open
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleCopyId(zone.id)}
                          >
                            <Copy className="mr-2 h-3.5 w-3.5" /> Copy Zone ID
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setZoneToDelete(zone)}
                          >
                            <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete Hosted Zone Dialog */}
      <DeleteConfirmDialog
        open={Boolean(zoneToDelete)}
        onOpenChange={(open) => !open && setZoneToDelete(null)}
        title="Delete Hosted Zone"
        description={`Are you sure you want to delete hosted zone "${zoneToDelete?.name}"?`}
        onConfirm={handleDelete}
        isPending={isDeleting}
      />

      {/* Create Hosted Zone Dialog */}
      <CreateHostedZoneDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onCreated={(zone) => {
          handleOpenZone(zone);
        }}
      />
    </div>
  );
}
