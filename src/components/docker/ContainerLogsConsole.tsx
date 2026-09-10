import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { CircleAlert, Pause, Play, RotateCw, Search, WrapText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDockerAdapter } from "@/hooks/use-docker";

const MAX_LINES = 5_000;
const ESTIMATED_LINE_HEIGHT = 22;

interface ContainerLogsConsoleProps {
  containerId: string;
}

export function ContainerLogsConsole({ containerId }: ContainerLogsConsoleProps) {
  const adapter = useDockerAdapter();

  const [lines, setLines] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [search, setSearch] = useState("");
  const [isPaused, setIsPaused] = useState(false);
  const [isWrapLines, setIsWrapLines] = useState(false);

  const sessionIdRef = useRef<string>(crypto.randomUUID());
  const onBatchRef = useRef<(batch: string[]) => void>(() => {});
  onBatchRef.current = (batch: string[]) => {
    if (batch.length === 0) return;
    setLines((prev) => {
      const next = [...prev, ...batch];
      return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
    });
  };
  useEffect(() => {
    const sessionId = sessionIdRef.current;
    let cancelled = false;
    setError(null);
    setLines((prev) => (prev.length > 0 ? [] : prev));
    adapter
      .containerLogs(sessionId, containerId, 500, (batch) => {
        if (!cancelled) onBatchRef.current(batch);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
      void adapter.stopContainerLogs(sessionId);
    };
  }, [adapter, containerId, attempt]);

  const displayLines = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return lines;
    return lines.filter((line) => line.toLowerCase().includes(q));
  }, [lines, search]);

  // Virtualizer
  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: displayLines.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ESTIMATED_LINE_HEIGHT,
    overscan: 20,
  });

  // Autoscroll while not paused
  useEffect(() => {
    if (isPaused) return;
    const el = parentRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [displayLines.length, isPaused]);

  const lineCount = lines.length;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2" data-testid="container-logs-console">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search logs…"
            className="h-8 pl-8 text-xs"
            aria-label="Search logs"
          />
        </div>
        <Button
          variant={isPaused ? "secondary" : "outline"}
          size="sm"
          onClick={() => setIsPaused((p) => !p)}
          className="h-8 gap-1.5 text-xs"
          aria-label={isPaused ? "Resume follow" : "Pause follow"}
        >
          {isPaused ? (
            <>
              <Play className="size-3.5" />
              <span>Resume</span>
            </>
          ) : (
            <>
              <Pause className="size-3.5" />
              <span>Pause</span>
            </>
          )}
        </Button>
        <Button
          variant={isWrapLines ? "secondary" : "outline"}
          size="sm"
          onClick={() => setIsWrapLines((w) => !w)}
          className="h-8 gap-1.5 text-xs"
          aria-label={isWrapLines ? "Disable wrap" : "Enable wrap"}
          title={isWrapLines ? "Wrap disabled" : "Wrap long lines"}
        >
          <WrapText className="size-3.5" />
        </Button>
        <span className="text-xs text-muted-foreground" data-testid="log-line-count">
          {lineCount} {lineCount === 1 ? "line" : "lines"}
        </span>
      </div>

      {/* Console */}
      {error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-md border border-dashed p-8 text-center">
          <CircleAlert className="size-8 text-destructive" />
          <div>
            <p className="text-sm font-medium">Failed to stream logs</p>
            <p className="text-xs text-muted-foreground">{error}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAttempt((n) => n + 1)}
            className="gap-1.5"
          >
            <RotateCw className="size-3.5" />
            <span>Retry</span>
          </Button>
        </div>
      ) : displayLines.length === 0 ? (
        <div className="flex flex-1 items-center justify-center rounded-md border border-dashed p-8 text-sm text-muted-foreground">
          {search ? "No log lines match the search" : "Waiting for log output…"}
        </div>
      ) : (
        <div
          ref={parentRef}
          className="min-h-0 flex-1 overflow-auto rounded-md border bg-muted/40 font-mono text-xs"
        >
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const line = displayLines[virtualRow.index];
              return (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  className={
                    isWrapLines
                      ? "px-3 py-0.5 break-all whitespace-pre-wrap"
                      : "px-3 py-0.5 whitespace-pre"
                  }
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  {line}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {isPaused && !error && (
        <div className="text-xs text-muted-foreground" data-testid="paused-indicator">
          Paused — new lines keep buffering in the background
        </div>
      )}
    </div>
  );
}
