export type ServiceKind = "s3" | "sqs" | "secrets" | "lambda";

export interface ConnectionProfile {
  id: string;
  name: string;
  endpoint: string;
  region: string;
  /** LocalStack auth token (Hobby+ tiers). Required for Secrets Manager. */
  authToken?: string;
  builtIn?: boolean;
}

export type NewProfile = Omit<ConnectionProfile, "id" | "builtIn"> & {
  authToken?: string;
};

export type TabKind = "service" | "bucket" | "queue" | "secret" | "function";

export interface TabDescriptor {
  /** Stable tab identity, e.g. "service:s3" or "bucket:my-bucket" or "queue:my-queue" or "secret:my-secret" or "function:my-function". */
  id: string;
  kind: TabKind;
  service?: ServiceKind;
  bucketName?: string;
  queueName?: string;
  secretName?: string;
  functionName?: string;
  title: string;
}
