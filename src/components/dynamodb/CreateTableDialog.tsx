import { useState } from "react";
import { Info, Loader2, Plus, Sparkles } from "lucide-react";
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
import { useTableActions } from "@/hooks/use-dynamodb";

interface CreateTableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (tableName: string) => void;
}

export function CreateTableDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateTableDialogProps) {
  const [tableName, setTableName] = useState("");
  const [pkName, setPkName] = useState("id");
  const [pkType, setPkType] = useState<"S" | "N" | "B">("S");
  const [hasSortKey, setHasSortKey] = useState(false);
  const [skName, setSkName] = useState("");
  const [skType, setSkType] = useState<"S" | "N" | "B">("S");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { createTable } = useTableActions();

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setTableName("");
      setPkName("id");
      setPkType("S");
      setHasSortKey(false);
      setSkName("");
      setSkType("S");
      setError(null);
    }
    onOpenChange(nextOpen);
  };

  const handleApplyDemoTemplate = () => {
    setTableName("demo-users");
    setPkName("id");
    setPkType("S");
    setHasSortKey(true);
    setSkName("created_at");
    setSkType("N");
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = tableName.trim();
    if (!trimmedName) {
      setError("Table name is required");
      return;
    }

    const trimmedPk = pkName.trim();
    if (!trimmedPk) {
      setError("Partition key name is required");
      return;
    }

    const trimmedSk = hasSortKey ? skName.trim() : "";
    if (hasSortKey && !trimmedSk) {
      setError("Sort key name is required when sort key is enabled");
      return;
    }

    if (hasSortKey && trimmedPk === trimmedSk) {
      setError("Partition key and sort key must have different names");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await createTable({
        name: trimmedName,
        partitionKey: { name: trimmedPk, type: pkType },
        sortKey: hasSortKey ? { name: trimmedSk, type: skType } : undefined,
      });

      if (res) {
        onOpenChange(false);
        onCreated?.(trimmedName);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md max-w-md">
        <form onSubmit={handleSubmit} className="min-w-0">
          <DialogHeader>
            <div className="flex items-center justify-between pr-6">
              <DialogTitle>Create DynamoDB table</DialogTitle>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground hover:text-primary gap-1 px-2"
                onClick={handleApplyDemoTemplate}
                title="Fill with sample schema: demo-users (id: S, created_at: N)"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Fill sample</span>
              </Button>
            </div>
            <DialogDescription>
              Create an on-demand DynamoDB table in your LocalStack environment.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-2.5 text-xs text-destructive">
                {error}
              </div>
            )}

            {/* Table Name */}
            <div className="space-y-1.5">
              <Label htmlFor="dynamo-table-name" className="text-xs">
                Table name
              </Label>
              <Input
                id="dynamo-table-name"
                placeholder="e.g. users, orders, events"
                value={tableName}
                onChange={(e) => setTableName(e.target.value)}
                required
                className="h-8 text-xs font-mono"
              />
            </div>

            {/* Partition Key */}
            <div className="space-y-1.5">
              <Label className="text-xs">Partition key (HASH)</Label>
              <div className="grid grid-cols-3 gap-2">
                <Input
                  placeholder="Attribute name (e.g. id)"
                  value={pkName}
                  onChange={(e) => setPkName(e.target.value)}
                  required
                  className="col-span-2 h-8 text-xs font-mono"
                />
                <Select
                  value={pkType}
                  onValueChange={(v) => setPkType(v as "S" | "N" | "B")}
                >
                  <SelectTrigger className="h-8 text-xs font-mono">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="S">String (S)</SelectItem>
                    <SelectItem value="N">Number (N)</SelectItem>
                    <SelectItem value="B">Binary (B)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Sort Key Checkbox & Inputs */}
            <div className="space-y-2 pt-1 border-t">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="enable-sort-key"
                  checked={hasSortKey}
                  onChange={(e) => setHasSortKey(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-muted-foreground/30 accent-primary"
                />
                <Label
                  htmlFor="enable-sort-key"
                  className="text-xs cursor-pointer font-normal"
                >
                  Add sort key (RANGE)
                </Label>
              </div>

              {hasSortKey && (
                <div className="grid grid-cols-3 gap-2 pl-5 pt-1">
                  <Input
                    placeholder="e.g. created_at, sk"
                    value={skName}
                    onChange={(e) => setSkName(e.target.value)}
                    required={hasSortKey}
                    className="col-span-2 h-8 text-xs font-mono"
                  />
                  <Select
                    value={skType}
                    onValueChange={(v) => setSkType(v as "S" | "N" | "B")}
                  >
                    <SelectTrigger className="h-8 text-xs font-mono">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="S">String (S)</SelectItem>
                      <SelectItem value="N">Number (N)</SelectItem>
                      <SelectItem value="B">Binary (B)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Schemaless Explainer Callout */}
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground leading-relaxed">
              <div className="flex items-center gap-1.5 font-medium text-foreground pb-1">
                <Info className="h-3.5 w-3.5 text-primary shrink-0" />
                <span>Why only 1 or 2 keys?</span>
              </div>
              DynamoDB is a schemaless NoSQL store. Unlike SQL databases, you only
              define primary key attributes (partition key + optional sort key)
              at table creation. All other attributes ("columns" like name,
              email, address, price) are added dynamically to each item when you
              insert data.
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isSubmitting}>
              {isSubmitting ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="mr-1.5 h-3.5 w-3.5" />
              )}
              Create table
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
