import { FetchHttpHandler } from "@smithy/fetch-http-handler";
import { platformFetch } from "./fetch";
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
import { CloudWatchClient } from "@aws-sdk/client-cloudwatch";
import { STSClient } from "@aws-sdk/client-sts";
import { EC2Client } from "@aws-sdk/client-ec2";
import { SFNClient } from "@aws-sdk/client-sfn";
import { KinesisClient } from "@aws-sdk/client-kinesis";
import { DynamoDBStreamsClient } from "@aws-sdk/client-dynamodb-streams";
import { KMSClient } from "@aws-sdk/client-kms";
import { ACMClient } from "@aws-sdk/client-acm";
import { CloudFormationClient } from "@aws-sdk/client-cloudformation";
import { Route53ResolverClient } from "@aws-sdk/client-route53resolver";
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
  dynamodb: DynamoDBClient;
  dynamodbDoc: DynamoDBDocumentClient;
  sns: SNSClient;
  logs: CloudWatchLogsClient;
  ssm: SSMClient;
  eventbridge: EventBridgeClient;
  scheduler: SchedulerClient;
  apigateway: APIGatewayClient;
  ses: SESClient;
  iam: IAMClient;
  route53: Route53Client;
  ec2: EC2Client;
  sfn: SFNClient;
  kinesis: KinesisClient;
  dynamodbStreams: DynamoDBStreamsClient;
  cloudwatch: CloudWatchClient;
  sts: STSClient;
  kms: KMSClient;
  acm: ACMClient;
  cloudformation: CloudFormationClient;
  route53resolver: Route53ResolverClient;
}


export function makeClients(profile: ConnectionProfile): ServiceClients {
  const config = baseClientConfig(profile);
  const dynamodb = new DynamoDBClient(config);
  return {
    s3: new S3Client({ ...config, forcePathStyle: true }),
    sqs: new SQSClient(config),
    secrets: new SecretsManagerClient(config),
    lambda: new LambdaClient(config),
    dynamodb,
    dynamodbDoc: DynamoDBDocumentClient.from(dynamodb),
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
      requestHandler: new FetchHttpHandler({
        customFetch: profile.authToken
          ? withAuthHeader(profile.authToken)
          : platformFetch,
      }),
    }),
    dynamodbStreams: new DynamoDBStreamsClient(config),
    cloudwatch: new CloudWatchClient(config),
    sts: new STSClient(config),
    kms: new KMSClient(config),
    acm: new ACMClient(config),
    cloudformation: new CloudFormationClient(config),
    route53resolver: new Route53ResolverClient(config),
  };
}
