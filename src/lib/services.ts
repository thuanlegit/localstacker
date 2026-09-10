import { HardDrive, ListOrdered, KeyRound, Zap, Database, Radio, ScrollText, ListTree, Webhook, CalendarClock, Network, Mail, type LucideIcon } from "lucide-react";
import type { ServiceKind } from "@/types";

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
};
