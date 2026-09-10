import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Folder,
  FolderOpen,
  ListTree,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCw,
  Trash2,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { ServiceDisabledView } from "@/components/ServiceDisabledView";
import { isServiceDisabledError, useServiceStatus } from "@/hooks/use-health";
import { useActiveProfile } from "@/store/profiles";
import { useTabs } from "@/store/tabs";
import { useParameters, useParameterActions } from "@/hooks/use-ssm";
import {
  buildParameterTree,
  type ParameterNode,
  type ParameterSummary,
  type ParameterType,
} from "@/lib/ssm";
import { formatDate } from "@/lib/format";

const PARAM_NAME_REGEX = /^(\/[a-zA-Z0-9_.\-/]+|[a-zA-Z0-9_.\-]+)$/;

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

interface ParameterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  initialName?: string;
  initialType?: ParameterType;
  initialValue?: string;
  isEdit?: boolean;
  onSave: (params: {
    name: string;
    value: string;
    type: ParameterType;
    overwrite?: boolean;
  }) => Promise<number | null>;
}

function ParameterDialog({
  open,
  onOpenChange,
  title,
  initialName = "",
  initialType = "String",
  initialValue = "",
  isEdit = false,
  onSave,
}: ParameterDialogProps) {
  const [name, setName] = useState(initialName);
  const [type, setType] = useState<ParameterType>(initialType);
  const [value, setValue] = useState(initialValue);
  const [overwrite, setOverwrite] = useState(isEdit);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync state when opened
  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setName(initialName);
      setType(initialType);
      setValue(initialValue);
      setOverwrite(isEdit);
    }
    onOpenChange(nextOpen);
  };

  const isValid = PARAM_NAME_REGEX.test(name.trim()) && value.length > 0;
  const showNameError = name.length > 0 && !PARAM_NAME_REGEX.test(name.trim());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const version = await onSave({
        name: name.trim(),
        value,
        type,
        overwrite,
      });
      if (version !== null) {
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
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {isEdit
                ? `Update parameter ${name}`
                : "Create a new parameter in SSM Parameter Store."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4 min-w-0">
            <div className="space-y-2">
              <Label htmlFor="param-name">Parameter name</Label>
              <Input
                id="param-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="/app/config/database-url"
                disabled={isEdit}
                autoFocus={!isEdit}
              />
              {showNameError ? (
                <p className="text-xs text-destructive">
                  Alphanumeric, slashes, hyphens, underscores, dots. Hierarchical
                  names start with / (e.g. /app/config).
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Use forward slashes for hierarchy (e.g. /app/env/param)
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={type}
                onValueChange={(val: ParameterType) => setType(val)}
                disabled={isEdit}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="String">String</SelectItem>
                  <SelectItem value="StringList">StringList</SelectItem>
                  <SelectItem value="SecureString">SecureString</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="param-value">Value</Label>
              <textarea
                id="param-value"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={
                  type === "StringList"
                    ? "value1,value2,value3"
                    : "Parameter value"
                }
                rows={5}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                required
              />
            </div>

            <div className="flex items-center space-x-2 pt-1">
              <input
                type="checkbox"
                id="overwrite-checkbox"
                checked={overwrite}
                onChange={(e) => setOverwrite(e.target.checked)}
                className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
              />
              <Label
                htmlFor="overwrite-checkbox"
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
            <Button type="submit" disabled={!isValid || isSubmitting}>
              {isSubmitting
                ? "Saving..."
                : isEdit
                  ? "Update parameter"
                  : "Save parameter"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface TreeItemProps {
  node: ParameterNode;
  level: number;
  expandedPaths: Set<string>;
  togglePath: (path: string) => void;
  onSelect: (name: string) => void;
  currentPath: string;
}

function TreeItem({
  node,
  level,
  expandedPaths,
  togglePath,
  onSelect,
  currentPath,
}: TreeItemProps) {
  const path = currentPath ? `${currentPath}/${node.segment}` : node.segment;
  const isFolder = node.children.length > 0;
  const isExpanded = expandedPaths.has(path);

  return (
    <div>
      <div
        className="flex items-center justify-between py-1.5 px-3 hover:bg-muted/50 rounded-sm cursor-pointer transition-colors text-xs font-mono"
        style={{ paddingLeft: `${level * 20 + 12}px` }}
        onClick={() => {
          if (isFolder) {
            togglePath(path);
          } else if (node.parameter) {
            onSelect(node.parameter.name);
          }
        }}
      >
        <div className="flex items-center gap-2 truncate">
          {isFolder ? (
            <button
              type="button"
              className="p-0.5 rounded hover:bg-muted text-muted-foreground"
              onClick={(e) => {
                e.stopPropagation();
                togglePath(path);
              }}
            >
              {isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </button>
          ) : (
            <span className="w-4" />
          )}

          {isFolder ? (
            isExpanded ? (
              <FolderOpen className="h-4 w-4 text-amber-500 flex-none" />
            ) : (
              <Folder className="h-4 w-4 text-amber-500 flex-none" />
            )
          ) : (
            <span className="h-1.5 w-1.5 rounded-full bg-primary flex-none" />
          )}

          <span
            className={`${isFolder ? "font-semibold" : "font-normal"} truncate`}
          >
            {node.segment}
          </span>
        </div>

        {node.parameter && (
          <div className="flex items-center gap-2 flex-none ml-4">
            <TypeBadge type={node.parameter.type} />
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                onSelect(node.parameter!.name);
              }}
            >
              Open
            </Button>
          </div>
        )}
      </div>

      {isFolder && isExpanded && (
        <div>
          {node.children.map((child) => (
            <TreeItem
              key={child.segment}
              node={child}
              level={level + 1}
              expandedPaths={expandedPaths}
              togglePath={togglePath}
              onSelect={onSelect}
              currentPath={path}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function SsmServiceView() {
  const profile = useActiveProfile();
  const serviceStatus = useServiceStatus("ssm");
  const {
    data: parameters,
    isPending,
    error,
    refetch,
    isFetching,
  } = useParameters(profile.id);
  const actions = useParameterActions();
  const { openTab, closeTab } = useTabs();

  const [viewMode, setViewMode] = useState<"flat" | "hierarchy">("flat");
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(
    new Set(["e2e", "app"]),
  );

  // Dialogs
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [paramToEdit, setParamToEdit] = useState<ParameterSummary | null>(null);
  const [paramToDelete, setParamToDelete] = useState<ParameterSummary | null>(
    null,
  );
  const [isDeleting, setIsDeleting] = useState(false);

  const parameterTree = useMemo(() => {
    return parameters ? buildParameterTree(parameters) : [];
  }, [parameters]);

  if (serviceStatus === "disabled" || (error && isServiceDisabledError(error))) {
    return <ServiceDisabledView service="ssm" />;
  }

  const handleRowClick = (name: string) => {
    openTab({
      id: `parameter:${name}`,
      kind: "parameter",
      parameterName: name,
      title: name,
    });
  };

  const togglePath = (path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const handleDelete = async () => {
    if (!paramToDelete) return;
    setIsDeleting(true);
    try {
      const ok = await actions.deleteParameter(paramToDelete.name);
      if (ok) {
        closeTab(`parameter:${paramToDelete.name}`);
        setParamToDelete(null);
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ListTree className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Parameter Store</h1>
            <p className="text-xs text-muted-foreground">
              Parameters & hierarchy
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center border rounded-md p-0.5 bg-muted/20">
            <Button
              variant={viewMode === "flat" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setViewMode("flat")}
            >
              Flat
            </Button>
            <Button
              variant={viewMode === "hierarchy" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setViewMode("hierarchy")}
            >
              Hierarchy
            </Button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            title="Refresh parameters"
          >
            <RotateCw
              className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`}
            />
            <span className="hidden sm:inline">Refresh</span>
          </Button>

          <Button size="sm" onClick={() => setIsCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            New parameter
          </Button>
        </div>
      </div>

      {/* Body */}
      {isPending ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <CircleAlert className="h-8 w-8 text-destructive" />
          <p className="text-sm font-medium">Failed to load parameters</p>
          <p className="text-xs text-muted-foreground">
            {error instanceof Error ? error.message : String(error)}
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      ) : !parameters || parameters.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
          <ListTree className="h-10 w-10 stroke-1" />
          <p className="text-sm font-medium">No parameters</p>
          <p className="text-xs">Create your first parameter to get started.</p>
          <Button
            size="sm"
            className="mt-2"
            onClick={() => setIsCreateOpen(true)}
          >
            <Plus className="h-4 w-4" />
            New parameter
          </Button>
        </div>
      ) : viewMode === "flat" ? (
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 border-b bg-muted/50 text-xs font-medium text-muted-foreground">
              <tr>
                <th className="px-6 py-3">Name</th>
                <th className="px-6 py-3">Type</th>
                <th className="px-6 py-3">Version</th>
                <th className="px-6 py-3">Last modified</th>
                <th className="w-12 px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {parameters.map((param) => (
                <tr
                  key={param.name}
                  onClick={() => handleRowClick(param.name)}
                  className="cursor-pointer transition-colors hover:bg-muted/50"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleRowClick(param.name);
                    }
                  }}
                >
                  <td className="px-6 py-3 font-medium">
                    <span className="font-mono text-xs sm:text-sm">
                      {param.name}
                    </span>
                  </td>
                  <td className="px-6 py-3">
                    <TypeBadge type={param.type} />
                  </td>
                  <td className="px-6 py-3 text-xs text-muted-foreground font-mono">
                    v{param.version}
                  </td>
                  <td className="px-6 py-3 text-xs text-muted-foreground">
                    {formatDate(param.lastModified)}
                  </td>
                  <td
                    className="px-6 py-3 text-right"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Actions for ${param.name}`}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => setParamToEdit(param)}
                        >
                          <Pencil className="h-4 w-4 mr-2" />
                          Edit parameter
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setParamToDelete(param)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete parameter
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-4">
          <div className="border rounded-md p-2 bg-background">
            {parameterTree.map((node) => (
              <TreeItem
                key={node.segment}
                node={node}
                level={0}
                expandedPaths={expandedPaths}
                togglePath={togglePath}
                onSelect={handleRowClick}
                currentPath=""
              />
            ))}
          </div>
        </div>
      )}

      {/* Create Dialog */}
      <ParameterDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        title="Create parameter"
        onSave={actions.putParameter}
      />

      {/* Edit Dialog */}
      {paramToEdit && (
        <ParameterDialog
          open={Boolean(paramToEdit)}
          onOpenChange={(open) => !open && setParamToEdit(null)}
          title="Edit parameter"
          initialName={paramToEdit.name}
          initialType={paramToEdit.type}
          isEdit={true}
          onSave={actions.putParameter}
        />
      )}

      {/* Delete Dialog */}
      <DeleteConfirmDialog
        open={Boolean(paramToDelete)}
        onOpenChange={(open) => !open && setParamToDelete(null)}
        title="Delete parameter"
        description={`Are you sure you want to delete parameter “${paramToDelete?.name ?? ""}”? This action cannot be undone.`}
        confirmLabel="Delete"
        isPending={isDeleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
