import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  Check,
  CircleAlert,
  Copy,
  Info,
  Loader2,
  MoreHorizontal,
  Plus,
  RotateCw,
  Trash2,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { toast } from "sonner";
import { useActiveProfile } from "@/store/profiles";
import { useTabs } from "@/store/tabs";
import {
  useScheduleGroups,
  useScheduleGroupActions,
  useSchedules,
  useScheduleActions,
} from "@/hooks/use-scheduler";
import type { ScheduleSummary } from "@/lib/scheduler";
import { TargetPicker } from "@/components/eventbridge/TargetPicker";

const SCHEDULE_NAME_REGEX = /^[0-9a-zA-Z\-_.]{1,64}$/;
const DEFAULT_ROLE_ARN =
  "arn:aws:iam::000000000000:role/localstacker-scheduler";

function prettyJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

interface ScheduleDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schedule: ScheduleSummary | null;
}

function ScheduleDetailDialog({
  open,
  onOpenChange,
  schedule,
}: ScheduleDetailDialogProps) {
  if (!schedule) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle>{schedule.name}</DialogTitle>
            {schedule.state === "ENABLED" ? (
              <Badge className="text-xs">ENABLED</Badge>
            ) : (
              <Badge variant="secondary" className="text-xs">
                DISABLED
              </Badge>
            )}
          </div>
          <DialogDescription className="font-mono text-xs">
            {schedule.arn}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 text-xs">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 border-y py-3">
            <div>
              <p className="text-muted-foreground">Expression</p>
              <p className="font-mono font-medium">{schedule.expression || "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Timezone</p>
              <p className="font-medium">{schedule.timezone ?? "UTC"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Flexible window</p>
              <p className="font-medium">
                {schedule.flexibleWindowMode ?? "OFF"}
              </p>
            </div>
            <div className="sm:col-span-3">
              <p className="text-muted-foreground">Target ARN</p>
              <p className="font-mono font-medium break-all">
                {schedule.targetArn || "—"}
              </p>
            </div>
            {schedule.roleArn && (
              <div className="sm:col-span-3">
                <p className="text-muted-foreground">Role ARN</p>
                <p className="font-mono font-medium break-all">
                  {schedule.roleArn}
                </p>
              </div>
            )}
            {schedule.lastModificationDate && (
              <div>
                <p className="text-muted-foreground">Last modified</p>
                <p className="font-medium">
                  {schedule.lastModificationDate.toLocaleString()}
                </p>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Payload (Target Input)</Label>
            {schedule.targetInput ? (
              <pre className="whitespace-pre-wrap break-all rounded-md bg-muted/50 p-3 font-mono text-xs max-h-60 overflow-auto">
                {prettyJson(schedule.targetInput)}
              </pre>
            ) : (
              <p className="text-muted-foreground italic">No input payload</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface CreateScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupName: string;
}

function CreateScheduleDialog({
  open,
  onOpenChange,
  groupName,
}: CreateScheduleDialogProps) {
  const { createSchedule } = useScheduleActions(groupName);

  const [name, setName] = useState("");
  const [exprType, setExprType] = useState<"rate" | "cron" | "at">("rate");
  const [expression, setExpression] = useState("");
  const [timezone, setTimezone] = useState("");
  const [targetArn, setTargetArn] = useState<string | null>(null);
  const [inputJson, setInputJson] = useState("");
  const [roleArn, setRoleArn] = useState(DEFAULT_ROLE_ARN);
  const [state, setState] = useState<"ENABLED" | "DISABLED">("ENABLED");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setExprType("rate");
      setExpression("");
      setTimezone("");
      setTargetArn(null);
      setInputJson("");
      setRoleArn(DEFAULT_ROLE_ARN);
      setState("ENABLED");
    }
  }, [open]);

  const nameValid = SCHEDULE_NAME_REGEX.test(name);
  const showNameError = name.length > 0 && !nameValid;

  const expressionValid = useMemo(() => {
    if (!expression.trim()) return false;
    const trimmed = expression.trim();
    if (exprType === "rate") return /^rate\(.+\)$/.test(trimmed);
    if (exprType === "cron") return /^cron\(.+\)$/.test(trimmed);
    if (exprType === "at") return /^at\(.+\)$/.test(trimmed);
    return false;
  }, [exprType, expression]);

  const showExpressionError = expression.length > 0 && !expressionValid;

  const inputError = useMemo(() => {
    if (!inputJson.trim()) return false;
    try {
      JSON.parse(inputJson);
      return false;
    } catch {
      return true;
    }
  }, [inputJson]);

  const isValid =
    nameValid &&
    expressionValid &&
    Boolean(targetArn) &&
    !inputError &&
    roleArn.trim().length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const arn = await createSchedule({
        name: name.trim(),
        expression: expression.trim(),
        expressionType: exprType,
        timezone: timezone.trim() || undefined,
        targetArn: targetArn!,
        targetInput: inputJson.trim() ? inputJson.trim() : undefined,
        roleArn: roleArn.trim() || undefined,
        state,
      });
      if (arn) {
        onOpenChange(false);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const placeholderForType =
    exprType === "rate"
      ? "rate(5 minutes)"
      : exprType === "cron"
        ? "cron(0 12 * * ? *)"
        : "at(2026-12-01T00:00:00Z)";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto max-w-xl">
        <form onSubmit={handleSubmit} className="min-w-0">
          <DialogHeader>
            <DialogTitle>Create schedule</DialogTitle>
            <DialogDescription>
              Create a schedule in group “{groupName}”.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4 min-w-0">
            <div className="space-y-2">
              <Label htmlFor="sched-name">Schedule name</Label>
              <Input
                id="sched-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="my-schedule"
                autoFocus
              />
              {showNameError ? (
                <p className="text-xs text-destructive">
                  1–64 characters — letters, digits, hyphens, underscores, dots
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Alphanumeric, hyphens, underscores, and dots.
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label htmlFor="sched-expr-type">Expression type</Label>
                <Select
                  value={exprType}
                  onValueChange={(v) =>
                    setExprType(v as "rate" | "cron" | "at")
                  }
                >
                  <SelectTrigger id="sched-expr-type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rate">rate(…)</SelectItem>
                    <SelectItem value="cron">cron(…)</SelectItem>
                    <SelectItem value="at">at(…)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="sm:col-span-2 space-y-2">
                <Label htmlFor="sched-expr">Expression</Label>
                <Input
                  id="sched-expr"
                  value={expression}
                  onChange={(e) => setExpression(e.target.value)}
                  placeholder={placeholderForType}
                  className="font-mono text-xs"
                />
                {showExpressionError ? (
                  <p className="text-xs text-destructive">
                    Must start with “{exprType}(” and end with “)”
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    e.g. {placeholderForType}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="sched-tz">Timezone (optional)</Label>
                <Input
                  id="sched-tz"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  placeholder="UTC"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sched-state">State</Label>
                <Select
                  value={state}
                  onValueChange={(v) => setState(v as "ENABLED" | "DISABLED")}
                >
                  <SelectTrigger id="sched-state" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ENABLED">ENABLED</SelectItem>
                    <SelectItem value="DISABLED">DISABLED</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="border-t pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Target configuration
              </h3>
              <TargetPicker arn={targetArn} onArnChange={setTargetArn} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="sched-input">Input (JSON, optional)</Label>
              <textarea
                id="sched-input"
                value={inputJson}
                onChange={(e) => setInputJson(e.target.value)}
                placeholder='{"job":"nightly"}'
                className="flex min-h-[90px] w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              {inputError ? (
                <p className="text-xs text-destructive">
                  Input must be valid JSON
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Payload delivered to the target on execution.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="sched-role">Role ARN</Label>
              <Input
                id="sched-role"
                value={roleArn}
                onChange={(e) => setRoleArn(e.target.value)}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                IAM execution role. Pre-filled with a dummy ARN for LocalStack.
              </p>
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
              {isSubmitting ? "Creating..." : "Create schedule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface ScheduleGroupViewProps {
  groupName: string;
}

export function ScheduleGroupView({ groupName }: ScheduleGroupViewProps) {
  const profile = useActiveProfile();
  const { data: groups, refetch: refetchGroups, isFetching: fetchingGroups } =
    useScheduleGroups(profile.id);
  const {
    data: schedules,
    isPending: schedulesPending,
    error: schedulesError,
    refetch: refetchSchedules,
    isFetching: fetchingSchedules,
  } = useSchedules(profile.id, groupName);

  const { deleteScheduleGroup } = useScheduleGroupActions();
  const { deleteSchedule, updateScheduleState } =
    useScheduleActions(groupName);
  const { closeTab } = useTabs();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedSchedule, setSelectedSchedule] =
    useState<ScheduleSummary | null>(null);
  const [scheduleToDelete, setScheduleToDelete] =
    useState<ScheduleSummary | null>(null);
  const [isDeletingSchedule, setIsDeletingSchedule] = useState(false);
  const [isDeleteGroupOpen, setIsDeleteGroupOpen] = useState(false);
  const [isDeletingGroup, setIsDeletingGroup] = useState(false);

  const group = groups?.find((g) => g.name === groupName);
  const isDefault = groupName === "default";

  const [hasCopiedArn, setHasCopiedArn] = useState(false);
  const handleCopyArn = async () => {
    if (!group?.arn) return;
    try {
      await navigator.clipboard.writeText(group.arn);
      setHasCopiedArn(true);
      toast.success("Group ARN copied");
      setTimeout(() => setHasCopiedArn(false), 2000);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to copy group ARN",
      );
    }
  };

  const handleRefresh = () => {
    refetchGroups();
    refetchSchedules();
  };

  const handleDeleteSchedule = async () => {
    if (!scheduleToDelete) return;
    setIsDeletingSchedule(true);
    try {
      const ok = await deleteSchedule(scheduleToDelete.name);
      if (ok) {
        if (selectedSchedule?.name === scheduleToDelete.name) {
          setSelectedSchedule(null);
        }
        setScheduleToDelete(null);
      }
    } finally {
      setIsDeletingSchedule(false);
    }
  };

  const handleDeleteGroup = async () => {
    setIsDeletingGroup(true);
    try {
      const ok = await deleteScheduleGroup(groupName);
      if (ok) {
        closeTab(`scheduleGroup:${groupName}`);
        setIsDeleteGroupOpen(false);
      }
    } finally {
      setIsDeletingGroup(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <CalendarClock className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold">{groupName}</h1>
                {isDefault && (
                  <Badge variant="outline" className="text-xs">
                    default
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="font-mono text-xs text-muted-foreground truncate max-w-sm sm:max-w-md">
                  {group?.arn ?? "—"}
                </span>
                {group?.arn && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={handleCopyArn}
                    title="Copy ARN"
                  >
                    {hasCopiedArn ? (
                      <Check className="h-3.5 w-3.5 text-green-500" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              title="Refresh group"
            >
              <RotateCw
                className={`h-4 w-4 ${
                  fetchingGroups || fetchingSchedules ? "animate-spin" : ""
                }`}
              />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button size="sm" onClick={() => setIsCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Create schedule
            </Button>
            {!isDefault && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setIsDeleteGroupOpen(true)}
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Informational note: LocalStack community does not execute schedules */}
      <div className="border-b bg-muted/30 px-6 py-2 flex items-center gap-2 text-xs text-muted-foreground">
        <Info className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span>
          LocalStack community stores schedules but does not execute them (no target triggering).
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto">
        <div className="border-b bg-muted/20 px-6 py-2.5 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Schedules ({schedules?.length ?? 0})
          </h2>
        </div>

        {schedulesPending ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : schedulesError ? (
          <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
            <CircleAlert className="h-8 w-8 text-destructive" />
            <p className="text-sm font-medium">Failed to load schedules</p>
            <p className="text-xs text-muted-foreground">
              {schedulesError instanceof Error
                ? schedulesError.message
                : String(schedulesError)}
            </p>
            <Button variant="outline" size="sm" onClick={() => refetchSchedules()}>
              Retry
            </Button>
          </div>
        ) : !schedules || schedules.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-muted-foreground">
            <CalendarClock className="h-10 w-10 stroke-1" />
            <p className="text-sm font-medium">No schedules</p>
            <p className="text-xs">
              Create a schedule to trigger actions on rate, cron, or one-time at expressions.
            </p>
            <Button
              size="sm"
              className="mt-2"
              onClick={() => setIsCreateOpen(true)}
            >
              <Plus className="h-4 w-4" />
              Create schedule
            </Button>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted/50 text-xs font-medium text-muted-foreground">
              <tr>
                <th className="px-6 py-3">Name</th>
                <th className="px-6 py-3">State</th>
                <th className="px-6 py-3">Expression</th>
                <th className="px-6 py-3">Target ARN</th>
                <th className="px-6 py-3">Last modified</th>
                <th className="w-12 px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {schedules.map((sched) => (
                <tr
                  key={sched.arn || sched.name}
                  onClick={() => setSelectedSchedule(sched)}
                  className="cursor-pointer transition-colors hover:bg-muted/50"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedSchedule(sched);
                    }
                  }}
                >
                  <td className="px-6 py-3 font-medium">
                    <span className="font-mono text-xs sm:text-sm">
                      {sched.name}
                    </span>
                  </td>
                  <td className="px-6 py-3">
                    {sched.state === "ENABLED" ? (
                      <Badge className="text-xs">ENABLED</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">
                        DISABLED
                      </Badge>
                    )}
                  </td>
                  <td className="px-6 py-3">
                    <span
                      className="block max-w-xs truncate font-mono text-xs text-muted-foreground"
                      title={sched.expression}
                    >
                      {sched.expression || "—"}
                    </span>
                  </td>
                  <td className="px-6 py-3">
                    <span
                      className="block max-w-xs truncate font-mono text-xs text-muted-foreground"
                      title={sched.targetArn}
                    >
                      {sched.targetArn || "—"}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-xs text-muted-foreground">
                    {sched.lastModificationDate
                      ? sched.lastModificationDate.toLocaleString()
                      : "—"}
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
                          aria-label={`Actions for ${sched.name}`}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() =>
                            updateScheduleState(
                              sched.name,
                              sched.state !== "ENABLED",
                            )
                          }
                        >
                          {sched.state === "ENABLED" ? "Disable" : "Enable"}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setScheduleToDelete(sched)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete schedule
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

      {/* Dialogs */}
      <CreateScheduleDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        groupName={groupName}
      />

      <ScheduleDetailDialog
        open={Boolean(selectedSchedule)}
        onOpenChange={(open) => !open && setSelectedSchedule(null)}
        schedule={selectedSchedule}
      />

      <DeleteConfirmDialog
        open={Boolean(scheduleToDelete)}
        onOpenChange={(open) => !open && setScheduleToDelete(null)}
        title="Delete schedule"
        description={`Are you sure you want to delete schedule “${
          scheduleToDelete?.name ?? ""
        }”?`}
        confirmLabel="Delete"
        isPending={isDeletingSchedule}
        onConfirm={handleDeleteSchedule}
      />

      <DeleteConfirmDialog
        open={isDeleteGroupOpen}
        onOpenChange={setIsDeleteGroupOpen}
        title="Delete schedule group"
        description={`Are you sure you want to delete schedule group “${groupName}”? All schedules in it will be removed.`}
        confirmLabel="Delete"
        isPending={isDeletingGroup}
        onConfirm={handleDeleteGroup}
      />
    </div>
  );
}
