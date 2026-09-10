import { useState, useMemo } from "react";
import { Loader2, Radio } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useActiveProfile } from "@/store/profiles";
import { useQueues } from "@/hooks/use-sqs";
import { useEventSourceMappingActions } from "@/hooks/use-lambda";

export interface AddTriggerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  functionName: string;
}

export function AddTriggerDialog({
  open,
  onOpenChange,
  functionName,
}: AddTriggerDialogProps) {
  const profile = useActiveProfile();
  const { data: queues, isLoading: isLoadingQueues } = useQueues(profile.id, {
    enabled: open,
  });
  const { createMapping } = useEventSourceMappingActions();

  const [triggerType, setTriggerType] = useState<"sqs" | "custom">("sqs");
  const [selectedQueueUrl, setSelectedQueueUrl] = useState<string>("");
  const [customArn, setCustomArn] = useState<string>("");
  const [batchSize, setBatchSize] = useState<number>(10);
  const [batchWindow, setBatchWindow] = useState<number>(0);
  const [enabled, setEnabled] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Auto-select first queue when queues load
  const selectedQueue = useMemo(() => {
    if (!queues || queues.length === 0) return null;
    return queues.find((q) => q.url === selectedQueueUrl) ?? queues[0] ?? null;
  }, [queues, selectedQueueUrl]);

  const eventSourceArn = useMemo(() => {
    if (triggerType === "custom") return customArn.trim();
    return selectedQueue?.attributes.arn ?? "";
  }, [triggerType, customArn, selectedQueue]);

  const isValid = useMemo(() => {
    if (triggerType === "custom") {
      return customArn.trim().startsWith("arn:aws:");
    }
    return Boolean(eventSourceArn);
  }, [triggerType, customArn, eventSourceArn]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const res = await createMapping({
        functionName,
        eventSourceArn,
        batchSize: Number(batchSize) || 10,
        maximumBatchingWindowInSeconds: Number(batchWindow) || 0,
        enabled,
      });

      if (res) {
        onOpenChange(false);
        // Reset state
        setSelectedQueueUrl("");
        setCustomArn("");
        setBatchSize(10);
        setBatchWindow(0);
        setEnabled(true);
      }
    } catch {
      toast.error("Failed to attach trigger");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add Event Source Trigger</DialogTitle>
            <DialogDescription>
              Configure an event source (such as an SQS Queue) to invoke{" "}
              <span className="font-semibold text-foreground">{functionName}</span>{" "}
              when messages are available.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Trigger source type */}
            <div className="space-y-2">
              <Label>Source Type</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={triggerType === "sqs" ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => setTriggerType("sqs")}
                  className="flex-1 text-xs"
                >
                  <Radio className="mr-1.5 h-3.5 w-3.5" />
                  SQS Queue
                </Button>
                <Button
                  type="button"
                  variant={triggerType === "custom" ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => setTriggerType("custom")}
                  className="flex-1 text-xs"
                >
                  Custom ARN
                </Button>
              </div>
            </div>

            {/* SQS Queue Selection */}
            {triggerType === "sqs" ? (
              <div className="space-y-2">
                <Label htmlFor="sqs-select">Select SQS Queue</Label>
                {isLoadingQueues ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Loading queues...
                  </div>
                ) : !queues || queues.length === 0 ? (
                  <div className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
                    No SQS queues found in this profile. Create a queue in SQS first, or specify a custom ARN.
                  </div>
                ) : (
                  <Select
                    value={selectedQueue?.url ?? ""}
                    onValueChange={(val) => setSelectedQueueUrl(val)}
                  >
                    <SelectTrigger id="sqs-select" className="w-full text-xs font-mono">
                      <SelectValue placeholder="Choose a queue..." />
                    </SelectTrigger>
                    <SelectContent>
                      {queues.map((q) => (
                        <SelectItem
                          key={q.url}
                          value={q.url}
                          className="text-xs font-mono"
                        >
                          <div className="flex items-center justify-between w-full gap-2">
                            <span>{q.name}</span>
                            {q.isFifo && (
                              <Badge variant="outline" className="text-[10px] py-0 px-1">
                                FIFO
                              </Badge>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {selectedQueue?.attributes.arn && (
                  <p className="text-[11px] font-mono text-muted-foreground truncate" title={selectedQueue.attributes.arn}>
                    ARN: {selectedQueue.attributes.arn}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="custom-arn">Event Source ARN</Label>
                <Input
                  id="custom-arn"
                  placeholder="arn:aws:sqs:us-east-1:000000000000:my-queue"
                  value={customArn}
                  onChange={(e) => setCustomArn(e.target.value)}
                  className="font-mono text-xs"
                />
                <p className="text-[11px] text-muted-foreground">
                  Supports SQS Queues, DynamoDB Streams, or Kinesis Stream ARNs.
                </p>
              </div>
            )}

            {/* Batch Size */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="batch-size">Batch Size</Label>
                <Input
                  id="batch-size"
                  type="number"
                  min={1}
                  max={10000}
                  value={batchSize}
                  onChange={(e) => setBatchSize(parseInt(e.target.value, 10) || 1)}
                  className="text-xs font-mono"
                />
                <p className="text-[10px] text-muted-foreground">
                  Max records sent per batch (1 - 10,000).
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="batch-window">Batch Window (s)</Label>
                <Input
                  id="batch-window"
                  type="number"
                  min={0}
                  max={300}
                  value={batchWindow}
                  onChange={(e) => setBatchWindow(parseInt(e.target.value, 10) || 0)}
                  className="text-xs font-mono"
                />
                <p className="text-[10px] text-muted-foreground">
                  Max seconds to wait before invoking (0 - 300).
                </p>
              </div>
            </div>

            {/* Enabled Checkbox */}
            <div className="flex items-center space-x-2 pt-1">
              <input
                type="checkbox"
                id="enable-trigger-checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
              />
              <Label
                htmlFor="enable-trigger-checkbox"
                className="text-xs font-normal cursor-pointer"
              >
                Enable trigger immediately
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!isValid || isSubmitting}>
              {isSubmitting && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              )}
              Add Trigger
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
