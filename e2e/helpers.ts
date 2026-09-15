import { setTimeout as delay } from "node:timers/promises";
import { S3Client } from "@aws-sdk/client-s3";
import { SQSClient } from "@aws-sdk/client-sqs";
import { SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { LambdaClient } from "@aws-sdk/client-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { SNSClient } from "@aws-sdk/client-sns";
import { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";
import { SSMClient } from "@aws-sdk/client-ssm";
import { EventBridgeClient } from "@aws-sdk/client-eventbridge";
import { SchedulerClient } from "@aws-sdk/client-scheduler";
import { APIGatewayClient } from "@aws-sdk/client-api-gateway";
import { SESClient } from "@aws-sdk/client-ses";
import { IAMClient } from "@aws-sdk/client-iam";
import { Route53Client } from "@aws-sdk/client-route-53";
import { EC2Client } from "@aws-sdk/client-ec2";
import { SFNClient } from "@aws-sdk/client-sfn";
import { KinesisClient } from "@aws-sdk/client-kinesis";
import { DynamoDBStreamsClient } from "@aws-sdk/client-dynamodb-streams";
import { CloudWatchClient } from "@aws-sdk/client-cloudwatch";
import { KMSClient } from "@aws-sdk/client-kms";
import { ACMClient } from "@aws-sdk/client-acm";
import { STSClient } from "@aws-sdk/client-sts";
import { FetchHttpHandler } from "@smithy/fetch-http-handler";
export const ENDPOINT = process.env.LOCALSTACK_ENDPOINT || "http://127.0.0.1:4566";

export async function requireLocalStack(): Promise<void> {
  const timeoutMs = 30_000;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${ENDPOINT}/_localstack/health`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        return;
      }
    } catch {
      // Retry after delay
    }
    await delay(1000);
  }

  throw new Error(
    `LocalStack not reachable at ${ENDPOINT} — start it: docker run --rm -p 4566:4566 localstack/localstack:4.14.0`
  );
}

export function makeClients() {
  const config = {
    endpoint: ENDPOINT,
    region: "us-east-1",
    credentials: {
      accessKeyId: "test",
      secretAccessKey: "test",
    },
  };

  const dynamodb = new DynamoDBClient(config);

  return {
    s3: new S3Client(config),
    sqs: new SQSClient(config),
    secrets: new SecretsManagerClient(config),
    lambda: new LambdaClient(config),
    dynamodb,
    dynamoDoc: DynamoDBDocumentClient.from(dynamodb),
    sns: new SNSClient(config),
    logs: new CloudWatchLogsClient(config),
    ssm: new SSMClient(config),
    eventbridge: new EventBridgeClient(config),
    scheduler: new SchedulerClient(config),
    apigateway: new APIGatewayClient(config),
    ses: new SESClient(config),
    iam: new IAMClient(config),
    route53: new Route53Client(config),
    ec2: new EC2Client(config),
    sfn: new SFNClient(config),
    kinesis: new KinesisClient({
      ...config,
      requestHandler: new FetchHttpHandler(),
    }),
    dynamodbStreams: new DynamoDBStreamsClient(config),
    cloudwatch: new CloudWatchClient(config),
    sts: new STSClient(config),
    kms: new KMSClient(config),
    acm: new ACMClient(config),
  };
}

let seq = 0;
export function unique(prefix: string): string {
  seq += 1;
  return `${prefix}-e2e-${Date.now().toString(36)}${seq.toString(36)}`;
}
