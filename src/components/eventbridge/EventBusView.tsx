import { useEffect, useMemo, useState } from "react";
import {
  Check,
  CircleAlert,
  Copy,
  Loader2,
  MoreHorizontal,
  Plus,
  RotateCw,
  Send,
  Trash2,
  Webhook,
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
  useEventBuses,
  useEventBusActions,
  useRuleActions,
  usePutEvents,
  useRuleTargets,
  useRules,
} from "@/hooks/use-eventbridge";
import type { RuleSummary, RuleTarget } from "@/lib/eventbridge";
import { TargetPicker } from "./TargetPicker";

const RULE_NAME_REGEX = /^[\.\-_A-Za-z0-9]{1,64}$/;
const SCHEDULE_REGEX = /^(rate|cron|at)\(.+\)$/;

function prettyJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function targetTypeLabel(arn: string): string {
  const service = arn.split(":")[2];
  if (service === "lambda") return "Lambda";
  if (service === "sqs") return "SQS";
  if (service === "sns") return "SNS";
  if (service === "states") return "Step Functions";
  return "Custom";
}

interface RuleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Existing rule to edit, or null to create. */
  rule: RuleSummary | null;
  busName: string;
  onSaved?: (name: string) => void;
}

function RuleDialog({ open, onOpenChange, rule, busName, onSaved }: RuleDialogProps) {
  const { putRule } = useRuleActions(busName);
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"pattern" | "schedule">("pattern");
  const [pattern, setPattern] = useState("");
  const [schedule, setSchedule] = useState("");
  const [state, setState] = useState<"ENABLED" | "DISABLED">("ENABLED");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName(rule?.name ?? "");
      setMode(rule?.scheduleExpression ? "schedule" : "pattern");
      setPattern(rule?.eventPattern ?? "");
      setSchedule(rule?.scheduleExpression ?? "");
      setState(rule && rule.state === "DISABLED" ? "DISABLED" : "ENABLED");
      setDescription(rule?.description ?? "");
    }
  }, [open, rule]);

  const nameValid = RULE_NAME_REGEX.test(name);
  const showNameError = name.length > 0 && !nameValid;

  const patternError = useMemo(() => {
    if (mode !== "pattern" || !pattern.trim()) return false;
    try {
      const parsed: unknown = JSON.parse(pattern);
      return typeof parsed !== "object" || parsed === null || Array.isArray(parsed);
    } catch {
      return true;
    }
  }, [mode, pattern]);

  const scheduleValid =
    mode !== "schedule" || SCHEDULE_REGEX.test(schedule.trim());
  const showScheduleError = mode === "schedule" && schedule.length > 0 && !scheduleValid;

  const isValid =
    nameValid &&
    !patternError &&
    scheduleValid &&
    (mode === "pattern" ? pattern.trim().length > 0 : schedule.trim().length > 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const arn = await putRule({
        name: name.trim(),
        eventPattern: mode === "pattern" ? pattern.trim() : undefined,
        scheduleExpression: mode === "schedule" ? schedule.trim() : undefined,
        state,
        description: description.trim() || undefined,
      });
      if (arn !== null) {
        onOpenChange(false);
        onSaved?.(name.trim());
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit} className="min-w-0">
          <DialogHeader>
            <DialogTitle>{rule ? "Edit rule" : "Create rule"}</DialogTitle>
            <DialogDescription>
              {rule
                ? `Update rule “${rule.name}”.`
                : "Match events by pattern or run on a schedule."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4 min-w-0">
            <div className="space-y-2">
              <Label htmlFor="rule-name">Rule name</Label>
              <Input
                id="rule-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="my-rule"
                disabled={Boolean(rule)}
                autoFocus={!rule}
              />
              {showNameError ? (
                <p className="text-xs text-destructive">
                  1–64 characters — letters, digits, hyphens, underscores, dots
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  AWS rule names are immutable after creation.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Type</Label>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm font-normal cursor-pointer">
                  <input
                    type="radio"
                    name="rule-type"
                    checked={mode === "pattern"}
                    onChange={() => setMode("pattern")}
                    className="h-4 w-4 border-input text-primary focus:ring-ring"
                  />
                  Event pattern
                </label>
                <label className="flex items-center gap-2 text-sm font-normal cursor-pointer">
                  <input
                    type="radio"
                    name="rule-type"
                    checked={mode === "schedule"}
                    onChange={() => setMode("schedule")}
                    className="h-4 w-4 border-input text-primary focus:ring-ring"
                  />
                  Schedule expression
                </label>
              </div>
            </div>

            {mode === "pattern" ? (
              <div className="space-y-2">
                <Label htmlFor="rule-pattern">Event pattern (JSON)</Label>
                <textarea
                  id="rule-pattern"
                  value={pattern}
                  onChange={(e) => setPattern(e.target.value)}
                  placeholder={'{"source":["com.localstacker.demo"]}'}
                  className="flex min-h-[100px] w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                {patternError ? (
                  <p className="text-xs text-destructive">
                    Event pattern must be a JSON object
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    JSON object matched against published events.
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="rule-schedule">Schedule expression</Label>
                <Input
                  id="rule-schedule"
                  value={schedule}
                  onChange={(e) => setSchedule(e.target.value)}
                  placeholder="rate(5 minutes)"
                  className="font-mono text-xs"
                  autoFocus
                />
                {showScheduleError ? (
                  <p className="text-xs text-destructive">
                    Must look like rate(5 minutes), cron(0 12 * * ? *) or at(iso8601)
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    rate(…), cron(…) or at(iso8601).
                  </p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="rule-state">State</Label>
              <Select
                value={state}
                onValueChange={(v) => setState(v as "ENABLED" | "DISABLED")}
              >
                <SelectTrigger id="rule-state" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ENABLED">ENABLED</SelectItem>
                  <SelectItem value="DISABLED">DISABLED</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="rule-description">Description (optional)</Label>
              <Input
                id="rule-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What this rule matches"
              />
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
              {isSubmitting ? "Saving..." : rule ? "Save rule" : "Create rule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface AddTargetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule: string;
  busName: string;
}

function AddTargetDialog({ open, onOpenChange, rule, busName }: AddTargetDialogProps) {
  const { addTargets } = useRuleActions(busName);
  const [targetId, setTargetId] = useState("");
  const [arn, setArn] = useState<string | null>(null);
  const [inputJson, setInputJson] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setTargetId(`target-${Math.random().toString(36).slice(2, 6)}`);
      setInputJson("");
      setArn(null);
    }
  }, [open]);

  const inputError =
    inputJson.trim().length > 0 && (() => {
      try {
        JSON.parse(inputJson);
        return false;
      } catch {
        return true;
      }
    })();

  const isValid = Boolean(arn) && targetId.trim().length > 0 && !inputError;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const ok = await addTargets(rule, [
        {
          id: targetId.trim(),
          arn: arn!,
          input: inputJson.trim() ? inputJson.trim() : undefined,
        },
      ]);
      if (ok) onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit} className="min-w-0">
          <DialogHeader>
            <DialogTitle>Add target</DialogTitle>
            <DialogDescription>
              Route matched events from rule “{rule}” to a resource.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4 min-w-0">
            <TargetPicker arn={arn} onArnChange={setArn} />

            <div className="space-y-2">
              <Label htmlFor="target-id">Target ID</Label>
              <Input
                id="target-id"
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                placeholder="target-1"
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Unique per rule. Auto-generated; edit if you prefer.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="target-input">Input (JSON, optional)</Label>
              <textarea
                id="target-input"
                value={inputJson}
                onChange={(e) => setInputJson(e.target.value)}
                placeholder='{"key":"value"}'
                className="flex min-h-[100px] w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              {inputError ? (
                <p className="text-xs text-destructive">
                  Input must be valid JSON
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Overrides the event body delivered to the target.
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
            <Button type="submit" disabled={!isValid || isSubmitting}>
              {isSubmitting ? "Adding..." : "Add target"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface PutEventsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busName: string;
}

function PutEventsDialog({ open, onOpenChange, busName }: PutEventsDialogProps) {
  const publish = usePutEvents(busName);
  const [source, setSource] = useState("");
  const [detailType, setDetailType] = useState("");
  const [detail, setDetail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setSource("");
      setDetailType("");
      setDetail("");
    }
  }, [open]);

  const detailError = useMemo(() => {
    if (!detail.trim()) return false;
    try {
      const parsed: unknown = JSON.parse(detail);
      return typeof parsed !== "object" || parsed === null || Array.isArray(parsed);
    } catch {
      return true;
    }
  }, [detail]);

  const isValid =
    source.trim().length > 0 &&
    detailType.trim().length > 0 &&
    detail.trim().length > 0 &&
    !detailError;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const eventId = await publish({
        source: source.trim(),
        detailType: detailType.trim(),
        detail: detail.trim(),
      });
      if (eventId) onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit} className="min-w-0">
          <DialogHeader>
            <DialogTitle>Publish test event</DialogTitle>
            <DialogDescription>
              Send one event to bus “{busName}” via PutEvents.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4 min-w-0">
            <div className="space-y-2">
              <Label htmlFor="event-source">Source</Label>
              <Input
                id="event-source"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="com.localstacker.demo"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="event-detail-type">Detail type</Label>
              <Input
                id="event-detail-type"
                value={detailType}
                onChange={(e) => setDetailType(e.target.value)}
                placeholder="order.placed"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="event-detail">Detail (JSON object)</Label>
              <textarea
                id="event-detail"
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                placeholder='{"match":"yes"}'
                className="flex min-h-[120px] w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              {detailError ? (
                <p className="text-xs text-destructive">
                  Detail must be a JSON object
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  JSON object delivered as the event detail.
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
            <Button type="submit" disabled={!isValid || isSubmitting}>
              {isSubmitting ? "Publishing..." : "Publish event"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface EventBusViewProps {
  busName: string;
}

export function EventBusView({ busName }: EventBusViewProps) {
  const profile = useActiveProfile();
  const { data: buses, refetch: refetchBuses, isFetching: fetchingBuses } = useEventBuses(profile.id);
  const { data: rules, isPending: rulesPending, error: rulesError, refetch: refetchRules, isFetching: fetchingRules } = useRules(profile.id, busName);
  const { deleteBus } = useEventBusActions();
  const { deleteRule, setRuleState, removeTargets } = useRuleActions(busName);
  const { closeTab } = useTabs();

  const [selectedRuleName, setSelectedRuleName] = useState<string | null>(null);
  const activeRule =
    rules?.find((r) => r.name === selectedRuleName) ?? rules?.[0] ?? null;
  const { data: targets, isFetching: fetchingTargets } = useRuleTargets(
    profile.id,
    busName,
    activeRule?.name,
  );

  const [isRuleDialogOpen, setIsRuleDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<RuleSummary | null>(null);
  const [isAddTargetOpen, setIsAddTargetOpen] = useState(false);
  const [isPublishOpen, setIsPublishOpen] = useState(false);
  const [ruleToDelete, setRuleToDelete] = useState<RuleSummary | null>(null);
  const [isDeletingRule, setIsDeletingRule] = useState(false);
  const [isDeleteBusOpen, setIsDeleteBusOpen] = useState(false);
  const [isDeletingBus, setIsDeletingBus] = useState(false);
  const [targetToRemove, setTargetToRemove] = useState<RuleTarget | null>(null);
  const [isRemovingTarget, setIsRemovingTarget] = useState(false);
  const [expandedInput, setExpandedInput] = useState<string | null>(null);

  const bus = buses?.find((b) => b.name === busName);
  const isDefault = busName === "default";

  const [hasCopiedArn, setHasCopiedArn] = useState(false);
  const handleCopyArn = async () => {
    if (!bus?.arn) return;
    try {
      await navigator.clipboard.writeText(bus.arn);
      setHasCopiedArn(true);
      toast.success("Bus ARN copied");
      setTimeout(() => setHasCopiedArn(false), 2000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to copy bus ARN");
    }
  };

  const handleRefresh = () => {
    refetchBuses();
    refetchRules();
  };

  const handleDeleteRule = async () => {
    if (!ruleToDelete) return;
    setIsDeletingRule(true);
    try {
      const ok = await deleteRule(ruleToDelete.name);
      if (ok) {
        if (selectedRuleName === ruleToDelete.name) setSelectedRuleName(null);
        setRuleToDelete(null);
      }
    } finally {
      setIsDeletingRule(false);
    }
  };

  const handleDeleteBus = async () => {
    setIsDeletingBus(true);
    try {
      const ok = await deleteBus(busName);
      if (ok) {
        closeTab(`eventBus:${busName}`);
        setIsDeleteBusOpen(false);
      }
    } finally {
      setIsDeletingBus(false);
    }
  };

  const handleRemoveTarget = async () => {
    if (!targetToRemove || !activeRule) return;
    setIsRemovingTarget(true);
    try {
      const ok = await removeTargets(activeRule.name, [targetToRemove.id]);
      if (ok) {
        setTargetToRemove(null);
        setExpandedInput(null);
      }
    } finally {
      setIsRemovingTarget(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Webhook className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold">{busName}</h1>
                {isDefault && (
                  <Badge variant="outline" className="text-xs">
                    default
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="font-mono text-xs text-muted-foreground truncate max-w-sm sm:max-w-md">
                  {bus?.arn ?? "—"}
                </span>
                {bus?.arn && (
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
              title="Refresh bus"
            >
              <RotateCw
                className={`h-4 w-4 ${fetchingBuses || fetchingRules ? "animate-spin" : ""}`}
              />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsPublishOpen(true)}
            >
              <Send className="h-4 w-4" />
              Publish test event
            </Button>
            <Button size="sm" onClick={() => {
              setEditingRule(null);
              setIsRuleDialogOpen(true);
            }}>
              <Plus className="h-4 w-4" />
              Create rule
            </Button>
            {!isDefault && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setIsDeleteBusOpen(true)}
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto">
        {/* Rules section */}
        <div className="border-b bg-muted/20 px-6 py-2.5 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Rules ({rules?.length ?? 0})
          </h2>
        </div>

        {rulesPending ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : rulesError ? (
          <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
            <CircleAlert className="h-8 w-8 text-destructive" />
            <p className="text-sm font-medium">Failed to load rules</p>
            <p className="text-xs text-muted-foreground">
              {rulesError instanceof Error ? rulesError.message : String(rulesError)}
            </p>
            <Button variant="outline" size="sm" onClick={() => refetchRules()}>
              Retry
            </Button>
          </div>
        ) : !rules || rules.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-muted-foreground">
            <Webhook className="h-10 w-10 stroke-1" />
            <p className="text-sm font-medium">No rules</p>
            <p className="text-xs">Create a rule to match and route events.</p>
            <Button
              size="sm"
              className="mt-2"
              onClick={() => {
                setEditingRule(null);
                setIsRuleDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              Create rule
            </Button>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted/50 text-xs font-medium text-muted-foreground">
              <tr>
                <th className="px-6 py-3">Rule</th>
                <th className="px-6 py-3">State</th>
                <th className="px-6 py-3">Expression</th>
                <th className="px-6 py-3">Description</th>
                <th className="w-12 px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rules.map((rule) => (
                <tr
                  key={rule.arn || rule.name}
                  onClick={() => setSelectedRuleName(rule.name)}
                  className={`cursor-pointer transition-colors hover:bg-muted/50 ${
                    activeRule?.name === rule.name ? "bg-muted/50" : ""
                  }`}
                >
                  <td className="px-6 py-3 font-medium">
                    <span className="font-mono text-xs sm:text-sm">{rule.name}</span>
                  </td>
                  <td className="px-6 py-3">
                    {rule.state === "ENABLED" ? (
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
                      title={rule.scheduleExpression ?? "Event pattern"}
                    >
                      {rule.scheduleExpression ?? "Pattern"}
                    </span>
                  </td>
                  <td className="px-6 py-3">
                    <span className="block max-w-xs truncate text-xs text-muted-foreground" title={rule.description ?? ""}>
                      {rule.description ?? "—"}
                    </span>
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
                          aria-label={`Actions for rule ${rule.name}`}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => {
                            setEditingRule(rule);
                            setIsRuleDialogOpen(true);
                          }}
                        >
                          Edit rule
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            setRuleState(rule.name, rule.state !== "ENABLED")
                          }
                        >
                          {rule.state === "ENABLED" ? "Disable" : "Enable"}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setRuleToDelete(rule)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete rule
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Rule detail section */}
        {activeRule && (
          <div className="border-b">
            <div className="bg-muted/20 px-6 py-2.5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Rule detail
              </h2>
            </div>
            <div className="px-6 py-4 space-y-2">
              <p className="text-sm font-medium font-mono">{activeRule.name}</p>
              {activeRule.eventPattern ? (
                <pre className="whitespace-pre-wrap break-all rounded-md bg-muted/50 p-2 font-mono text-xs">
                  {prettyJson(activeRule.eventPattern)}
                </pre>
              ) : activeRule.scheduleExpression ? (
                <p className="font-mono text-xs text-muted-foreground">
                  {activeRule.scheduleExpression}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">No expression</p>
              )}
              {activeRule.description && (
                <p className="text-xs text-muted-foreground">
                  {activeRule.description}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Targets section */}
        {activeRule && (
          <div>
            <div className="border-b bg-muted/20 px-6 py-2.5 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Targets ({targets?.length ?? 0}) — {activeRule.name}
              </h2>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsAddTargetOpen(true)}
              >
                <Plus className="h-4 w-4" />
                Add target
              </Button>
            </div>
            {!targets || targets.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-8 text-center text-muted-foreground">
                <Send className="h-8 w-8 stroke-1" />
                <p className="text-sm font-medium">No targets</p>
                <p className="text-xs">
                  Add a target to deliver matched events.
                </p>
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-muted/50 text-xs font-medium text-muted-foreground">
                  <tr>
                    <th className="px-6 py-3">Target ID</th>
                    <th className="px-6 py-3">Type</th>
                    <th className="px-6 py-3">ARN</th>
                    <th className="px-6 py-3">Input</th>
                    <th className="w-12 px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {targets.map((target) => (
                    <tr key={target.id} className={fetchingTargets ? "opacity-60" : ""}>
                      <td className="px-6 py-3 font-medium">
                        <span className="font-mono text-xs sm:text-sm">{target.id}</span>
                      </td>
                      <td className="px-6 py-3">
                        <Badge variant="outline" className="text-xs">
                          {targetTypeLabel(target.arn)}
                        </Badge>
                      </td>
                      <td className="px-6 py-3">
                        <span
                          className="block max-w-xs truncate font-mono text-xs text-muted-foreground"
                          title={target.arn}
                        >
                          {target.arn}
                        </span>
                      </td>
                      <td className="px-6 py-3">
                        {target.input ? (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground"
                            onClick={() =>
                              setExpandedInput(
                                expandedInput === target.id ? null : target.id,
                              )
                            }
                            title="Toggle input payload"
                          >
                            <Badge variant="secondary" className="font-mono text-xs">
                              JSON
                            </Badge>
                            {expandedInput === target.id ? "Hide" : "Show"}
                          </button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              aria-label={`Actions for target ${target.id}`}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setTargetToRemove(target)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Remove target
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {expandedInput && targets?.some((t) => t.id === expandedInput) && (
              <div className="px-6 py-3 border-b bg-muted/10">
                <pre className="whitespace-pre-wrap break-all rounded-md bg-muted/50 p-2 font-mono text-xs">
                  {prettyJson(
                    targets.find((t) => t.id === expandedInput)?.input ?? "",
                  )}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Dialogs */}
      <RuleDialog
        open={isRuleDialogOpen}
        onOpenChange={setIsRuleDialogOpen}
        rule={editingRule}
        busName={busName}
        onSaved={(name) => setSelectedRuleName(name)}
      />

      {activeRule && (
        <AddTargetDialog
          open={isAddTargetOpen}
          onOpenChange={setIsAddTargetOpen}
          rule={activeRule.name}
          busName={busName}
        />
      )}

      <PutEventsDialog
        open={isPublishOpen}
        onOpenChange={setIsPublishOpen}
        busName={busName}
      />

      <DeleteConfirmDialog
        open={Boolean(ruleToDelete)}
        onOpenChange={(open) => !open && setRuleToDelete(null)}
        title="Delete rule"
        description={`Are you sure you want to delete rule “${ruleToDelete?.name ?? ""}”? Its targets will be removed too.`}
        confirmLabel="Delete"
        isPending={isDeletingRule}
        onConfirm={handleDeleteRule}
      />

      <DeleteConfirmDialog
        open={isDeleteBusOpen}
        onOpenChange={setIsDeleteBusOpen}
        title="Delete event bus"
        description={`Are you sure you want to delete event bus “${busName}”? All rules on it will be deleted.`}
        confirmLabel="Delete"
        isPending={isDeletingBus}
        onConfirm={handleDeleteBus}
      />

      <DeleteConfirmDialog
        open={Boolean(targetToRemove)}
        onOpenChange={(open) => !open && setTargetToRemove(null)}
        title="Remove target"
        description={`Remove target “${targetToRemove?.id ?? ""}” from this rule?`}
        confirmLabel="Remove"
        isPending={isRemovingTarget}
        onConfirm={handleRemoveTarget}
      />
    </div>
  );
}
