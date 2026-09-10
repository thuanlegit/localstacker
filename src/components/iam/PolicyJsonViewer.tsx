import React, { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface PolicyJsonViewerProps {
  json?: string;
  className?: string;
  showCopy?: boolean;
}

export function highlightJson(jsonStr: string): React.ReactNode[] {
  let formatted = jsonStr;
  try {
    const parsed = JSON.parse(jsonStr);
    formatted = JSON.stringify(parsed, null, 2);
  } catch {
    return [<span key="0">{jsonStr}</span>];
  }

  const regex =
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|[{}[\],]|\s+)/g;
  const nodes: React.ReactNode[] = [];
  let match: RegExpExecArray | null;
  let keyIdx = 0;

  while ((match = regex.exec(formatted)) !== null) {
    const token = match[0];
    const k = keyIdx++;
    if (token.startsWith('"') && token.endsWith(":")) {
      const colonIdx = token.lastIndexOf(":");
      const keyName = token.slice(0, colonIdx);
      nodes.push(
        <span key={k} className="text-primary font-semibold">
          {keyName}
        </span>,
        <span key={`${k}-colon`} className="text-muted-foreground">
          :
        </span>,
      );
    } else if (token.startsWith('"')) {
      nodes.push(
        <span key={k} className="text-emerald-600 dark:text-emerald-400">
          {token}
        </span>,
      );
    } else if (/^(true|false|null)$/.test(token)) {
      nodes.push(
        <span key={k} className="text-amber-600 dark:text-amber-400">
          {token}
        </span>,
      );
    } else if (/^-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?$/.test(token)) {
      nodes.push(
        <span key={k} className="text-amber-600 dark:text-amber-400">
          {token}
        </span>,
      );
    } else if (/^[{}[\],]$/.test(token)) {
      nodes.push(
        <span key={k} className="text-muted-foreground">
          {token}
        </span>,
      );
    } else {
      nodes.push(<span key={k}>{token}</span>);
    }
  }

  return nodes;
}

export function PolicyJsonViewer({
  json = "",
  className = "",
  showCopy = true,
}: PolicyJsonViewerProps) {
  const [copied, setCopied] = useState(false);

  let formatted = json;
  try {
    if (json.trim()) {
      const parsed = JSON.parse(json);
      formatted = JSON.stringify(parsed, null, 2);
    }
  } catch {
    formatted = json;
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(formatted);
      setCopied(true);
      toast.success("Policy copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy policy");
    }
  };

  return (
    <div
      className={`relative rounded-md border bg-muted/40 font-mono text-xs ${className}`}
    >
      {showCopy && formatted && (
        <div className="absolute right-2 top-2 z-10">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-muted-foreground hover:text-foreground"
            onClick={handleCopy}
            title="Copy JSON"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            <span className="ml-1 text-[11px]">{copied ? "Copied" : "Copy"}</span>
          </Button>
        </div>
      )}
      <pre className="overflow-x-auto p-4 leading-relaxed whitespace-pre font-mono">
        <code>{highlightJson(formatted)}</code>
      </pre>
    </div>
  );
}
