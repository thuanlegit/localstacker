import { useState, useRef, useEffect } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileCode,
  Loader2,
  Plus,
  Upload,
} from "lucide-react";
import { zipSync } from "fflate";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  NODE_STARTER_CODE,
  PYTHON_STARTER_CODE,
  buildStarterZip,
} from "@/lib/lambda";
import { useLambdaActions } from "@/hooks/use-lambda";
import { formatBytes } from "@/lib/format";

const RUNTIMES = [
  { value: "nodejs22.x", label: "Node.js 22.x", defaultHandler: "index.handler" },
  { value: "nodejs20.x", label: "Node.js 20.x", defaultHandler: "index.handler" },
  { value: "nodejs18.x", label: "Node.js 18.x", defaultHandler: "index.handler" },
  { value: "python3.12", label: "Python 3.12", defaultHandler: "lambda_function.lambda_handler" },
  { value: "python3.11", label: "Python 3.11", defaultHandler: "lambda_function.lambda_handler" },
  { value: "python3.10", label: "Python 3.10", defaultHandler: "lambda_function.lambda_handler" },
];

interface CreateFunctionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (functionName: string) => void;
}

export function CreateFunctionDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateFunctionDialogProps) {
  const [name, setName] = useState("");
  const [runtime, setRuntime] = useState("nodejs22.x");
  const [handler, setHandler] = useState("index.handler");
  const [description, setDescription] = useState("");
  const [codeMode, setCodeMode] = useState<"inline" | "upload">("inline");
  const [inlineCode, setInlineCode] = useState(NODE_STARTER_CODE);
  const [hasCustomCode, setHasCustomCode] = useState(false);

  // Upload state
  const [uploadedFile, setUploadedFile] = useState<{
    name: string;
    size: number;
    bytes: Uint8Array;
  } | null>(null);

  // Advanced settings
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [timeout, setTimeout] = useState("3");
  const [memorySize, setMemorySize] = useState("128");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { create } = useLambdaActions();

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setName("");
      setRuntime("nodejs22.x");
      setHandler("index.handler");
      setDescription("");
      setCodeMode("inline");
      setInlineCode(NODE_STARTER_CODE);
      setHasCustomCode(false);
      setUploadedFile(null);
      setShowAdvanced(false);
      setTimeout("3");
      setMemorySize("128");
      setError(null);
    }
  }, [open]);

  // When runtime changes, update default handler and starter code if untouched
  const handleRuntimeChange = (nextRuntime: string) => {
    const prevRuntimeCfg = RUNTIMES.find((r) => r.value === runtime);
    const nextRuntimeCfg = RUNTIMES.find((r) => r.value === nextRuntime);

    setRuntime(nextRuntime);

    if (
      nextRuntimeCfg &&
      (!handler || (prevRuntimeCfg && handler === prevRuntimeCfg.defaultHandler))
    ) {
      setHandler(nextRuntimeCfg.defaultHandler);
    }

    if (!hasCustomCode) {
      if (nextRuntime.startsWith("python")) {
        setInlineCode(PYTHON_STARTER_CODE);
      } else {
        setInlineCode(NODE_STARTER_CODE);
      }
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const u8 = new Uint8Array(buffer);

      if (file.name.endsWith(".zip")) {
        setUploadedFile({ name: file.name, size: file.size, bytes: u8 });
      } else if (file.name.endsWith(".js") || file.name.endsWith(".mjs")) {
        const zipped = zipSync({ [file.name]: u8 });
        setUploadedFile({ name: file.name, size: file.size, bytes: zipped });
      } else if (file.name.endsWith(".py")) {
        const zipped = zipSync({ [file.name]: u8 });
        setUploadedFile({ name: file.name, size: file.size, bytes: zipped });
      } else {
        // Assume plain zip
        setUploadedFile({ name: file.name, size: file.size, bytes: u8 });
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read file");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();

    if (!trimmedName) {
      setError("Function name is required");
      return;
    }

    if (!/^[a-zA-Z0-9-_]{1,64}$/.test(trimmedName)) {
      setError(
        "Function name must be 1-64 characters and contain only letters, numbers, hyphens, or underscores",
      );
      return;
    }

    if (!handler.trim()) {
      setError("Handler is required (e.g. index.handler)");
      return;
    }

    let codeZip: Uint8Array;
    if (codeMode === "inline") {
      if (!inlineCode.trim()) {
        setError("Inline code cannot be empty");
        return;
      }
      codeZip = buildStarterZip(runtime, inlineCode);
    } else {
      if (!uploadedFile) {
        setError("Please select a .zip or code file to upload");
        return;
      }
      codeZip = uploadedFile.bytes;
    }

    const timeoutSec = parseInt(timeout, 10);
    if (isNaN(timeoutSec) || timeoutSec < 1 || timeoutSec > 900) {
      setError("Timeout must be between 1 and 900 seconds");
      return;
    }

    const memMb = parseInt(memorySize, 10);
    if (isNaN(memMb) || memMb < 128 || memMb > 10240) {
      setError("Memory size must be between 128 and 10240 MB");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const createdName = await create({
        name: trimmedName,
        runtime,
        handler: handler.trim(),
        codeZip,
        description: description.trim() || undefined,
        timeout: timeoutSec,
        memorySize: memMb,
      });

      if (createdName) {
        onOpenChange(false);
        onCreated?.(createdName);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl sm:max-w-2xl min-w-0 max-h-[calc(100vh-4rem)] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" />
            <DialogTitle>Create Lambda Function</DialogTitle>
          </div>
          <DialogDescription>
            Deploy a new serverless function to LocalStack with inline starter
            code or a zip archive.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-1">
          {error && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
              {error}
            </div>
          )}

          {/* Function Name */}
          <div className="space-y-1.5">
            <Label htmlFor="fn-name">Function Name</Label>
            <Input
              id="fn-name"
              placeholder="e.g. my-service-handler"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
              }}
              disabled={isSubmitting}
              autoFocus
            />
          </div>

          {/* Runtime & Handler */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="fn-runtime">Runtime</Label>
              <Select
                value={runtime}
                onValueChange={handleRuntimeChange}
                disabled={isSubmitting}
              >
                <SelectTrigger id="fn-runtime" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RUNTIMES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="fn-handler">Handler</Label>
              <Input
                id="fn-handler"
                placeholder="index.handler"
                value={handler}
                onChange={(e) => setHandler(e.target.value)}
                disabled={isSubmitting}
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="fn-description">
              Description <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              id="fn-description"
              placeholder="e.g. Process user registration webhook"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          {/* Code Mode Switcher */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Function Code</Label>
              <div className="flex items-center rounded-md border bg-muted/40 p-0.5">
                <button
                  type="button"
                  onClick={() => setCodeMode("inline")}
                  className={`flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                    codeMode === "inline"
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <FileCode className="h-3.5 w-3.5" />
                  Inline Editor
                </button>
                <button
                  type="button"
                  onClick={() => setCodeMode("upload")}
                  className={`flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                    codeMode === "upload"
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Upload className="h-3.5 w-3.5" />
                  Upload Archive
                </button>
              </div>
            </div>

            {codeMode === "inline" ? (
              <div className="rounded-lg border border-border/80 bg-card/60 overflow-hidden shadow-xs">
                <div className="flex items-center justify-between border-b border-border/60 bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
                  <span>
                    {runtime.startsWith("python")
                      ? "lambda_function.py"
                      : "index.mjs"}
                  </span>
                  <span className="text-[11px]">
                    Packaged to zip automatically on creation
                  </span>
                </div>
                <textarea
                  className="w-full h-44 p-3 font-mono text-xs bg-transparent text-foreground/90 resize-y focus:outline-none"
                  value={inlineCode}
                  onChange={(e) => {
                    setInlineCode(e.target.value);
                    setHasCustomCode(true);
                  }}
                  disabled={isSubmitting}
                  spellCheck={false}
                />
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border/80 bg-muted/20 p-6 text-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".zip,.js,.mjs,.py"
                  className="hidden"
                  onChange={handleFileUpload}
                  disabled={isSubmitting}
                />
                {uploadedFile ? (
                  <div className="flex flex-col items-center gap-2">
                    <FileCode className="h-8 w-8 text-primary" />
                    <div className="text-sm font-medium text-foreground">
                      {uploadedFile.name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatBytes(uploadedFile.size)}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      className="mt-1"
                    >
                      Choose different file
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="h-8 w-8 text-muted-foreground/60" />
                    <p className="text-xs text-muted-foreground">
                      Upload a pre-packaged <code>.zip</code> file, or a single{" "}
                      <code>.js</code> / <code>.py</code> file.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      className="mt-2"
                    >
                      Browse file
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Advanced Settings Accordion */}
          <div className="border-t pt-3">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              {showAdvanced ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
              Advanced Settings (Timeout, Memory)
            </button>

            {showAdvanced && (
              <div className="grid grid-cols-1 gap-3 pt-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="fn-timeout" className="text-xs">
                    Timeout (seconds)
                  </Label>
                  <Input
                    id="fn-timeout"
                    type="number"
                    min="1"
                    max="900"
                    value={timeout}
                    onChange={(e) => setTimeout(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="fn-memory" className="text-xs">
                    Memory (MB)
                  </Label>
                  <Input
                    id="fn-memory"
                    type="number"
                    min="128"
                    max="10240"
                    step="64"
                    value={memorySize}
                    onChange={(e) => setMemorySize(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="gap-1.5">
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Create function
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
