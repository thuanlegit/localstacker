import { HardDrive, ListOrdered, KeyRound, Zap, Database, Radio, type LucideIcon } from "lucide-react";
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
};
