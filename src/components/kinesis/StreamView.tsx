import { useState } from "react";
import {
  CircleAlert,
  Loader2,
  Play,
  RotateCw,
  Search,
  Users,
  Waves,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useStreamSummary,
  useKinesisShards,
  useKinesisConsumers,
  useKinesisClient,
  useKinesisActions,
} from "@/hooks/use-kinesis";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ServiceDisabledView } from "@/components/ServiceDisabledView";
import { isServiceDisabledError, useServiceStatus } from "@/hooks/use-health";
import { useActiveProfile } from "@/store/profiles";
import {
  peekRecords as peekRecordsLib,
  type KinesisRecordLite,
  type ShardLite,
} from "@/lib/kinesis";

interface StreamViewProps {
  streamName: string;
}

interface PutRecordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  streamName: string;
}

function PutRecordDialog({
  open,
  onOpenChange,
  streamName,
}: PutRecordDialogProps) {
  const [data, setData] = useState("");
  const [partitionKey, setPartitionKey] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { putRecord } = useKinesisActions();

  const isValid = data.length > 0 && partitionKey.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const seq = await putRecord({ streamName, data, partitionKey });
      if (seq !== null) {
        setData("");
        setPartitionKey("");
        onOpenChange(false);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit} className="min-w-0">
          <DialogHeader>
            <DialogTitle>Put record</DialogTitle>
            <DialogDescription>
              Publish a test record to stream “{streamName}”.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4 min-w-0">
            <div className="space-y-2">
              <Label htmlFor="record-data">Record data</Label>
              <Input
                id="record-data"
                value={data}
                onChange={(e) => setData(e.target.value)}
                placeholder="hello"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="record-partition-key">Partition key</Label>
              <Input
                id="record-partition-key"
                value={partitionKey}
                onChange={(e) => setPartitionKey(e.target.value)}
                placeholder="key-1"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!isValid || isSubmitting}>
              {isSubmitting ? "Publishing..." : "Publish"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function statusBadgeVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "ACTIVE") return "default";
  if (status === "DELETING" || status === "UPDATING") return "secondary";
  return "outline";
}

function ShardPeekResult({ records }: { records: KinesisRecordLite[] | null }) {
  if (records === null || records.length === 0) {
    return <p className="mt-2 text-xs text-muted-foreground">No records returned.</p>;
  }
  return (
    <div className="mt-2 space-y-1.5">
      {records.map((record) => (
        <div
          key={record.sequenceNumber}
          className="rounded border bg-muted/30 px-2 py-1.5 font-mono text-xs"
        >
          <span className="text-muted-foreground">{record.partitionKey} · </span>
          {record.data}
        </div>
      ))}
    </div>
  );
}

export function StreamView({ streamName }: StreamViewProps) {
  const profile = useActiveProfile();
  const serviceStatus = useServiceStatus("kinesis");
  const client = useKinesisClient();

  const {
    data: summary,
    isPending,
    error,
    refetch: refetchSummary,
    isFetching: isSummaryFetching,
  } = useStreamSummary(profile.id, streamName);
  const {
    data: shards,
    isPending: isShardsPending,
    refetch: refetchShards,
  } = useKinesisShards(profile.id, streamName);
  const { data: consumers, isPending: isConsumersPending } = useKinesisConsumers(
    profile.id,
    streamName,
  );

  const [isPutOpen, setIsPutOpen] = useState(false);
  const [recordsByShard, setRecordsByShard] = useState<
    Record<string, KinesisRecordLite[] | null>
  >({});
  const [peekingShard, setPeekingShard] = useState<string | null>(null);

  if (serviceStatus === "disabled" || (error && isServiceDisabledError(error))) {
    return <ServiceDisabledView service="kinesis" />;
  }

  const handleRefresh = () => {
    refetchSummary();
    refetchShards();
  };

  const handlePeek = async (shard: ShardLite) => {
    setPeekingShard(shard.shardId);
    try {
      const records = await peekRecordsLib(client, {
        streamName,
        shardId: shard.shardId,
      });
      setRecordsByShard((prev) => ({ ...prev, [shard.shardId]: records }));
    } catch {
      setRecordsByShard((prev) => ({ ...prev, [shard.shardId]: null }));
    } finally {
      setPeekingShard(null);
    }
  };

  if (isPending) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <CircleAlert className="h-8 w-8 text-destructive" />
        <p className="text-sm font-medium">Failed to load stream</p>
        <p className="text-xs text-muted-foreground">
          {error instanceof Error ? error.message : String(error)}
        </p>
        <Button variant="outline" size="sm" onClick={() => refetchSummary()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Waves className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold">{streamName}</h1>
                {summary ? (
                  <Badge
                    variant={statusBadgeVariant(summary.status)}
                    className="text-xs"
                  >
                    {summary.status}
                  </Badge>
                ) : null}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-xs text-muted-foreground">
                  {summary
                    ? `${summary.shardCount ?? "?"} open shards · ${summary.retentionPeriodHours ?? 24}h retention`
                    : "Loading summary…"}
                </span>
                {isSummaryFetching && (
                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              title="Refresh stream"
            >
              <RotateCw className="h-4 w-4" />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button size="sm" onClick={() => setIsPutOpen(true)}>
              <Play className="h-4 w-4" />
              Put record
            </Button>
          </div>
        </div>
      </div>

      {/* Panes */}
      <div className="flex-1 space-y-4 overflow-auto p-6">
        {/* Shards */}
        <section className="rounded-lg border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <h2 className="text-sm font-medium">Shards</h2>
            <span className="text-xs text-muted-foreground">TRIM_HORIZON peek</span>
          </div>
          <div>
            {isShardsPending ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : !shards || shards.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                No shards on this stream.
              </p>
            ) : (
              <div className="divide-y">
                {shards.map((shard) => {
                  const records = recordsByShard[shard.shardId];
                  const hasPeeked = shard.shardId in recordsByShard;
                  return (
                    <div key={shard.shardId} className="px-4 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs">{shard.shardId}</span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => handlePeek(shard)}
                          disabled={peekingShard === shard.shardId}
                        >
                          <Search className="mr-1 h-3 w-3" />
                          {peekingShard === shard.shardId ? "Peeking..." : "Peek"}
                        </Button>
                      </div>
                      {hasPeeked ? <ShardPeekResult records={records ?? null} /> : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Consumers (read-only) */}
        <section className="rounded-lg border bg-card">
          <div className="flex items-center gap-2 border-b px-4 py-2.5">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            <h2 className="text-sm font-medium">Consumers (EFO)</h2>
            <Badge variant="outline" className="ml-auto text-xs">
              read-only
            </Badge>
          </div>
          <div className="px-4 py-3">
            {isConsumersPending ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : !consumers || consumers.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No enhanced consumers registered.
              </p>
            ) : (
              <ul className="space-y-1">
                {consumers.map((consumer) => (
                  <li key={consumer.arn} className="font-mono text-xs">
                    {consumer.name}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      <PutRecordDialog
        open={isPutOpen}
        onOpenChange={setIsPutOpen}
        streamName={streamName}
      />
    </div>
  );
}
