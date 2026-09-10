import { useState } from "react";
import {
  BookOpen,
  Check,
  Copy,
  Database,
  Loader2,
  Plus,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DYNAMO_GUIDE_SNIPPETS } from "./DynamoGuideDialog";
import { useTableActions } from "@/hooks/use-dynamodb";

interface DynamoGuideCardProps {
  onCreateTable: () => void;
  onOpenGuide: () => void;
  onTableCreated?: (name: string) => void;
}

export function DynamoGuideCard({
  onCreateTable,
  onOpenGuide,
  onTableCreated,
}: DynamoGuideCardProps) {
  const [activeTab, setActiveTab] =
    useState<keyof typeof DYNAMO_GUIDE_SNIPPETS>("awslocal");
  const [copied, setCopied] = useState(false);
  const [isCreatingDemo, setIsCreatingDemo] = useState(false);

  const { createTable } = useTableActions();
  const snippet = DYNAMO_GUIDE_SNIPPETS[activeTab];

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(snippet.code);
      setCopied(true);
      toast.success("Snippet copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy snippet");
    }
  };

  const handleCreateDemoTable = async () => {
    setIsCreatingDemo(true);
    try {
      const res = await createTable({
        name: "demo-users",
        partitionKey: { name: "id", type: "S" },
        sortKey: { name: "created_at", type: "N" },
      });
      if (res) {
        onTableCreated?.("demo-users");
      }
    } finally {
      setIsCreatingDemo(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
      <div className="w-full max-w-xl space-y-6">
        {/* Header Icon & Title */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Database className="h-6 w-6 stroke-1.5" />
          </div>
          <h3 className="text-base font-semibold text-foreground">
            No DynamoDB tables
          </h3>
          <p className="max-w-md text-xs text-muted-foreground leading-relaxed">
            Create your first table in LocalStacker or provision via CLI/SDK to
            inspect schemas, scan & query, and edit documents.
          </p>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button size="sm" onClick={onCreateTable} className="gap-1.5 shadow-xs">
            <Plus className="h-4 w-4" />
            Create table
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={handleCreateDemoTable}
            disabled={isCreatingDemo}
            className="gap-1.5"
            title="Instantly create 'demo-users' table with partition key 'id' and sort key 'created_at'"
          >
            {isCreatingDemo ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5 text-primary" />
            )}
            Quick demo table
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={onOpenGuide}
            className="gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <BookOpen className="h-3.5 w-3.5" />
            Full guide
          </Button>
        </div>

        {/* Quick Snippet Box */}
        <div className="rounded-lg border border-border/80 bg-card/60 text-left shadow-xs">
          <div className="flex items-center justify-between border-b border-border/60 bg-muted/40 px-3 py-2">
            {/* Snippet Selector Buttons */}
            <div className="flex flex-wrap gap-1">
              {(["awslocal", "awsCli", "sdk"] as const).map((key) => {
                const item = DYNAMO_GUIDE_SNIPPETS[key];
                const isActive = activeTab === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setActiveTab(key)}
                    className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
                      isActive
                        ? "bg-background text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>

            {/* Copy Button */}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              aria-label="Copy snippet"
              onClick={handleCopy}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>

          <pre className="max-h-48 overflow-auto p-3 font-mono text-xs text-foreground/90 whitespace-pre">
            {snippet.code}
          </pre>
        </div>
      </div>
    </div>
  );
}
