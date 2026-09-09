import { HardDrive, ListOrdered, KeyRound, Zap, type LucideIcon } from "lucide-react";
import type { ServiceKind } from "@/types";

export interface ServiceMeta {
  kind: ServiceKind;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  blurb: string;
  milestone: string;
  planned: string[];
}

export const SERVICES: readonly ServiceMeta[] = [
  {
    kind: "s3",
    label: "S3",
    shortLabel: "S3",
    icon: HardDrive,
    blurb: "Buckets & objects",
    milestone: "M1",
    planned: [
      "Folder-style object browsing with previews",
      "Drag & drop upload, download, delete",
      "Create/delete buckets, copy presigned URLs",
    ],
  },
  {
    kind: "sqs",
    label: "SQS",
    shortLabel: "SQS",
    icon: ListOrdered,
    blurb: "Queues",
    milestone: "M2",
    planned: [
      "Queue list with depth & DLQ badges",
      "Peek without consuming, send with JSON editor",
      "Purge, delete message, DLQ redrive",
    ],
  },
  {
    kind: "secrets",
    label: "Secrets Manager",
    shortLabel: "Secrets",
    icon: KeyRound,
    blurb: "Secrets",
    milestone: "M3",
    planned: [
      "Secret list, value reveal, versions",
      "Create / update / delete secrets",
      "Requires a LocalStack auth token (Hobby+)",
    ],
  },
  {
    kind: "lambda",
    label: "Lambda",
    shortLabel: "Lambda",
    icon: Zap,
    blurb: "Functions",
    milestone: "M3",
    planned: [
      "Function list & configuration",
      "Invoke with test payload — response, duration, logs",
      "Edit environment variables",
    ],
  },
] as const;

export const serviceMeta = (kind: ServiceKind): ServiceMeta => {
  const meta = SERVICES.find((s) => s.kind === kind);
  if (!meta) throw new Error(`Unknown service: ${kind}`);
  return meta;
};
