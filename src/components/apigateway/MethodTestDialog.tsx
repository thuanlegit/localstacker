import { useState, useEffect } from "react";
import { Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { useTestInvoke } from "@/hooks/use-apigateway";

interface MethodTestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  restApiId: string;
  resourceId: string;
  httpMethod: string;
  resourcePath: string;
}

interface TestResult {
  status?: number;
  headers?: Record<string, string>;
  body?: string;
  log?: string;
  latency?: number;
}

function tryFormatJson(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return raw;
  }
}

export function MethodTestDialog({
  open,
  onOpenChange,
  restApiId,
  resourceId,
  httpMethod,
  resourcePath,
}: MethodTestDialogProps) {
  const [path, setPath] = useState(resourcePath);
  const [queryString, setQueryString] = useState("");
  const [headers, setHeaders] = useState("");
  const [body, setBody] = useState("");
  const [result, setResult] = useState<TestResult | null>(null);

  const { testInvoke, isInvoking } = useTestInvoke(restApiId);

  useEffect(() => {
    if (open) {
      setPath(resourcePath);
      setQueryString("");
      setHeaders("");
      setBody("");
      setResult(null);
    }
  }, [open, resourcePath, httpMethod]);

  const supportsBody = ["POST", "PUT", "PATCH", "DELETE"].includes(
    httpMethod.toUpperCase(),
  );

  const handleRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isInvoking) return;

    const parsedHeaders: Record<string, string> = {};
    for (const line of headers.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.includes(":")) continue;
      const idx = trimmed.indexOf(":");
      const k = trimmed.slice(0, idx).trim();
      const v = trimmed.slice(idx + 1).trim();
      if (k) parsedHeaders[k] = v;
    }

    const res = await testInvoke({
      resourceId,
      httpMethod,
      path: path.trim() || resourcePath,
      queryString: queryString.trim() || undefined,
      headers: Object.keys(parsedHeaders).length > 0 ? parsedHeaders : undefined,
      body: supportsBody && body.trim() ? body : undefined,
    });

    if (res) {
      setResult(res);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <form onSubmit={handleRun} className="space-y-4 min-w-0">
          <DialogHeader>
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              <DialogTitle>Method Test Runner</DialogTitle>
              <Badge variant="outline" className="font-mono break-all">
                {httpMethod} {resourcePath}
              </Badge>
            </div>
            <DialogDescription>
              Simulate an invocation with TestInvokeMethod without deploying to a
              stage.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 min-w-0">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="test-path">Path</Label>
                <Input
                  id="test-path"
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                  placeholder={resourcePath}
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="test-qs">Query String</Label>
                <Input
                  id="test-qs"
                  value={queryString}
                  onChange={(e) => setQueryString(e.target.value)}
                  placeholder="key=value&foo=bar"
                  className="font-mono text-xs"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="test-headers">Headers (one per line)</Label>
              <textarea
                id="test-headers"
                value={headers}
                onChange={(e) => setHeaders(e.target.value)}
                placeholder={"Content-Type: application/json\nx-api-key: secret"}
                rows={2}
                className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>

            {supportsBody && (
              <div className="space-y-1.5">
                <Label htmlFor="test-body">Request Body</Label>
                <textarea
                  id="test-body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder='{"message": "hello"}'
                  rows={3}
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
            )}

            {result && (
              <div className="mt-4 space-y-3 rounded-lg border bg-muted/30 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium">Status:</span>
                    <Badge
                      variant={
                        result.status &&
                        result.status >= 200 &&
                        result.status < 300
                          ? "default"
                          : "destructive"
                      }
                      className="font-mono"
                    >
                      {result.status ?? "Unknown"}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground font-mono">
                    Latency: {result.latency ?? 0} ms
                  </span>
                </div>

                {result.headers &&
                  Object.keys(result.headers).length > 0 && (
                    <div className="space-y-1">
                      <span className="text-xs font-medium text-muted-foreground">
                        Response Headers
                      </span>
                      <pre className="max-h-24 overflow-x-auto rounded bg-background p-2 text-xs font-mono whitespace-pre-wrap break-all">
                        {Object.entries(result.headers)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join("\n")}
                      </pre>
                    </div>
                  )}

                <div className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    Response Body
                  </span>
                  {result.body ? (
                    <pre className="max-h-48 overflow-x-auto rounded bg-background p-3 text-xs font-mono whitespace-pre-wrap break-all">
                      {tryFormatJson(result.body)}
                    </pre>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">
                      (Empty response body)
                    </p>
                  )}
                </div>

                {result.log && (
                  <div className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground">
                      Execution Log
                    </span>
                    <pre className="max-h-36 overflow-x-auto rounded bg-background p-2 text-xs font-mono text-muted-foreground whitespace-pre-wrap break-all">
                      {result.log}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isInvoking}
            >
              Close
            </Button>
            <Button type="submit" disabled={isInvoking}>
              {isInvoking ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4 fill-current" />
                  Run
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
