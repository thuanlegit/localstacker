import { useState } from "react";
import {
  Check,
  CircleAlert,
  Copy,
  Eye,
  EyeOff,
  ListTree,
  Loader2,
  Pencil,
  RotateCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { useActiveProfile } from "@/store/profiles";
import { useTabs } from "@/store/tabs";
import { useParameter, useParameterActions } from "@/hooks/use-ssm";
import { formatDate } from "@/lib/format";
import type { ParameterType } from "@/lib/ssm";

interface ParameterViewProps {
  parameterName: string;
}

function TypeBadge({ type }: { type: ParameterType }) {
  if (type === "SecureString") {
    return (
      <Badge variant="destructive" className="font-mono text-xs">
        SecureString
      </Badge>
    );
  }
  if (type === "StringList") {
    return (
      <Badge variant="secondary" className="font-mono text-xs">
        StringList
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="font-mono text-xs">
      String
    </Badge>
  );
}

interface EditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parameterName: string;
  type: ParameterType;
  initialValue: string;
  onSaved: (newValue: string) => void;
}

function EditDialog({
  open,
  onOpenChange,
  parameterName,
  type,
  initialValue,
  onSaved,
}: EditDialogProps) {
  const [value, setValue] = useState(initialValue);
  const [overwrite, setOverwrite] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const actions = useParameterActions();

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setValue(initialValue);
      setOverwrite(true);
    }
    onOpenChange(nextOpen);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const version = await actions.putParameter({
        name: parameterName,
        value,
        type,
        overwrite,
      });
      if (version !== null) {
        onSaved(value);
        onOpenChange(false);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-xl max-w-xl">
        <form onSubmit={handleSubmit} className="min-w-0">
          <DialogHeader>
            <DialogTitle>Edit parameter</DialogTitle>
            <DialogDescription>
              Update the value of parameter {parameterName}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4 min-w-0">
            <div className="space-y-1">
              <Label>Type</Label>
              <div className="pt-1">
                <TypeBadge type={type} />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="edit-param-value">Value</Label>
              <textarea
                id="edit-param-value"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Parameter value"
                rows={6}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                required
              />
            </div>

            <div className="flex items-center space-x-2 pt-1">
              <input
                type="checkbox"
                id="edit-overwrite-checkbox"
                checked={overwrite}
                onChange={(e) => setOverwrite(e.target.checked)}
                className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
              />
              <Label
                htmlFor="edit-overwrite-checkbox"
                className="text-sm font-normal cursor-pointer"
              >
                Overwrite existing parameter
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!value || isSubmitting}>
              {isSubmitting ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ParameterView({ parameterName }: ParameterViewProps) {
  const profile = useActiveProfile();
  const { closeTab } = useTabs();

  const {
    data: parameter,
    isPending,
    error,
    refetch,
  } = useParameter(profile.id, parameterName);
  const actions = useParameterActions();

  const [revealedValue, setRevealedValue] = useState<string | null>(null);
  const [isRevealing, setIsRevealing] = useState(false);
  const [hasCopiedName, setHasCopiedName] = useState(false);
  const [hasCopiedValue, setHasCopiedValue] = useState(false);

  // Dialogs
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleReveal = async () => {
    if (revealedValue !== null) {
      setRevealedValue(null);
      return;
    }

    setIsRevealing(true);
    try {
      const res = await actions.getParameter({
        name: parameterName,
        withDecryption: parameter?.type === "SecureString",
      });
      setRevealedValue(res.value);
    } catch {
      // Toast handled by getParameter action
    } finally {
      setIsRevealing(false);
    }
  };

  const handleCopyName = async () => {
    try {
      await navigator.clipboard.writeText(parameterName);
      setHasCopiedName(true);
      toast.success("Parameter name copied");
      setTimeout(() => setHasCopiedName(false), 2000);
    } catch {
      toast.error("Failed to copy parameter name");
    }
  };

  const handleCopyValue = async () => {
    if (revealedValue === null) return;
    try {
      await navigator.clipboard.writeText(revealedValue);
      setHasCopiedValue(true);
      toast.success("Parameter value copied");
      setTimeout(() => setHasCopiedValue(false), 2000);
    } catch {
      toast.error("Failed to copy parameter value");
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const ok = await actions.deleteParameter(parameterName);
      if (ok) {
        closeTab(`parameter:${parameterName}`);
      }
    } finally {
      setIsDeleting(false);
    }
  };

  if (isPending) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !parameter) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <CircleAlert className="h-8 w-8 text-destructive" />
        <p className="text-sm font-medium">Failed to load parameter</p>
        <p className="text-xs text-muted-foreground">
          {error instanceof Error ? error.message : String(error)}
        </p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ListTree className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold font-mono">
                  {parameter.name}
                </h1>
                <TypeBadge type={parameter.type} />
                <Badge variant="outline" className="font-mono text-xs">
                  v{parameter.version}
                </Badge>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
                <span>Last modified: {formatDate(parameter.lastModified)}</span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={handleCopyName}
                  title="Copy parameter name"
                >
                  {hasCopiedName ? (
                    <Check className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              title="Refresh parameter"
            >
              <RotateCw className="h-4 w-4" />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditOpen(true)}
            >
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setIsDeleteOpen(true)}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          </div>
        </div>
      </div>

      {/* Value Container */}
      <div className="flex-1 p-6 overflow-auto max-w-4xl space-y-4">
        <div className="flex items-center justify-between border-b pb-3">
          <div>
            <h2 className="text-sm font-semibold">Parameter Value</h2>
            <p className="text-xs text-muted-foreground">
              {parameter.type === "SecureString"
                ? "Encrypted with KMS. Decrypted on reveal."
                : "Stored plaintext value."}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {revealedValue !== null && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyValue}
                title="Copy value"
              >
                {hasCopiedValue ? (
                  <Check className="h-3.5 w-3.5 text-green-500 mr-1" />
                ) : (
                  <Copy className="h-3.5 w-3.5 mr-1" />
                )}
                Copy value
              </Button>
            )}

            <Button
              variant={revealedValue !== null ? "secondary" : "default"}
              size="sm"
              onClick={handleReveal}
              disabled={isRevealing}
            >
              {isRevealing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                  Decrypting...
                </>
              ) : revealedValue !== null ? (
                <>
                  <EyeOff className="h-3.5 w-3.5 mr-1" />
                  Hide value
                </>
              ) : (
                <>
                  <Eye className="h-3.5 w-3.5 mr-1" />
                  Reveal value
                </>
              )}
            </Button>
          </div>
        </div>

        {revealedValue !== null ? (
          <div className="relative">
            <pre className="font-mono text-xs leading-relaxed bg-muted/40 p-4 rounded-md overflow-x-auto whitespace-pre-wrap break-all border">
              {revealedValue}
            </pre>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-12 border border-dashed rounded-md text-center text-muted-foreground bg-muted/10">
            <Eye className="h-8 w-8 stroke-1 mb-2 opacity-50" />
            <p className="text-sm font-medium">Value hidden</p>
            <p className="text-xs mt-0.5">
              Click &quot;Reveal value&quot; to inspect the parameter value.
            </p>
          </div>
        )}
      </div>

      {/* Edit Dialog */}
      <EditDialog
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        parameterName={parameterName}
        type={parameter.type}
        initialValue={revealedValue ?? parameter.value ?? ""}
        onSaved={(newVal) => {
          setRevealedValue(newVal);
          refetch();
        }}
      />

      {/* Delete Dialog */}
      <DeleteConfirmDialog
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        title="Delete parameter"
        description={`Are you sure you want to delete parameter “${parameterName}”? This action cannot be undone.`}
        confirmLabel="Delete parameter"
        isPending={isDeleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
