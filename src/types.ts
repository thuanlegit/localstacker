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

export type TabKind = "service" | "bucket";

export interface TabDescriptor {
  /** Stable tab identity, e.g. "service:s3" or "bucket:my-bucket". */
  id: string;
  kind: TabKind;
  service?: ServiceKind;
  bucketName?: string;
  title: string;
}
