import { useState, useMemo } from "react";
import { Check, Copy, FileCode, FileText, Maximize2, WrapText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import type { LogEventRecord } from "@/lib/logs";

interface LogEventDetailDialogProps {
  event: LogEventRecord | null;
  logGroupName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LogEventDetailDialog({
  event,
  logGroupName,
  open,
  onOpenChange,
}: LogEventDetailDialogProps) {
  const [copied, setCopied] = useState(false);
  const [wrapLines, setWrapLines] = useState(true);
  const [viewMode, setViewMode] = useState<"formatted" | "raw">("formatted");

  // Attempt to parse JSON from the message (either the whole message or embedded JSON)
  const parsedJson = useMemo(() => {
    if (!event?.message) return null;
    const trimmed = event.message.trim();

    // 1. Direct JSON string
    if (
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))
    ) {
      try {
        return JSON.stringify(JSON.parse(trimmed), null, 2);
      } catch {
        return null;
      }
    }

    // 2. Embedded JSON (e.g. "2026-09-10T12:00:00Z\tINFO\t{...}")
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        const potentialJson = trimmed.slice(firstBrace, lastBrace + 1);
        return JSON.stringify(JSON.parse(potentialJson), null, 2);
      } catch {
        return null;
      }
    }

    return null;
  }, [event?.message]);

  if (!event) return null;

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Log message copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy log message");
    }
  };

  const isoTime = new Date(event.timestamp).toISOString();
  const localTime = new Date(event.timestamp).toLocaleString();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl sm:max-w-3xl min-w-0 max-h-[calc(100vh-4rem)] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Maximize2 className="h-5 w-5 text-primary" />
            <DialogTitle>Log Event Details</DialogTitle>
          </div>
          <DialogDescription className="truncate">
            {logGroupName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 text-xs">
          {/* Metadata Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-muted/40 p-3 rounded-lg border text-muted-foreground">
            <div>
              <span className="font-semibold text-foreground">Timestamp:</span>{" "}
              <span className="font-mono">{isoTime}</span>
              <div className="text-[11px] text-muted-foreground/80 font-mono">
                {localTime}
              </div>
            </div>
            <div className="truncate">
              <span className="font-semibold text-foreground">Log Stream:</span>{" "}
              <span className="font-mono truncate" title={event.streamName}>
                {event.streamName}
              </span>
              {event.id && (
                <div className="text-[11px] text-muted-foreground/80 font-mono truncate" title={event.id}>
                  ID: {event.id}
                </div>
              )}
            </div>
          </div>

          {/* Controls Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
            <div className="flex items-center gap-1">
              {parsedJson && (
                <div className="flex items-center rounded-md border bg-muted/40 p-0.5">
                  <button
                    type="button"
                    onClick={() => setViewMode("formatted")}
                    className={`flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                      viewMode === "formatted"
                        ? "bg-background text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <FileCode className="h-3.5 w-3.5" />
                    Formatted JSON
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("raw")}
                    className={`flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                      viewMode === "raw"
                        ? "bg-background text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Raw Text
                  </button>
                </div>
              )}
              {parsedJson && (
                <Badge variant="secondary" className="text-[10px] ml-1">
                  JSON detected
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant={wrapLines ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setWrapLines(!wrapLines)}
                className="h-7 text-xs gap-1"
                title="Toggle line wrapping"
              >
                <WrapText className="h-3.5 w-3.5" />
                Wrap
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  handleCopy(
                    viewMode === "formatted" && parsedJson
                      ? parsedJson
                      : event.message,
                  )
                }
                className="h-7 text-xs gap-1"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                Copy message
              </Button>
            </div>
          </div>

          {/* Message Content */}
          <div className="rounded-lg border bg-card/60 overflow-hidden shadow-xs">
            <pre
              className={`p-3 font-mono text-xs text-foreground/90 bg-muted/20 max-h-[50vh] overflow-auto ${
                wrapLines ? "whitespace-pre-wrap break-all" : "whitespace-pre overflow-x-auto"
              }`}
            >
              {viewMode === "formatted" && parsedJson
                ? parsedJson
                : event.message}
            </pre>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
