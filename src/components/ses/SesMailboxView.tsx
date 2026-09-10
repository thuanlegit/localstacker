import { useState, useMemo } from "react";
import {
  Inbox,
  RotateCw,
  Trash2,
  Paperclip,
  Code2,
  FileText,
  FileCode,
  Info,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { useActiveProfile } from "@/store/profiles";
import {
  useCapturedMessages,
  useMailboxActions,
} from "@/hooks/use-ses";
import { parseAttachments } from "@/lib/ses";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function SesMailboxView() {
  const profile = useActiveProfile();
  const {
    data: messages,
    isPending,
    error,
    refetch,
    isFetching,
  } = useCapturedMessages(profile.id);
  const { clearMailbox } = useMailboxActions();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  // Default to first message when messages load and nothing selected
  const activeMessage = useMemo(() => {
    if (!messages || messages.length === 0) return null;
    return messages.find((m) => m.Id === selectedId) ?? messages[0];
  }, [messages, selectedId]);

  const attachments = useMemo(() => {
    return activeMessage?.RawData ? parseAttachments(activeMessage.RawData) : [];
  }, [activeMessage?.RawData]);

  const handleClear = async () => {
    setIsClearing(true);
    try {
      const ok = await clearMailbox();
      if (ok) {
        setSelectedId(null);
      }
    } finally {
      setIsClearing(false);
      setShowClearConfirm(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Inbox className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold">SES Mailbox</h1>
              <Badge variant="outline" className="text-xs">
                LocalStack Captured
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Intercepted emails captured at /_localstack/ses
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            title="Refresh mailbox"
          >
            <RotateCw
              className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`}
            />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={!messages || messages.length === 0 || isClearing}
            onClick={() => setShowClearConfirm(true)}
          >
            <Trash2 className="h-4 w-4" />
            Clear mailbox
          </Button>
        </div>
      </div>

      {/* Informational banner when endpoint error (e.g. 404 before first SES call) */}
      {error && (
        <div className="border-b bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
          <div className="flex items-start gap-2 max-w-4xl">
            <Info className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">
                Captured mailbox is unavailable on this LocalStack instance
              </p>
              <p className="mt-0.5 text-muted-foreground">
                The internal LocalStack mailbox endpoint (/_localstack/ses) is
                unavailable or has not been initialized yet. Once an SES call is
                made, captured messages will appear here.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Main split: Left = Message list | Right = Message details */}
      {isPending ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !messages || messages.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-muted-foreground p-8">
          <Inbox className="h-10 w-10 stroke-1" />
          <p className="text-sm font-medium">No captured emails</p>
          <p className="text-xs max-w-sm">
            Emails sent through LocalStack SES are intercepted and captured
            locally. Send a test email from the SES view to see it here.
          </p>
        </div>
      ) : (
        <div className="flex flex-1 min-h-0 divide-x overflow-hidden">
          {/* Message List */}
          <div className="w-1/3 flex flex-col overflow-y-auto divide-y">
            {messages.map((msg) => {
              const isSelected = activeMessage?.Id === msg.Id;
              const firstTo =
                msg.Destination?.ToAddresses?.[0] ?? "(no recipient)";
              const timestamp = msg.Timestamp
                ? new Date(msg.Timestamp).toLocaleString()
                : "";

              return (
                <div
                  key={msg.Id}
                  onClick={() => setSelectedId(msg.Id)}
                  className={`p-3.5 cursor-pointer transition-colors text-xs space-y-1 ${
                    isSelected ? "bg-muted/70 border-l-2 border-primary" : "hover:bg-muted/30"
                  }`}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedId(msg.Id);
                    }
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold truncate">
                      {msg.Subject || "(no subject)"}
                    </span>
                    {timestamp && (
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {timestamp}
                      </span>
                    )}
                  </div>
                  <div className="text-muted-foreground truncate">
                    <span className="font-medium text-foreground/80">From: </span>
                    {msg.Source || "(unknown)"}
                  </div>
                  <div className="text-muted-foreground truncate">
                    <span className="font-medium text-foreground/80">To: </span>
                    {firstTo}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Message Detail */}
          <div className="w-2/3 flex flex-col overflow-y-auto">
            {activeMessage ? (
              <div className="p-6 space-y-4">
                <div className="border-b pb-4 space-y-2">
                  <h2 className="text-lg font-semibold">
                    {activeMessage.Subject || "(no subject)"}
                  </h2>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground font-medium">From: </span>
                      <span className="font-mono">{activeMessage.Source}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground font-medium">To: </span>
                      <span className="font-mono">
                        {activeMessage.Destination?.ToAddresses?.join(", ") || "—"}
                      </span>
                    </div>
                    {activeMessage.Destination?.CcAddresses &&
                      activeMessage.Destination.CcAddresses.length > 0 && (
                        <div>
                          <span className="text-muted-foreground font-medium">CC: </span>
                          <span className="font-mono">
                            {activeMessage.Destination.CcAddresses.join(", ")}
                          </span>
                        </div>
                      )}
                    {activeMessage.Timestamp && (
                      <div>
                        <span className="text-muted-foreground font-medium">Date: </span>
                        <span>{new Date(activeMessage.Timestamp).toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                </div>

                <Tabs defaultValue="html" className="w-full">
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="html" className="text-xs">
                      <Code2 className="mr-1.5 h-3.5 w-3.5" />
                      HTML
                    </TabsTrigger>
                    <TabsTrigger value="plaintext" className="text-xs">
                      <FileText className="mr-1.5 h-3.5 w-3.5" />
                      Plaintext
                    </TabsTrigger>
                    <TabsTrigger value="raw" className="text-xs">
                      <FileCode className="mr-1.5 h-3.5 w-3.5" />
                      Raw MIME
                    </TabsTrigger>
                    <TabsTrigger value="attachments" className="text-xs">
                      <Paperclip className="mr-1.5 h-3.5 w-3.5" />
                      Attachments ({attachments.length})
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="html" className="mt-4">
                    {activeMessage.Body?.html_part ? (
                      <div className="rounded-lg border bg-white p-1 overflow-hidden">
                        <iframe
                          sandbox=""
                          srcDoc={activeMessage.Body.html_part}
                          title="HTML email preview"
                          className="w-full h-96 border-0 bg-white"
                        />
                      </div>
                    ) : (
                      <div className="p-8 text-center text-xs text-muted-foreground italic">
                        No HTML body captured for this message
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="plaintext" className="mt-4">
                    {activeMessage.Body?.text_part ? (
                      <pre className="p-4 rounded-lg bg-muted text-xs font-mono whitespace-pre-wrap max-h-96 overflow-auto">
                        {activeMessage.Body.text_part}
                      </pre>
                    ) : (
                      <div className="p-8 text-center text-xs text-muted-foreground italic">
                        No plaintext body captured for this message
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="raw" className="mt-4">
                    {activeMessage.RawData ? (
                      <pre className="p-4 rounded-lg bg-muted text-xs font-mono whitespace-pre-wrap max-h-96 overflow-auto">
                        {activeMessage.RawData}
                      </pre>
                    ) : (
                      <div className="p-8 text-center text-xs text-muted-foreground italic">
                        Raw MIME is only captured for SendRawEmail
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="attachments" className="mt-4">
                    {attachments.length > 0 ? (
                      <div className="divide-y rounded-lg border">
                        {attachments.map((att, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between p-3 text-xs"
                          >
                            <div className="flex items-center gap-2">
                              <Paperclip className="h-4 w-4 text-muted-foreground" />
                              <span className="font-mono font-medium">
                                {att.filename}
                              </span>
                            </div>
                            <Badge variant="outline" className="text-[10px]">
                              {formatBytes(att.size)}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-8 text-center text-xs text-muted-foreground italic">
                        No attachments
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center p-8 text-xs text-muted-foreground">
                Select an email from the list to preview
              </div>
            )}
          </div>
        </div>
      )}

      <DeleteConfirmDialog
        open={showClearConfirm}
        onOpenChange={setShowClearConfirm}
        title="Clear Mailbox"
        description="Are you sure you want to delete all captured emails? This cannot be undone."
        confirmLabel="Delete all captured emails"
        isPending={isClearing}
        onConfirm={handleClear}
      />
    </div>
  );
}
