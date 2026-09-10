import { useState } from "react";
import {
  BookOpen,
  Check,
  Copy,
  Loader2,
  Plus,
  Sparkles,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LAMBDA_GUIDE_SNIPPETS } from "./LambdaGuideDialog";
import { useLambdaActions } from "@/hooks/use-lambda";

interface LambdaGuideCardProps {
  onCreateFunction?: () => void;
  onOpenGuide: () => void;
  onFunctionCreated?: (name: string) => void;
}

export function LambdaGuideCard({
  onCreateFunction,
  onOpenGuide,
  onFunctionCreated,
}: LambdaGuideCardProps) {
  const [activeTab, setActiveTab] =
    useState<keyof typeof LAMBDA_GUIDE_SNIPPETS>("awslocal");
  const [copied, setCopied] = useState(false);
  const [isCreatingDemo, setIsCreatingDemo] = useState(false);

  const { createDemo } = useLambdaActions();
  const snippet = LAMBDA_GUIDE_SNIPPETS[activeTab];

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

  const handleCreateDemo = async () => {
    setIsCreatingDemo(true);
    try {
      const name = await createDemo("demo-hello");
      if (name) {
        onFunctionCreated?.(name);
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
            <Zap className="h-6 w-6 stroke-1.5" />
          </div>
          <h3 className="text-base font-semibold text-foreground">
            No Lambda functions
          </h3>
          <p className="max-w-md text-xs text-muted-foreground leading-relaxed">
            Deploy your first function to LocalStack via CLI, IaC, or SDK, or spin
            up a quick demo function to test invocations and logs.
          </p>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          {onCreateFunction && (
            <Button
              size="sm"
              onClick={onCreateFunction}
              className="gap-1.5 shadow-xs"
            >
              <Plus className="h-4 w-4" />
              Create function
            </Button>
          )}

          <Button
            size="sm"
            variant={onCreateFunction ? "outline" : "default"}
            onClick={handleCreateDemo}
            disabled={isCreatingDemo}
            className="gap-1.5"
            title="Instantly create 'demo-hello' Node.js function in LocalStack"
          >
            {isCreatingDemo ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5 text-primary" />
            )}
            Quick demo function
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
        <div className="rounded-lg border border-border/80 bg-card/60 text-left shadow-xs min-w-0 w-full overflow-hidden">
          <div className="flex items-center justify-between border-b border-border/60 bg-muted/40 px-3 py-2 min-w-0">
            {/* Snippet Selector Buttons */}
            <div className="flex flex-wrap gap-1">
              {(["awslocal", "awsCli", "sdk", "terraform"] as const).map((key) => {
                const item = LAMBDA_GUIDE_SNIPPETS[key];
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

          <pre className="max-h-48 min-w-0 w-full overflow-x-auto overflow-y-auto p-3 font-mono text-xs text-foreground/90 whitespace-pre">
            {snippet.code}
          </pre>
        </div>
      </div>
    </div>
  );
}
