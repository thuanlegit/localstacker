import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  CircleAlert,
  Copy,
  Loader2,
  Maximize2,
  Pause,
  Play,
  RotateCw,
  ScrollText,
  Search,
  Trash2,
  WrapText,
} from "lucide-react";
import { toast } from "sonner";
import { LogEventDetailDialog } from "./LogEventDetailDialog";
import type { LogEventRecord } from "@/lib/logs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { useActiveProfile } from "@/store/profiles";
import { useTabs } from "@/store/tabs";
import {
  useLogStreams,
  useLogGroupActions,
  useLogEvents,
} from "@/hooks/use-logs";

interface LogGroupViewProps {
  logGroupName: string;
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number, z = 2) => String(n).padStart(z, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

export function LogGroupView({ logGroupName }: LogGroupViewProps) {
  const profile = useActiveProfile();
  const { closeTab } = useTabs();

  const { data: streams, refetch: refetchStreams } = useLogStreams(
    profile.id,
    logGroupName,
  );
  const actions = useLogGroupActions();

  const {
    events,
    filterPattern,
    setFilterPattern,
    streamName,
    setStreamName,
    isTailing,
    setTailing,
    loadMore,
    hasNextPage,
    isInitialLoading,
    isLoadingMore,
    error,
    refresh,
  } = useLogEvents(logGroupName);

  // Search input debounced ~300ms
  const [searchInput, setSearchInput] = useState(filterPattern);
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilterPattern(searchInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, setFilterPattern]);

  // Dialogs
  const [isDeleteGroupOpen, setIsDeleteGroupOpen] = useState(false);
  const [isDeletingGroup, setIsDeletingGroup] = useState(false);

  const [streamToDelete, setStreamToDelete] = useState<string | null>(null);
  const [isDeletingStream, setIsDeletingStream] = useState(false);

  const displayEvents = useMemo(() => {
    if (!filterPattern.trim()) return events;
    const pattern = filterPattern.trim().toLowerCase();
    return events.filter(
      (e) =>
        e.message.toLowerCase().includes(pattern) ||
        e.streamName.toLowerCase().includes(pattern),
    );
  }, [events, filterPattern]);

  // Log expansion, wrap, copy, and modal state
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [isWrapLines, setIsWrapLines] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<LogEventRecord | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const toggleRowExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isAllExpanded =
    displayEvents.length > 0 && expandedIds.size === displayEvents.length;

  const toggleExpandAll = () => {
    if (isAllExpanded) {
      setExpandedIds(new Set());
    } else {
      setExpandedIds(new Set(displayEvents.map((e) => e.id)));
    }
  };

  const copyMessage = async (
    id: string,
    text: string,
    e?: React.MouseEvent,
  ) => {
    e?.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      toast.success("Log message copied to clipboard");
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error("Failed to copy log message");
    }
  };

  // Virtualizer
  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: displayEvents.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 24,
    overscan: 15,
  });
  const handleDeleteGroup = async () => {
    setIsDeletingGroup(true);
    try {
      const ok = await actions.deleteGroup(logGroupName);
      if (ok) {
        closeTab(`logGroup:${logGroupName}`);
      }
    } finally {
      setIsDeletingGroup(false);
    }
  };

  const handleDeleteStream = async () => {
    if (!streamToDelete) return;
    setIsDeletingStream(true);
    try {
      const ok = await actions.deleteStream(logGroupName, streamToDelete);
      if (ok) {
        if (streamName === streamToDelete) {
          setStreamName(undefined);
        }
        setStreamToDelete(null);
        refetchStreams();
      }
    } finally {
      setIsDeletingStream(false);
    }
  };

  const sortedStreams = useMemo(() => {
    if (!streams) return [];
    return [...streams].sort(
      (a, b) => (b.lastEventTime ?? 0) - (a.lastEventTime ?? 0),
    );
  }, [streams]);

  const showStreamColumn = !streamName;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ScrollText className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">{logGroupName}</h1>
              <p className="text-xs text-muted-foreground">
                {events.length.toLocaleString()} log events loaded
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant={isTailing ? "default" : "outline"}
              size="sm"
              onClick={() => setTailing(!isTailing)}
              title={isTailing ? "Pause live tailing" : "Start live tailing"}
            >
              {isTailing ? (
                <>
                  <Pause className="h-4 w-4" />
                  <span className="hidden sm:inline">Pause tail</span>
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  <span className="hidden sm:inline">Live tail</span>
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                refresh();
                refetchStreams();
              }}
              title="Refresh events"
            >
              <RotateCw className="h-4 w-4" />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setIsDeleteGroupOpen(true)}
            >
              <Trash2 className="h-4 w-4" />
              Delete group
            </Button>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="mt-3 flex flex-wrap items-center gap-3 pt-3 border-t">
          {/* Search filter input */}
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search / filter pattern (e.g. ERROR, RequestId)..."
              className="pl-8 h-8 text-xs font-mono"
            />
          </div>

          {/* Stream selector */}
          <div className="flex items-center gap-1 min-w-[200px]">
            <Select
              value={streamName ?? "__all__"}
              onValueChange={(val) =>
                setStreamName(val === "__all__" ? undefined : val)
              }
            >
              <SelectTrigger className="h-8 text-xs font-mono flex-1">
                <SelectValue placeholder="All streams" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All streams</SelectItem>
                {sortedStreams.map((s) => (
                  <SelectItem key={s.name} value={s.name}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {streamName && (
              <Button
                variant="outline"
                size="icon-xs"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={() => setStreamToDelete(streamName)}
                title={`Delete stream ${streamName}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>

          {/* View options: Wrap & Expand */}
          <div className="flex items-center gap-1.5 ml-auto">
            <Button
              variant={isWrapLines ? "secondary" : "outline"}
              size="sm"
              onClick={() => setIsWrapLines(!isWrapLines)}
              className="h-8 text-xs gap-1.5"
              title="Toggle line wrapping for all events"
            >
              <WrapText className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Wrap lines</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={toggleExpandAll}
              disabled={displayEvents.length === 0}
              className="h-8 text-xs gap-1.5"
              title={isAllExpanded ? "Collapse all events" : "Expand all events"}
            >
              {isAllExpanded ? (
                <>
                  <ChevronsDownUp className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Collapse all</span>
                </>
              ) : (
                <>
                  <ChevronsUpDown className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Expand all</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
      {/* Events Viewer */}
      <div className="flex flex-1 flex-col overflow-hidden bg-background">
        {/* Table header */}
        <div className="border-b bg-muted/40 text-xs font-medium text-muted-foreground flex items-center px-4 py-2 select-none">
          <div className="w-7 flex-none" />
          <div className="w-28 flex-none font-mono">Timestamp</div>
          {showStreamColumn && (
            <div className="w-48 flex-none font-mono truncate">Log Stream</div>
          )}
          <div className="flex-1 font-mono">Message</div>
          <div className="w-16 flex-none text-right font-mono text-[11px] pr-2">Actions</div>
        </div>

        {isInitialLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-destructive p-4">
            <CircleAlert className="h-6 w-6" />
            <p className="text-sm font-medium">Failed to load log events</p>
            <p className="text-xs text-muted-foreground">{error.message}</p>
            <Button variant="outline" size="sm" onClick={() => refresh()}>
              Retry
            </Button>
          </div>
        ) : displayEvents.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-muted-foreground p-6">
            <ScrollText className="h-8 w-8 stroke-1" />
            <p className="text-sm font-medium">No log events found</p>
            <p className="text-xs">
              {filterPattern
                ? "No events match the search filter."
                : "Logs written to this group will appear here."}
            </p>
          </div>
        ) : (
          <div ref={parentRef} className="flex-1 overflow-auto">
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: "100%",
                position: "relative",
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const ev = displayEvents[virtualRow.index];
                const isExpanded = expandedIds.has(ev.id);

                return (
                  <div
                    key={virtualRow.key}
                    data-index={virtualRow.index}
                    ref={rowVirtualizer.measureElement}
                    className={`absolute top-0 left-0 w-full border-b border-border/40 font-mono transition-colors ${
                      isExpanded
                        ? "bg-muted/20 p-3"
                        : "flex items-center px-4 py-1.5 hover:bg-muted/40"
                    }`}
                    style={{
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    {isExpanded ? (
                      <div className="w-full space-y-2">
                        <div
                          className="flex items-center justify-between text-[11px] text-muted-foreground border-b border-border/40 pb-1.5 cursor-pointer select-none"
                          onClick={() => toggleRowExpanded(ev.id)}
                        >
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleRowExpanded(ev.id);
                              }}
                              className="flex items-center text-foreground font-semibold"
                              aria-label="Collapse log event"
                            >
                              <ChevronDown className="h-3.5 w-3.5 mr-1" />
                              <span>{new Date(ev.timestamp).toISOString()}</span>
                            </button>
                            <span>·</span>
                            <span className="truncate max-w-[200px]" title={ev.streamName}>
                              {ev.streamName}
                            </span>
                            {ev.id && (
                              <>
                                <span>·</span>
                                <span
                                  className="text-[10px] text-muted-foreground/70 truncate max-w-[180px]"
                                  title={ev.id}
                                >
                                  {ev.id}
                                </span>
                              </>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-6 px-2 text-[11px] gap-1"
                              onClick={(e) => copyMessage(ev.id, ev.message, e)}
                            >
                              {copiedId === ev.id ? (
                                <Check className="h-3 w-3 text-emerald-500" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                              Copy
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-6 px-2 text-[11px] gap-1"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedEvent(ev);
                              }}
                            >
                              <Maximize2 className="h-3 w-3" />
                              Full view
                            </Button>
                          </div>
                        </div>
                        <pre className="whitespace-pre-wrap break-all text-xs font-mono bg-muted/40 p-3 rounded-md border border-border/60 text-foreground/90 overflow-x-auto select-text">
                          {ev.message}
                        </pre>
                      </div>
                    ) : (
                      <div
                        className="flex items-center w-full min-w-0 cursor-pointer"
                        onClick={() => toggleRowExpanded(ev.id)}
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleRowExpanded(ev.id);
                          }}
                          className="w-7 flex-none flex items-center justify-start text-muted-foreground hover:text-foreground"
                          aria-label="Expand log event"
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                        <div className="w-28 flex-none text-muted-foreground text-[11px] truncate">
                          {formatTimestamp(ev.timestamp)}
                        </div>
                        {showStreamColumn && (
                          <div
                            className="w-48 flex-none text-muted-foreground/80 truncate pr-2 text-[11px]"
                            title={ev.streamName}
                          >
                            {ev.streamName}
                          </div>
                        )}
                        <div
                          className={`flex-1 min-w-0 text-[12px] select-text pr-2 ${
                            isWrapLines
                              ? "whitespace-pre-wrap break-all"
                              : "truncate whitespace-pre"
                          }`}
                          title={isWrapLines ? undefined : ev.message}
                        >
                          {ev.message}
                        </div>
                        <div className="w-16 flex-none flex items-center justify-end gap-1 opacity-60 hover:opacity-100">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-foreground"
                            title="Copy message"
                            onClick={(e) => copyMessage(ev.id, ev.message, e)}
                          >
                            {copiedId === ev.id ? (
                              <Check className="h-3 w-3 text-emerald-500" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-foreground"
                            title="Open in modal"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedEvent(ev);
                            }}
                          >
                            <Maximize2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Load more footer */}
        {hasNextPage && (
          <div className="border-t p-2 text-center bg-background">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => loadMore()}
              disabled={isLoadingMore}
            >
              {isLoadingMore ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                  Loading more events...
                </>
              ) : (
                "Load more events"
              )}
            </Button>
          </div>
        )}
      </div>

      {/* Delete Group Confirmation Dialog */}
      <DeleteConfirmDialog
        open={isDeleteGroupOpen}
        onOpenChange={setIsDeleteGroupOpen}
        title="Delete log group"
        description={`Are you sure you want to delete log group “${logGroupName}”? All streams and log events will be permanently deleted.`}
        confirmLabel="Delete log group"
        isPending={isDeletingGroup}
        onConfirm={handleDeleteGroup}
      />

      {/* Delete Stream Confirmation Dialog */}
      <DeleteConfirmDialog
        open={Boolean(streamToDelete)}
        onOpenChange={(open) => !open && setStreamToDelete(null)}
        title="Delete log stream"
        description={`Are you sure you want to delete stream “${streamToDelete ?? ""}”? All events in this stream will be permanently deleted.`}
        confirmLabel="Delete stream"
        isPending={isDeletingStream}
        onConfirm={handleDeleteStream}
      />

      <LogEventDetailDialog
        event={selectedEvent}
        logGroupName={logGroupName}
        open={!!selectedEvent}
        onOpenChange={(open) => {
          if (!open) setSelectedEvent(null);
        }}
      />
    </div>
  );
}
