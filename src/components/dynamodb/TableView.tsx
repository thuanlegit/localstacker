import { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  CircleAlert,
  Database,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  RotateCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { useActiveProfile } from "@/store/profiles";
import {
  useTable,
  useTableItems,
  useItemActions,
} from "@/hooks/use-dynamodb";
import { formatBytes } from "@/lib/format";
import type { KeyConditionInput } from "@/lib/dynamodb";

interface TableViewProps {
  tableName: string;
}

interface ItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  initialValue: string;
  keyNames: string[];
  onSave: (item: Record<string, unknown>) => Promise<boolean>;
}

function ItemDialog({
  open,
  onOpenChange,
  title,
  initialValue,
  keyNames,
  onSave,
}: ItemDialogProps) {
  const [jsonText, setJsonText] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset text on open
  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setJsonText(initialValue);
      setError(null);
    }
    onOpenChange(nextOpen);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      setError("Invalid JSON format");
      return;
    }

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      setError("Item must be a JSON object");
      return;
    }

    const item = parsed as Record<string, unknown>;
    for (const keyName of keyNames) {
      if (!(keyName in item) || item[keyName] === undefined) {
        setError(`Missing required key attribute: "${keyName}"`);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const ok = await onSave(item);
      if (ok) {
        onOpenChange(false);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              Enter the item as a valid JSON object. Binary (B) attributes
              cannot be expressed in JSON.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-4">
            <div className="space-y-1">
              <Label htmlFor="item-json">Item JSON</Label>
              <textarea
                id="item-json"
                value={jsonText}
                onChange={(e) => {
                  setJsonText(e.target.value);
                  setError(null);
                }}
                rows={12}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                required
              />
              {error && <p className="text-xs text-destructive">{error}</p>}
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
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save item"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TableView({ tableName }: TableViewProps) {
  const profile = useActiveProfile();
  const {
    data: table,
    isPending: isTablePending,
    error: tableError,
    refetch: refetchTable,
  } = useTable(profile.id, tableName);

  const keyNames = useMemo(
    () => table?.keySchema.map((k) => k.name) ?? [],
    [table],
  );

  const partitionKey = useMemo(
    () => table?.keySchema.find((k) => k.role === "HASH"),
    [table],
  );
  const sortKey = useMemo(
    () => table?.keySchema.find((k) => k.role === "RANGE"),
    [table],
  );

  const {
    items,
    mode,
    setMode,

    setQueryInput,
    loadMore,
    hasNextPage,
    isFetchingNextPage,
    isPending: isItemsPending,
    isError: isItemsError,
    error: itemsError,
    refetch: refetchItems,
  } = useTableItems(tableName, table?.attributeTypes);

  const actions = useItemActions(tableName);

  // Inspector state
  const [selectedItem, setSelectedItem] = useState<Record<
    string,
    unknown
  > | null>(null);

  // Dialogs
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [isClearOpen, setIsClearOpen] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isDeletingItem, setIsDeletingItem] = useState(false);

  // Query form state
  const [selectedIndex, setSelectedIndex] = useState<string>("__table__");
  const [queryPkValue, setQueryPkValue] = useState("");
  const [querySkOp, setQuerySkOp] = useState<"eq" | "begins_with" | "between">(
    "eq",
  );
  const [querySkValue, setQuerySkValue] = useState("");
  const [querySkValue2, setQuerySkValue2] = useState("");

  // Determine active index schema for query
  const activeIndexSchema = useMemo(() => {
    if (selectedIndex === "__table__") {
      return table?.keySchema ?? [];
    }
    const idx = table?.indexes.find((i) => i.name === selectedIndex);
    return idx?.keySchema ?? [];
  }, [selectedIndex, table]);

  const activeIndexPk = useMemo(
    () => activeIndexSchema.find((k) => k.role === "HASH") ?? partitionKey,
    [activeIndexSchema, partitionKey],
  );
  const activeIndexSk = useMemo(
    () => activeIndexSchema.find((k) => k.role === "RANGE"),
    [activeIndexSchema],
  );

  // Virtualizer
  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 10,
  });

  const handleRunQuery = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeIndexPk || !queryPkValue.trim()) return;

    const input: KeyConditionInput = {
      partitionKeyName: activeIndexPk.name,
      partitionValue: queryPkValue.trim(),
      indexName: selectedIndex === "__table__" ? undefined : selectedIndex,
    };

    if (activeIndexSk && querySkValue.trim()) {
      input.sortKeyName = activeIndexSk.name;
      input.sortOp = querySkOp;
      input.sortValue = querySkValue.trim();
      if (querySkOp === "between") {
        input.sortValue2 = querySkValue2.trim();
      }
    }

    setMode("query");
    setQueryInput(input);
  };

  const handleResetScan = () => {
    setMode("scan");
    setQueryInput(undefined);
    setQueryPkValue("");
    setQuerySkValue("");
    setQuerySkValue2("");
  };

  const getItemKey = (item: Record<string, unknown>) => {
    const key: Record<string, unknown> = {};
    for (const name of keyNames) {
      key[name] = item[name];
    }
    return key;
  };

  const handleDeleteItem = async () => {
    if (!itemToDelete) return;
    setIsDeletingItem(true);
    try {
      const key = getItemKey(itemToDelete);
      const ok = await actions.deleteItem(key);
      if (ok) {
        setItemToDelete(null);
        if (selectedItem === itemToDelete) {
          setSelectedItem(null);
        }
      }
    } finally {
      setIsDeletingItem(false);
    }
  };

  const handleClearTable = async () => {
    setIsClearing(true);
    try {
      const ok = await actions.clearTable(keyNames);
      if (ok) {
        setIsClearOpen(false);
        setSelectedItem(null);
      }
    } finally {
      setIsClearing(false);
    }
  };

  if (isTablePending) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (tableError || !table) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <CircleAlert className="h-8 w-8 text-destructive" />
        <p className="text-sm font-medium">Failed to load table details</p>
        <p className="text-xs text-muted-foreground">
          {tableError instanceof Error ? tableError.message : String(tableError)}
        </p>
        <Button variant="outline" size="sm" onClick={() => refetchTable()}>
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
              <Database className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold">{table.name}</h1>
                <Badge variant="outline" className="text-xs">
                  {table.status}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {table.itemCount.toLocaleString()} items • {formatBytes(table.sizeBytes)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                refetchTable();
                refetchItems();
              }}
              title="Refresh table"
            >
              <RotateCw className="h-4 w-4" />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsAddOpen(true)}
            >
              <Plus className="h-4 w-4" />
              Add item
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setIsClearOpen(true)}
            >
              <Trash2 className="h-4 w-4" />
              Clear table
            </Button>
          </div>
        </div>

        {/* Key Schema & Indexes summary */}
        <div className="mt-3 flex flex-wrap items-center gap-2 pt-2 text-xs border-t">
          <span className="text-muted-foreground font-medium flex items-center gap-1">
            <KeyRound className="h-3 w-3" /> Key schema:
          </span>
          {table.keySchema.map((k) => (
            <Badge key={k.name} variant="secondary" className="font-mono text-xs">
              {k.name} ({k.type}) • {k.role}
            </Badge>
          ))}

          {table.indexes.length > 0 && (
            <>
              <span className="text-muted-foreground font-medium ml-2">
                Indexes:
              </span>
              {table.indexes.map((idx) => (
                <Badge
                  key={idx.name}
                  variant="outline"
                  className="font-mono text-xs"
                >
                  {idx.name} ({idx.kind})
                </Badge>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Mode toggle and Query builder */}
      <div className="border-b bg-muted/20 px-6 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <Button
              variant={mode === "scan" ? "default" : "outline"}
              size="sm"
              onClick={handleResetScan}
            >
              Scan
            </Button>
            <Button
              variant={mode === "query" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("query")}
            >
              Query
            </Button>
          </div>
        </div>

        {mode === "query" && (
          <form
            onSubmit={handleRunQuery}
            className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 items-end"
          >
            {/* Index select */}
            <div className="space-y-1">
              <Label className="text-xs">Index</Label>
              <Select
                value={selectedIndex}
                onValueChange={(val) => setSelectedIndex(val)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select index" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__table__">Table (Base)</SelectItem>
                  {table.indexes.map((idx) => (
                    <SelectItem key={idx.name} value={idx.name}>
                      {idx.name} ({idx.kind})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Partition key value */}
            <div className="space-y-1">
              <Label className="text-xs font-mono">
                {activeIndexPk?.name ?? "Partition key"} ({activeIndexPk?.type})
              </Label>
              <Input
                placeholder="Partition value"
                value={queryPkValue}
                onChange={(e) => setQueryPkValue(e.target.value)}
                className="h-8 text-xs font-mono"
                required
              />
            </div>

            {/* Sort key operator + value */}
            {activeIndexSk && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs font-mono">
                    {activeIndexSk.name} ({activeIndexSk.type}) op
                  </Label>
                  <div className="flex gap-1">
                    <Select
                      value={querySkOp}
                      onValueChange={(val: "eq" | "begins_with" | "between") =>
                        setQuerySkOp(val)
                      }
                    >
                      <SelectTrigger className="h-8 text-xs w-[110px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="eq">=</SelectItem>
                        <SelectItem value="begins_with">begins_with</SelectItem>
                        <SelectItem value="between">BETWEEN</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      placeholder="Sort value"
                      value={querySkValue}
                      onChange={(e) => setQuerySkValue(e.target.value)}
                      className="h-8 text-xs font-mono flex-1"
                    />
                  </div>
                </div>

                {querySkOp === "between" && (
                  <div className="space-y-1">
                    <Label className="text-xs font-mono">
                      {activeIndexSk.name} (to)
                    </Label>
                    <Input
                      placeholder="Second sort value"
                      value={querySkValue2}
                      onChange={(e) => setQuerySkValue2(e.target.value)}
                      className="h-8 text-xs font-mono"
                      required
                    />
                  </div>
                )}
              </>
            )}

            <div className="flex items-center gap-2">
              <Button type="submit" size="sm" className="h-8">
                <Search className="h-3.5 w-3.5" />
                Run query
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={handleResetScan}
              >
                Reset
              </Button>
            </div>
          </form>
        )}
      </div>

      {/* Main content: Grid + Inspector */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Items Grid */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Table Header */}
          <div className="border-b bg-muted/40 text-xs font-medium text-muted-foreground flex items-center px-4 py-2">
            <div className="w-1/4 font-mono truncate">
              {partitionKey?.name ?? "Partition Key"}
            </div>
            {sortKey && (
              <div className="w-1/4 font-mono truncate">{sortKey.name}</div>
            )}
            <div className="flex-1 font-mono truncate">Item Preview</div>
          </div>

          {/* Table Rows */}
          {isItemsPending ? (
            <div className="flex flex-1 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : isItemsError ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-destructive p-4">
              <CircleAlert className="h-6 w-6" />
              <p className="text-sm font-medium">Failed to load items</p>
              <p className="text-xs text-muted-foreground">
                {itemsError instanceof Error
                  ? itemsError.message
                  : String(itemsError)}
              </p>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
              <Database className="h-8 w-8 stroke-1" />
              <p className="text-sm font-medium">No items found</p>
              <p className="text-xs">
                {mode === "query"
                  ? "Try adjusting your query conditions."
                  : "Click 'Add item' to create the first record."}
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
                  const item = items[virtualRow.index];
                  const isSelected = selectedItem === item;
                  const pkVal = partitionKey ? String(item[partitionKey.name] ?? "") : "";
                  const skVal = sortKey ? String(item[sortKey.name] ?? "") : "";
                  const jsonPreview = JSON.stringify(item);

                  return (
                    <div
                      key={virtualRow.key}
                      data-index={virtualRow.index}
                      ref={rowVirtualizer.measureElement}
                      onClick={() => setSelectedItem(item)}
                      className={`absolute top-0 left-0 w-full flex items-center px-4 py-2 text-xs border-b cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-primary/10 hover:bg-primary/15"
                          : "hover:bg-muted/50"
                      }`}
                      style={{
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedItem(item);
                        }
                      }}
                    >
                      <div className="w-1/4 font-mono truncate font-medium">
                        {pkVal}
                      </div>
                      {sortKey && (
                        <div className="w-1/4 font-mono truncate text-muted-foreground">
                          {skVal}
                        </div>
                      )}
                      <div
                        className="flex-1 font-mono text-muted-foreground truncate"
                        title={jsonPreview}
                      >
                        {jsonPreview}
                      </div>
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
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                    Loading more...
                  </>
                ) : (
                  "Load more items"
                )}
              </Button>
            </div>
          )}
        </div>

        {/* Right: Inspector Panel */}
        {selectedItem && (
          <div className="w-96 border-l flex flex-col bg-background/50 overflow-hidden">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h2 className="text-sm font-semibold">Item Details</h2>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon-xs"
                  onClick={() => setIsEditOpen(true)}
                  title="Edit item"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="icon-xs"
                  onClick={() => setItemToDelete(selectedItem)}
                  title="Delete item"
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => setSelectedItem(null)}
                  title="Close inspector"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4">
              <pre className="font-mono text-xs leading-relaxed bg-muted/40 p-3 rounded-md overflow-x-auto whitespace-pre-wrap break-all">
                {JSON.stringify(selectedItem, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>

      {/* Add Item Dialog */}
      <ItemDialog
        open={isAddOpen}
        onOpenChange={setIsAddOpen}
        title="Add new item"
        initialValue={JSON.stringify(
          Object.fromEntries(
            table.keySchema.map((k) => [
              k.name,
              k.type === "N" ? 1 : `${k.name}-value`,
            ]),
          ),
          null,
          2,
        )}
        keyNames={keyNames}
        onSave={actions.putItem}
      />

      {/* Edit Item Dialog */}
      {selectedItem && (
        <ItemDialog
          open={isEditOpen}
          onOpenChange={setIsEditOpen}
          title="Edit item"
          initialValue={JSON.stringify(selectedItem, null, 2)}
          keyNames={keyNames}
          onSave={async (item) => {
            const ok = await actions.putItem(item);
            if (ok) {
              setSelectedItem(item);
            }
            return ok;
          }}
        />
      )}

      {/* Delete Item Confirmation Dialog */}
      <DeleteConfirmDialog
        open={Boolean(itemToDelete)}
        onOpenChange={(open) => !open && setItemToDelete(null)}
        title="Delete item"
        description={`Are you sure you want to delete this item? This action cannot be undone.`}
        confirmLabel="Delete item"
        isPending={isDeletingItem}
        onConfirm={handleDeleteItem}
      />

      {/* Clear Table Confirmation Dialog */}
      <DeleteConfirmDialog
        open={isClearOpen}
        onOpenChange={setIsClearOpen}
        title="Clear table"
        description={`Are you sure you want to clear table “${tableName}”? This will scan and delete up to 5,000 items in batches of 25. This action cannot be undone.`}
        confirmLabel="Clear all items"
        isPending={isClearing}
        onConfirm={handleClearTable}
      />
    </div>
  );
}
