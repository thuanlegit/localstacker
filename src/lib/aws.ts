import { FetchHttpHandler } from "@smithy/fetch-http-handler";
import { platformFetch } from "./fetch";
import { S3Client } from "@aws-sdk/client-s3";
import { SQSClient } from "@aws-sdk/client-sqs";
import { SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { LambdaClient } from "@aws-sdk/client-lambda";
import type { ConnectionProfile } from "@/types";

/** LocalStack ignores SigV4 identity, but SDKs require credentials to sign. */
export const DUMMY_CREDENTIALS = {
  accessKeyId: "test",
  secretAccessKey: "test",
};
export function withAuthHeader(
  token: string,
  fetchFn: typeof platformFetch = platformFetch,
) {
  return (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const headers = new Headers(init?.headers);
    headers.set("authorization", token);
    return fetchFn(input, { ...init, headers });
  };
}

export function baseClientConfig(profile: ConnectionProfile) {
  return {
    region: profile.region,
    endpoint: profile.endpoint.replace(/\/+$/, ""),
    credentials: DUMMY_CREDENTIALS,
    requestHandler: new FetchHttpHandler({
      customFetch: profile.authToken
        ? withAuthHeader(profile.authToken)
        : platformFetch,
    }),
  };
}

export interface ServiceClients {
  s3: S3Client;
  sqs: SQSClient;
  secrets: SecretsManagerClient;
  lambda: LambdaClient;
}

export function makeClients(profile: ConnectionProfile): ServiceClients {
  const config = baseClientConfig(profile);
  return {
    s3: new S3Client({ ...config, forcePathStyle: true }),
    sqs: new SQSClient(config),
    secrets: new SecretsManagerClient(config),
    lambda: new LambdaClient(config),
  };
}
