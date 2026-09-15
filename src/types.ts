export type ServiceKind =
  | "s3"
  | "sqs"
  | "secrets"
  | "lambda"
  | "dynamodb"
  | "sns"
  | "logs"
  | "ssm"
  | "eventbridge"
  | "scheduler"
  | "apigateway"
  | "ses"
  | "iam"
  | "route53"
  | "ec2"
  | "sfn"
 | "kinesis"
 | "cloudwatch"
 | "kms"
 | "acm";


export type PaletteId =
  | "github"
  | "dracula"
  | "one-dark"
  | "claude"
  | "nord"
  | "catppuccin"
  | "gruvbox"
  | "tokyo-night"
  | "solarized"
  | "rose-pine";

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

export type TabKind =
  | "settings"
  | "docker"
  | "service"
  | "bucket"
  | "queue"
  | "secret"
  | "function"
  | "table"
  | "topic"
  | "logGroup"
  | "parameter"
  | "eventBus"
  | "scheduleGroup"
  | "restApi"
  | "sesIdentity"
  | "sesMailbox"
  | "iamUser"
  | "iamRole"
  | "hostedZone"
  | "securityGroup"
  | "stateMachine"
  | "stream"
  | "kmsKey";
export interface TabDescriptor {
  /** Stable tab identity, e.g. "service:s3" or "bucket:my-bucket" or "queue:my-queue" or "secret:my-secret" or "function:my-function". */
  id: string;
  kind: TabKind;
  service?: ServiceKind;
  bucketName?: string;
  queueName?: string;
  secretName?: string;
  functionName?: string;
  tableName?: string;
  topicArn?: string;
  logGroupName?: string;
  parameterName?: string;
  busName?: string;
  groupName?: string;
  restApiId?: string;
  identityName?: string;
  roleName?: string;
  zoneId?: string;
  securityGroupId?: string;
  stateMachineArn?: string;
  streamName?: string;
  keyId?: string;
  userName?: string;
  title: string;
}
