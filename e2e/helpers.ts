import { setTimeout as delay } from "node:timers/promises";
import { S3Client } from "@aws-sdk/client-s3";
import { SQSClient } from "@aws-sdk/client-sqs";
import { SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { LambdaClient } from "@aws-sdk/client-lambda";

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

  return {
    s3: new S3Client(config),
    sqs: new SQSClient(config),
    secrets: new SecretsManagerClient(config),
    lambda: new LambdaClient(config),
  };
}

let seq = 0;
export function unique(prefix: string): string {
  seq += 1;
  return `${prefix}-e2e-${Date.now().toString(36)}${seq.toString(36)}`;
}
