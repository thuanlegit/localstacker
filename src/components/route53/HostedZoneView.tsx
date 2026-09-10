import { useState, useRef, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Globe,
  Search,
  Plus,
  RotateCw,
  Copy,
  Check,
  Trash2,
  Edit2,
  Loader2,
  Lock,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { RecordSetDialog } from "./RecordSetDialog";
import {
  useHostedZones,
  useResourceRecordSets,
  useHostedZoneActions,
  useRecordSetActions,
} from "@/hooks/use-route53";
import { useTabs } from "@/store/tabs";
import type { ResourceRecordSetSummary } from "@/lib/route53";

interface HostedZoneViewProps {
  zoneId: string;
}

export function HostedZoneView({ zoneId }: HostedZoneViewProps) {
  const [search, setSearch] = useState("");
  const [copiedId, setCopiedId] = useState(false);

  // Dialogs
  const [isRecordDialogOpen, setIsRecordDialogOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<
    ResourceRecordSetSummary | undefined
  >();

  // Zone deletion
  const [isDeleteZoneOpen, setIsDeleteZoneOpen] = useState(false);
  const [isDeletingZone, setIsDeletingZone] = useState(false);

  // Record deletion
  const [deletingRecord, setDeletingRecord] = useState<
    ResourceRecordSetSummary | null
  >(null);
  const [isDeletingRecord, setIsDeletingRecord] = useState(false);

  const {
    data: zones = [],
    isLoading: isZonesLoading,
    refetch: refetchZones,
  } = useHostedZones();

  const zone = zones.find((z) => z.id === zoneId || z.rawId === zoneId);

  const {
    data: records = [],
    isLoading: isRecordsLoading,
    isFetching: isRecordsFetching,
    refetch: refetchRecords,
  } = useResourceRecordSets(zoneId);

  const { deleteHostedZone } = useHostedZoneActions();
  const { deleteRecordSet } = useRecordSetActions(zoneId);

  const handleCopyId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      setCopiedId(true);
      toast.success("Zone ID copied to clipboard");
      setTimeout(() => setCopiedId(false), 2000);
    } catch {
      toast.error("Failed to copy Zone ID");
    }
  };

  const handleDeleteZone = async () => {
    setIsDeletingZone(true);
    try {
      const ok = await deleteHostedZone(zoneId, zone?.name);
      if (ok) {
        setIsDeleteZoneOpen(false);
        useTabs.getState().closeTab(`hostedZone:${zoneId}`);
      }
    } finally {
      setIsDeletingZone(false);
    }
  };

  const handleDeleteRecord = async () => {
    if (!deletingRecord) return;
    setIsDeletingRecord(true);
    try {
      const ok = await deleteRecordSet({
        name: deletingRecord.name,
        type: deletingRecord.type,
        ttl: deletingRecord.ttl,
        values: deletingRecord.values,
      });
      if (ok) {
        setDeletingRecord(null);
      }
    } finally {
      setIsDeletingRecord(false);
    }
  };

  // Filter records
  const filteredRecords = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return records;
    return records.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.type.toLowerCase().includes(q) ||
        r.values.some((v) => v.toLowerCase().includes(q)),
    );
  }, [records, search]);

  // Virtualizer setup
  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: filteredRecords.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 44,
    overscan: 10,
  });

  const isApexRecord = (r: ResourceRecordSetSummary): boolean => {
    if (!zone) return false;
    const normZone = zone.name.endsWith(".") ? zone.name : `${zone.name}.`;
    const normRecord = r.name.endsWith(".") ? r.name : `${r.name}.`;
    return (
      normRecord === normZone && (r.type === "NS" || r.type === "SOA")
    );
  };

  if (isZonesLoading && !zone) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const zoneName = zone?.name ?? zoneId;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="flex shrink-0 items-start justify-between border-b px-6 py-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Globe className="h-5 w-5" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight">{zoneName}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge
              variant="outline"
              className="flex items-center gap-1.5 font-mono text-[11px] py-0.5"
            >
              <span>{zoneId}</span>
              <button
                type="button"
                onClick={() => handleCopyId(zoneId)}
                className="hover:text-foreground text-muted-foreground ml-1"
                title="Copy Zone ID"
              >
                {copiedId ? (
                  <Check className="h-3 w-3 text-emerald-500" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </button>
            </Badge>
            <Badge
              variant={zone?.privateZone ? "secondary" : "default"}
              className="text-[10px] px-1.5 py-0"
            >
              {zone?.privateZone ? "Private" : "Public"}
            </Badge>
            <span className="text-muted-foreground">
              {records.length} records
            </span>
            {zone?.comment && (
              <span className="text-muted-foreground italic">
                — {zone.comment}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              refetchZones();
              refetchRecords();
            }}
            disabled={isRecordsFetching}
            title="Refresh"
          >
            <RotateCw
              className={`h-4 w-4 ${isRecordsFetching ? "animate-spin" : ""}`}
            />
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setIsDeleteZoneOpen(true)}
          >
            <Trash2 className="mr-1.5 h-4 w-4" /> Delete Zone
          </Button>
        </div>
      </div>

      {/* Action Toolbar */}
      <div className="flex shrink-0 items-center justify-between gap-4 border-b px-6 py-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search records by name, type, value..."
            className="pl-8 text-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <Button
          size="sm"
          onClick={() => {
            setEditingRecord(undefined);
            setIsRecordDialogOpen(true);
          }}
        >
          <Plus className="mr-1.5 h-4 w-4" /> Create Record
        </Button>
      </div>

      {/* Virtualized Grid */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Table Header */}
        <div className="grid grid-cols-12 border-b bg-muted/40 px-6 py-2.5 text-xs font-medium text-muted-foreground select-none shrink-0">
          <div className="col-span-4">Record Name</div>
          <div className="col-span-2">Type</div>
          <div className="col-span-1">TTL</div>
          <div className="col-span-4">Routing Values / Target</div>
          <div className="col-span-1 text-right">Actions</div>
        </div>

        {isRecordsLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">
            {search ? "No records match your filter." : "No records in this hosted zone."}
          </div>
        ) : (
          <div ref={parentRef} className="flex-1 overflow-auto min-h-0">
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: "100%",
                position: "relative",
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const record = filteredRecords[virtualRow.index];
                const isApex = isApexRecord(record);

                return (
                  <div
                    key={virtualRow.key}
                    data-index={virtualRow.index}
                    ref={rowVirtualizer.measureElement}
                    className="absolute top-0 left-0 w-full grid grid-cols-12 items-center px-6 py-2.5 text-xs border-b hover:bg-muted/20 transition-colors"
                    style={{
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    {/* Record Name */}
                    <div className="col-span-4 font-mono font-medium truncate flex items-center gap-1.5">
                      <span className="truncate" title={record.name}>
                        {record.name}
                      </span>
                      {isApex && (
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1 py-0 border-amber-500/50 text-amber-600 dark:text-amber-400 font-sans shrink-0"
                          title="Apex system record"
                        >
                          Apex
                        </Badge>
                      )}
                    </div>

                    {/* Type */}
                    <div className="col-span-2">
                      <Badge
                        variant="secondary"
                        className="text-[10px] px-1.5 py-0 font-mono font-semibold"
                      >
                        {record.type}
                      </Badge>
                    </div>

                    {/* TTL */}
                    <div className="col-span-1 text-muted-foreground font-mono">
                      {record.ttl ?? "—"}
                    </div>

                    {/* Values */}
                    <div
                      className="col-span-4 font-mono text-muted-foreground truncate"
                      title={record.values.join(", ")}
                    >
                      {record.values.length > 0
                        ? record.values.join(", ")
                        : record.aliasTarget
                          ? `Alias: ${record.aliasTarget.dnsName}`
                          : "—"}
                    </div>

                    {/* Actions */}
                    <div className="col-span-1 flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => {
                          setEditingRecord(record);
                          setIsRecordDialogOpen(true);
                        }}
                        title="Edit record"
                      >
                        <Edit2 className="h-3 w-3" />
                      </Button>
                      {isApex ? (
                        <span
                          className="inline-flex h-6 w-6 items-center justify-center text-muted-foreground/40 cursor-not-allowed"
                          title="Apex system record protected from deletion"
                        >
                          <Lock className="h-3 w-3" />
                        </span>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive hover:bg-destructive/10"
                          onClick={() => setDeletingRecord(record)}
                          title="Delete record"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Delete Hosted Zone Confirm Dialog */}
      <DeleteConfirmDialog
        open={isDeleteZoneOpen}
        onOpenChange={setIsDeleteZoneOpen}
        title="Delete Hosted Zone"
        description={`Are you sure you want to delete hosted zone "${zoneName}"?`}
        onConfirm={handleDeleteZone}
        isPending={isDeletingZone}
      />

      {/* Delete Record Confirm Dialog */}
      <DeleteConfirmDialog
        open={Boolean(deletingRecord)}
        onOpenChange={(open) => !open && setDeletingRecord(null)}
        title="Delete Resource Record"
        description={`Are you sure you want to delete record "${deletingRecord?.name}" (${deletingRecord?.type})?`}
        onConfirm={handleDeleteRecord}
        isPending={isDeletingRecord}
      />

      {/* Create / Edit Record Dialog */}
      <RecordSetDialog
        open={isRecordDialogOpen}
        onOpenChange={setIsRecordDialogOpen}
        zoneId={zoneId}
        zoneName={zoneName}
        initialRecord={editingRecord}
        onSaved={() => {
          refetchRecords();
        }}
      />
    </div>
  );
}
