import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Radio,
  RotateCw,
  Waves,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useStreamShards,
  useStreamActions,
} from "@/hooks/use-dynamodb-streams";
import type { StreamRecordLite } from "@/lib/dynamodb-streams";
import type { StreamViewType, TableStreamInfo } from "@/lib/dynamodb";

interface StreamSectionProps {
  tableName: string;
  stream?: TableStreamInfo;
}

const VIEW_TYPES: StreamViewType[] = [
  "NEW_AND_OLD_IMAGES",
  "KEYS_ONLY",
  "NEW_IMAGE",
  "OLD_IMAGE",
];

export function StreamSection({ tableName, stream }: StreamSectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [viewType, setViewType] = useState<StreamViewType>("NEW_AND_OLD_IMAGES");
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const [records, setRecords] = useState<StreamRecordLite[] | null>(null);
  const [isPeeking, setIsPeeking] = useState(false);

  const isEnabled = Boolean(stream?.enabled);
  const streamArn = stream?.arn ?? "";

  const { data: shards, isPending: isShardsPending, refetch: refetchShards } =
    useStreamShards(`table:${tableName}`, streamArn, {
      enabled: isOpen && isEnabled && Boolean(streamArn),
    });
  const { setTableStream, peek } = useStreamActions(tableName);

  const handleToggle = async () => {
    setIsToggling(true);
    try {
      const ok = await setTableStream(!isEnabled, viewType, tableName);
      if (ok) {
        setIsConfirmOpen(false);
        setRecords(null);
      }
    } finally {
      setIsToggling(false);
    }
  };

  const handlePeek = async () => {
    setIsPeeking(true);
    try {
      const result = await peek(streamArn);
      if (result) {
        setRecords(result);
      }
    } finally {
      setIsPeeking(false);
    }
  };

  return (
    <div className="border-b bg-muted/10 px-6 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          className="flex items-center gap-2 text-sm font-medium text-foreground"
          onClick={() => setIsOpen((v) => !v)}
        >
          {isOpen ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <Waves className="h-4 w-4 text-muted-foreground" />
          Stream
        </button>

        <div className="flex items-center gap-2">
          <Badge variant={isEnabled ? "default" : "outline"} className="text-xs">
            {isEnabled
              ? `Enabled${stream?.viewType ? ` · ${stream.viewType}` : ""}`
              : "Disabled"}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => setIsConfirmOpen(true)}
          >
            {isEnabled ? "Disable stream" : "Enable stream"}
          </Button>
        </div>
      </div>

      {isOpen && (
        <div className="mt-3 space-y-3 pb-2">
          {isEnabled && streamArn ? (
            <>
              <p className="break-all font-mono text-xs text-muted-foreground">
                {streamArn}
                {stream?.label ? ` (label ${stream.label})` : ""}
              </p>

              <div className="rounded-md border bg-card">
                <div className="flex items-center justify-between border-b px-3 py-2">
                  <span className="text-xs font-medium">Shards</span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => refetchShards()}
                      title="Refresh shards"
                    >
                      <RotateCw className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={handlePeek}
                      disabled={isPeeking}
                    >
                      {isPeeking ? (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      ) : null}
                      Peek records
                    </Button>
                  </div>
                </div>
                <div className="max-h-40 overflow-auto px-3 py-2">
                  {isShardsPending ? (
                    <div className="flex items-center justify-center py-3">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : !shards || shards.length === 0 ? (
                    <p className="py-2 text-center text-xs text-muted-foreground">
                      No shards available.
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {shards.map((shard) => (
                        <li
                          key={shard.shardId}
                          className="flex items-center justify-between gap-2 font-mono text-xs"
                        >
                          <span className="truncate">{shard.shardId}</span>
                          {shard.sequenceNumberRange?.start ? (
                            <span
                              className="shrink-0 text-muted-foreground"
                              title={`Seq range ${shard.sequenceNumberRange.start} – ${shard.sequenceNumberRange.end ?? "open"}`}
                            >
                              seq {shard.sequenceNumberRange.start.slice(0, 12)}…
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {records !== null && records.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No records returned (TRIM_HORIZON peek).
                </p>
              ) : null}
              {records && records.length > 0 ? (
                <div className="space-y-2">
                  {records.map((record) => (
                    <div
                      key={record.sequenceNumber}
                      className="rounded-md border bg-card p-3"
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <Badge
                          variant={
                            record.eventName === "REMOVE" ? "destructive" : "secondary"
                          }
                          className="text-xs"
                        >
                          {record.eventName ?? "UNKNOWN"}
                        </Badge>
                        {record.approxArrival ? (
                          <span className="text-xs text-muted-foreground">
                            {new Date(record.approxArrival).toLocaleString()}
                          </span>
                        ) : null}
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div>
                          <Label className="text-xs text-muted-foreground">
                            New image
                          </Label>
                          <pre className="mt-1 overflow-auto rounded bg-muted/50 p-2 font-mono text-xs">
                            {record.newImage
                              ? JSON.stringify(record.newImage, null, 2)
                              : "—"}
                          </pre>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">
                            Old image
                          </Label>
                          <pre className="mt-1 overflow-auto rounded bg-muted/50 p-2 font-mono text-xs">
                            {record.oldImage
                              ? JSON.stringify(record.oldImage, null, 2)
                              : "—"}
                          </pre>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">
                Enable DynamoDB Streams to capture item changes. When enabled,
                peek shard records here.
              </span>
              <div className="ml-auto flex items-center gap-2">
                <Radio className="h-3.5 w-3.5 text-muted-foreground" />
                <Select
                  value={viewType}
                  onValueChange={(v) => setViewType(v as StreamViewType)}
                >
                  <SelectTrigger className="h-7 w-[190px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VIEW_TYPES.map((vt) => (
                      <SelectItem key={vt} value={vt} className="text-xs">
                        {vt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>
      )}

      <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isEnabled ? "Disable stream" : "Enable stream"}
            </DialogTitle>
            <DialogDescription>
              {isEnabled
                ? `Disable Streams on table “${tableName}”? Existing shard data becomes unavailable.`
                : `Enable Streams on table “${tableName}” with view type ${viewType}?`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsConfirmOpen(false)}
              disabled={isToggling}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleToggle} disabled={isToggling}>
              {isToggling
                ? "Updating..."
                : isEnabled
                  ? "Disable"
                  : "Enable"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
