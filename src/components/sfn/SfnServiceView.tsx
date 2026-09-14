import { useState } from "react";
import {
  CircleAlert,
  Loader2,
  MoreHorizontal,
  Plus,
  RotateCw,
  Trash2,
  Workflow,
} from "lucide-react";
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
import { useStateMachines, useSfnActions } from "@/hooks/use-sfn";
import { parseAsl, type StateMachineSummary } from "@/lib/sfn";

const MACHINE_NAME_REGEX = /^[a-zA-Z0-9_-]{1,80}$/;

const SAMPLE_ASL = JSON.stringify(
  {
    Comment: "A sample state machine",
    StartAt: "Start",
    States: {
      Start: { Type: "Pass", End: true },
    },
  },
  null,
  2,
);

interface CreateMachineDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (arn: string, name: string) => void;
}

function CreateMachineDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateMachineDialogProps) {
  const [name, setName] = useState("");
  const [definition, setDefinition] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { createStateMachine } = useSfnActions();

  const isNameValid = MACHINE_NAME_REGEX.test(name);
  const showNameError = name.length > 0 && !isNameValid;

  const validateDefinition = (text: string): string | null => {
    if (text.trim().length === 0) {
      return "Definition is required";
    }
    try {
      parseAsl(text);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  };

  const handleDefinitionChange = (val: string) => {
    setDefinition(val);
    if (parseError) {
      setParseError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isNameValid || isSubmitting) return;

    const error = validateDefinition(definition);
    setParseError(error);
    if (error) return;

    setIsSubmitting(true);
    try {
      const arn = await createStateMachine({ name, definition });
      if (arn) {
        setName("");
        setDefinition("");
        setParseError(null);
        onOpenChange(false);
        onCreated(arn, name);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <form onSubmit={handleSubmit} className="min-w-0">
          <DialogHeader>
            <DialogTitle>Create state machine</DialogTitle>
            <DialogDescription>
              Define an ASL (Amazon States Language) state machine. LocalStack
              executes standard workflows inline.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4 min-w-0">
            <div className="space-y-2">
              <Label htmlFor="machine-name">State machine name</Label>
              <Input
                id="machine-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="my-state-machine"
                autoFocus
              />
              {showNameError ? (
                <p className="text-xs text-destructive">
                  1–80 characters — letters, digits, hyphens, underscores
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Alphanumeric, hyphens, and underscores. Max 80 chars.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="machine-definition">Definition (ASL JSON)</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => handleDefinitionChange(SAMPLE_ASL)}
                >
                  Insert sample
                </Button>
              </div>
              <textarea
                id="machine-definition"
                className="flex min-h-[220px] w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={definition}
                onChange={(e) => handleDefinitionChange(e.target.value)}
                placeholder='{"StartAt":"Start","States":{"Start":{"Type":"Succeed"}}}'
              />
              {parseError ? (
                <p className="text-xs text-destructive">{parseError}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Amazon States Language JSON. Validated before creation.
                </p>
              )}
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
            <Button type="submit" disabled={!isNameValid || isSubmitting}>
              {isSubmitting ? "Creating..." : "Create state machine"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SfnServiceView() {
  const profile = useActiveProfile();
  const serviceStatus = useServiceStatus("sfn");
  const {
    data: machines,
    isPending,
    error,
    refetch,
    isFetching,
  } = useStateMachines(profile.id);
  const { deleteStateMachine } = useSfnActions();
  const { openTab, closeTab } = useTabs();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [machineToDelete, setMachineToDelete] =
    useState<StateMachineSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  if (serviceStatus === "disabled" || (error && isServiceDisabledError(error))) {
    return <ServiceDisabledView service="sfn" />;
  }

  const handleRowClick = (machine: StateMachineSummary) => {
    openTab({
      id: `stateMachine:${machine.arn}`,
      kind: "stateMachine",
      stateMachineArn: machine.arn,
      title: machine.name,
    });
  };

  const handleDelete = async () => {
    if (!machineToDelete) return;
    setIsDeleting(true);
    try {
      const ok = await deleteStateMachine(machineToDelete.arn, machineToDelete.name);
      if (ok) {
        closeTab(`stateMachine:${machineToDelete.arn}`);
        setMachineToDelete(null);
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Workflow className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">Step Functions</h1>
              <p className="text-xs text-muted-foreground">
                State machines &amp; executions
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              title="Refresh state machines"
            >
              <RotateCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button size="sm" onClick={() => setIsCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Create state machine
            </Button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isPending ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <CircleAlert className="h-8 w-8 text-destructive" />
            <p className="text-sm font-medium">Failed to load state machines</p>
            <p className="text-xs text-muted-foreground">
              {error instanceof Error ? error.message : String(error)}
            </p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : !machines || machines.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <Workflow className="h-10 w-10 text-muted-foreground/50" />
            <div>
              <p className="text-sm font-medium">No state machines</p>
              <p className="text-xs text-muted-foreground">
                Create a state machine to get started.
              </p>
            </div>
            <Button size="sm" onClick={() => setIsCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Create state machine
            </Button>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-muted/50 backdrop-blur text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-6 py-3 font-medium">Name</th>
                <th className="px-6 py-3 font-medium">Created</th>
                <th className="px-6 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {machines.map((machine) => (
                <tr
                  key={machine.arn}
                  className="cursor-pointer transition-colors hover:bg-accent/50"
                  onClick={() => handleRowClick(machine)}
                >
                  <td className="px-6 py-3 font-medium">
                    <span className="font-mono text-xs sm:text-sm">{machine.name}</span>
                  </td>
                  <td className="px-6 py-3">
                    <Badge variant="outline" className="text-xs">
                      {machine.creationDate
                        ? new Date(machine.creationDate).toLocaleString()
                        : "—"}
                    </Badge>
                  </td>
                  <td className="px-6 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" title={`Actions for ${machine.name}`}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setMachineToDelete(machine)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete state machine
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <CreateMachineDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onCreated={(arn, name) =>
          openTab({
            id: `stateMachine:${arn}`,
            kind: "stateMachine",
            stateMachineArn: arn,
            title: name,
          })
        }
      />

      <DeleteConfirmDialog
        open={Boolean(machineToDelete)}
        onOpenChange={(open) => !open && setMachineToDelete(null)}
        title="Delete state machine"
        description={`Are you sure you want to delete state machine “${machineToDelete?.name ?? ""}”? Running executions will be aborted.`}
        confirmLabel="Delete"
        isPending={isDeleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
