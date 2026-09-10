import { useEffect, useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useActiveProfile } from "@/store/profiles";
import { useQueues } from "@/hooks/use-sqs";
import { useFunctions } from "@/hooks/use-lambda";
import { useTopics } from "@/hooks/use-sns";

export type TargetType = "sqs" | "lambda" | "sns" | "custom";

interface TargetPickerProps {
  /** Currently selected target ARN, or null when unset. */
  arn: string | null;
  onArnChange: (arn: string | null) => void;
}

const TARGET_TYPES: Array<{ value: TargetType; label: string }> = [
  { value: "sqs", label: "SQS queue" },
  { value: "lambda", label: "Lambda function" },
  { value: "sns", label: "SNS topic" },
  { value: "custom", label: "Custom ARN" },
];

/**
 * Target-type + resource picker shared by the EventBridge add-target dialog and
 * the Scheduler create-schedule dialog. SQS/SNS ARNs come from their summaries;
 * Lambda ARNs are constructed from the active region (LocalStack account).
 */
export function TargetPicker({ arn, onArnChange }: TargetPickerProps) {
  const profile = useActiveProfile();
  const [type, setType] = useState<TargetType>("sqs");
  const [resourceName, setResourceName] = useState<string | null>(null);
  const [customArn, setCustomArn] = useState("");

  const { data: queues } = useQueues(profile.id);
  const { data: functions } = useFunctions(profile.id);
  const { data: topics } = useTopics(profile.id);

  const resources = useMemo(() => {
    if (type === "sqs") {
      return (queues ?? []).map((q) => ({
        name: q.name,
        arn: q.attributes.arn,
      }));
    }
    if (type === "lambda") {
      return (functions ?? []).map((f) => ({
        name: f.name,
        arn: `arn:aws:lambda:${profile.region}:000000000000:function:${f.name}`,
      }));
    }
    if (type === "sns") {
      return (topics ?? []).map((t) => ({ name: t.name, arn: t.arn }));
    }
    return [];
  }, [type, queues, functions, topics, profile.region]);

  // Reset the resource selection whenever the target type changes.
  useEffect(() => {
    setResourceName(null);
  }, [type]);

  useEffect(() => {
    if (type === "custom") {
      onArnChange(/^arn:./.test(customArn) ? customArn : null);
      return;
    }
    const found = resources.find((r) => r.name === resourceName);
    onArnChange(found ? found.arn : null);
  }, [type, customArn, resourceName, resources, onArnChange]);

  const customError =
    type === "custom" && customArn.length > 0 && !/^arn:./.test(customArn);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="target-type">Target type</Label>
        <Select
          value={type}
          onValueChange={(v) => setType(v as TargetType)}
        >
          <SelectTrigger id="target-type" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TARGET_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {type === "custom" ? (
        <div className="space-y-2">
          <Label htmlFor="target-arn">Target ARN</Label>
          <Input
            id="target-arn"
            value={customArn}
            onChange={(e) => setCustomArn(e.target.value)}
            placeholder="arn:aws:sqs:us-east-1:000000000000:my-queue"
            className="font-mono text-xs"
            autoFocus
          />
          {customError ? (
            <p className="text-xs text-destructive">
              Must be an ARN starting with “arn:”
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Any valid ARN (queue, topic, function, state machine, …).
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="target-resource">
            {type === "sqs"
              ? "Queue"
              : type === "lambda"
                ? "Function"
                : "Topic"}
          </Label>
          <Select
            value={resourceName ?? undefined}
            onValueChange={(v) => setResourceName(v)}
          >
            <SelectTrigger id="target-resource" className="w-full">
              <SelectValue placeholder={`Select a ${
                type === "sqs" ? "queue" : type === "lambda" ? "function" : "topic"
              }`} />
            </SelectTrigger>
            <SelectContent>
              {resources.length === 0 ? (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                  No{" "}
                  {type === "sqs"
                    ? "queues"
                    : type === "lambda"
                      ? "functions"
                      : "topics"}{" "}
                  found
                </div>
              ) : (
                resources.map((r) => (
                  <SelectItem key={r.arn} value={r.name}>
                    {r.name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          {arn ? (
            <p
              className="truncate font-mono text-xs text-muted-foreground"
              title={arn}
            >
              {arn}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
