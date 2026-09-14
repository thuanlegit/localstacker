import { HardDrive, ListOrdered, KeyRound, Zap, Database, Radio, ScrollText, ListTree, Webhook, CalendarClock, Network, Mail, ShieldCheck, Globe, Server, Workflow, type LucideIcon } from "lucide-react";
import type { ServiceKind } from "@/types";
import type { HealthInfo } from "@/lib/health";

export interface ServiceMeta {
  kind: ServiceKind;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  blurb: string;
}

export const SERVICES: readonly ServiceMeta[] = [
  {
    kind: "s3",
    label: "S3",
    shortLabel: "S3",
    icon: HardDrive,
    blurb: "Buckets & objects",
  },
  {
    kind: "sqs",
    label: "SQS",
    shortLabel: "SQS",
    icon: ListOrdered,
    blurb: "Queues",
  },
  {
    kind: "secrets",
    label: "Secrets Manager",
    shortLabel: "Secrets",
    icon: KeyRound,
    blurb: "Secrets",
  },
  {
    kind: "lambda",
    label: "Lambda",
    shortLabel: "Lambda",
    icon: Zap,
    blurb: "Functions",
  },
  {
    kind: "dynamodb",
    label: "DynamoDB",
    shortLabel: "DynamoDB",
    icon: Database,
    blurb: "Tables & items",
  },
  {
    kind: "sns",
    label: "SNS",
    shortLabel: "SNS",
    icon: Radio,
    blurb: "Topics & subscriptions",
  },
  {
    kind: "logs",
    label: "CloudWatch Logs",
    shortLabel: "Logs",
    icon: ScrollText,
    blurb: "Log groups & streams",
  },
  {
    kind: "ssm",
    label: "Parameter Store",
    shortLabel: "SSM",
    icon: ListTree,
    blurb: "Parameters",
  },
  {
    kind: "eventbridge",
    label: "EventBridge",
    shortLabel: "EventBridge",
    icon: Webhook,
    blurb: "Event buses & rules",
  },
  {
    kind: "scheduler",
    label: "EventBridge Scheduler",
    shortLabel: "Scheduler",
    icon: CalendarClock,
    blurb: "Schedules",
  },
  {
    kind: "apigateway",
    label: "API Gateway",
    shortLabel: "API Gateway",
    icon: Network,
    blurb: "REST APIs & stages",
  },
  {
    kind: "ses",
    label: "SES",
    shortLabel: "SES",
    icon: Mail,
    blurb: "Email identities & mailbox",
  },
  {
    kind: "iam",
    label: "IAM",
    shortLabel: "IAM",
    icon: ShieldCheck,
    blurb: "Roles, users & policies",
  },
  {
    kind: "route53",
    label: "Route 53",
    shortLabel: "Route 53",
    icon: Globe,
    blurb: "Hosted zones & DNS records",
  },
  {
    kind: "ec2",
    label: "EC2",
    shortLabel: "EC2",
    icon: Server,
    blurb: "Instances, key pairs & security groups",
  },
  {
    kind: "sfn",
    label: "Step Functions",
    shortLabel: "SFN",
    icon: Workflow,
    blurb: "State machines & executions",
  },
] as const;

export const serviceMeta = (kind: ServiceKind): ServiceMeta => {
  const meta = SERVICES.find((s) => s.kind === kind);
  if (!meta) throw new Error(`Unknown service: ${kind}`);
  return meta;
};

export const LOCALSTACK_SERVICE_NAMES: Record<ServiceKind, string> = {
  s3: "s3",
  sqs: "sqs",
  secrets: "secretsmanager",
  lambda: "lambda",
  dynamodb: "dynamodb",
  sns: "sns",
  logs: "logs",
  ssm: "ssm",
  eventbridge: "events",
  scheduler: "scheduler",
  apigateway: "apigateway",
  ses: "ses",
  iam: "iam",
  route53: "route53",
  ec2: "ec2",
  sfn: "stepfunctions",
};

export type LampStatus = "running" | "available" | "disabled" | "off";

export function lampStatus(health: HealthInfo | undefined, kind: ServiceKind): LampStatus {
  if (!health || health.status !== "up") return "off";
  const found = health.services.find((s) => s.name === LOCALSTACK_SERVICE_NAMES[kind]);
  if (!found) return "available"; // unregistered lazy service
  const st = found.status.toLowerCase();
  if (st === "disabled") return "disabled";
  if (st === "running") return "running";
  return "available"; // available / unknown
}

export const LAMP_CLASS: Record<LampStatus, string> = {
  running: "bg-emerald-500 shadow-[0_0_8px] shadow-emerald-500/60",
  available: "bg-muted-foreground/30",
  disabled: "border border-muted-foreground/40 bg-transparent",
  off: "bg-muted-foreground/15",
};
