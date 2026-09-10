import { useState, useMemo, useEffect } from "react";
import { Loader2, Zap } from "lucide-react";
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
import { useFunctions, useEventSourceMappingActions } from "@/hooks/use-lambda";
import type { QueueSummary } from "@/lib/sqs";

export interface AttachLambdaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  queue: QueueSummary;
}

export function AttachLambdaDialog({
  open,
  onOpenChange,
  queue,
}: AttachLambdaDialogProps) {
  const profile = useActiveProfile();
  const { data: functions, isLoading: isLoadingFunctions } = useFunctions(
    profile.id,
    { enabled: open },
  );
  const { createMapping } = useEventSourceMappingActions();

  const [selectedFunctionName, setSelectedFunctionName] = useState<string>("");
  const [batchSize, setBatchSize] = useState<number>(10);
  const [batchWindow, setBatchWindow] = useState<number>(0);
  const [enabled, setEnabled] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (open) {
      setSelectedFunctionName("");
      setBatchSize(10);
      setBatchWindow(0);
      setEnabled(true);
    }
  }, [open]);

  const selectedFunction = useMemo(() => {
    if (!functions || functions.length === 0) return null;
    return (
      functions.find((f) => f.name === selectedFunctionName) ??
      functions[0] ??
      null
    );
  }, [functions, selectedFunctionName]);

  const isValid = Boolean(selectedFunction && queue.attributes.arn);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || !selectedFunction || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const res = await createMapping({
        functionName: selectedFunction.name,
        eventSourceArn: queue.attributes.arn,
        batchSize: Number(batchSize) || 10,
        maximumBatchingWindowInSeconds: Number(batchWindow) || 0,
        enabled,
      });

      if (res) {
        onOpenChange(false);
        setSelectedFunctionName("");
        setBatchSize(10);
        setBatchWindow(0);
        setEnabled(true);
      }
    } catch {
      toast.error("Failed to attach Lambda function");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="min-w-0">
          <DialogHeader>
            <DialogTitle>Attach Lambda Trigger</DialogTitle>
            <DialogDescription>
              Configure a Lambda function to automatically poll and process messages
              from <span className="font-semibold text-foreground">{queue.name}</span>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4 min-w-0">
            {/* Target Queue info */}
            <div className="rounded-md bg-muted/50 p-3 space-y-1 min-w-0">
              <span className="text-xs font-medium text-muted-foreground uppercase">
                Source Queue
              </span>
              <p className="font-mono text-xs font-semibold text-foreground">
                {queue.name}
              </p>
              <p
                className="font-mono text-[11px] text-muted-foreground break-all"
                title={queue.attributes.arn}
              >
                ARN: {queue.attributes.arn || "Loading ARN..."}
              </p>
            </div>

            {/* Lambda Function Selector */}
            <div className="space-y-2 min-w-0">
              <Label htmlFor="lambda-select">Target Lambda Function</Label>
              {isLoadingFunctions ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading Lambda functions...
                </div>
              ) : !functions || functions.length === 0 ? (
                <div className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
                  No Lambda functions found in this profile. Create a Lambda function first in the Lambda service.
                </div>
              ) : (
                <Select
                  value={selectedFunction?.name ?? ""}
                  onValueChange={(val) => setSelectedFunctionName(val)}
                >
                  <SelectTrigger id="lambda-select" className="w-full text-xs font-mono">
                    <SelectValue placeholder="Choose a Lambda function..." />
                  </SelectTrigger>
                  <SelectContent>
                    {functions.map((fn) => (
                      <SelectItem
                        key={fn.name}
                        value={fn.name}
                        className="text-xs font-mono"
                      >
                        <div className="flex items-center gap-2">
                          <Zap className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{fn.name}</span>
                          {fn.runtime && (
                            <span className="text-muted-foreground text-[10px]">
                              ({fn.runtime})
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Batch Size & Batch Window */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="lambda-batch-size">Batch Size</Label>
                <Input
                  id="lambda-batch-size"
                  type="number"
                  min={1}
                  max={10000}
                  value={batchSize}
                  onChange={(e) => setBatchSize(parseInt(e.target.value, 10) || 1)}
                  className="text-xs font-mono"
                />
                <p className="text-[10px] text-muted-foreground">
                  Messages per batch (1 - 10,000).
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="lambda-batch-window">Batch Window (s)</Label>
                <Input
                  id="lambda-batch-window"
                  type="number"
                  min={0}
                  max={300}
                  value={batchWindow}
                  onChange={(e) =>
                    setBatchWindow(parseInt(e.target.value, 10) || 0)
                  }
                  className="text-xs font-mono"
                />
                <p className="text-[10px] text-muted-foreground">
                  Wait buffer in seconds (0 - 300).
                </p>
              </div>
            </div>

            {/* Enabled Checkbox with live explanation */}
            <div className="rounded-md border p-3 space-y-1.5 bg-muted/20">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="enable-lambda-trigger-checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-input text-primary focus:ring-ring cursor-pointer"
                />
                <Label
                  htmlFor="enable-lambda-trigger-checkbox"
                  className="text-xs font-semibold cursor-pointer select-none"
                >
                  Enable trigger immediately
                </Label>
                <Badge
                  variant={enabled ? "default" : "outline"}
                  className={`text-[9px] px-1.5 py-0 h-4 ${
                    enabled
                      ? "bg-green-600/80 hover:bg-green-600 text-white"
                      : "text-muted-foreground"
                  }`}
                >
                  {enabled ? "Active" : "Disabled / Paused"}
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground pl-6">
                {enabled
                  ? "When enabled, Lambda actively polls this queue and invokes the function whenever new messages arrive."
                  : "When disabled, the trigger mapping is saved in a paused state. Messages will accumulate in the queue without invoking Lambda until enabled."}
              </p>
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
              Attach Lambda
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
