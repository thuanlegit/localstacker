import {
  type APIGatewayClient,
  type GetRestApisCommandOutput,
  type GetResourcesCommandOutput,
  GetRestApisCommand,
  CreateRestApiCommand,
  DeleteRestApiCommand,
  GetResourcesCommand,
  CreateResourceCommand,
  DeleteResourceCommand,
  GetMethodCommand,
  PutMethodCommand,
  PutIntegrationCommand,
  PutMethodResponseCommand,
  PutIntegrationResponseCommand,
  DeleteMethodCommand,
  GetStagesCommand,
  CreateDeploymentCommand,
  DeleteStageCommand,
  TestInvokeMethodCommand,
} from "@aws-sdk/client-api-gateway";

export interface RestApiSummary {
  id: string;
  name: string;
  description?: string;
  createdDate?: string;
}

export interface RestApiResource {
  id: string;
  parentId?: string;
  path: string;
  pathPart?: string;
  methods: string[];
}

export interface MethodDetail {
  httpMethod: string;
  authorizationType?: string;
  apiKeyRequired?: boolean;
  integrationType?: string;
  integrationUri?: string;
}

export interface StageSummary {
  stageName: string;
  deploymentId?: string;
  createdDate?: string;
}

export type MethodIntegration =
  | { type: "MOCK"; responseTemplate: string }
  | { type: "AWS_PROXY"; functionArn: string }
  | { type: "HTTP_PROXY"; uri: string };

export function buildLambdaIntegrationUri(
  region: string,
  functionArn: string,
): string {
  return `arn:aws:apigateway:${region}:lambda:path/2015-03-31/functions/${functionArn}/invocations`;
}

export function invokeUrl(
  endpoint: string,
  restApiId: string,
  stageName: string,
  resourcePath: string,
): string {
  const cleanEndpoint = endpoint.replace(/\/+$/, "");
  const cleanPath = resourcePath.startsWith("/")
    ? resourcePath
    : `/${resourcePath}`;
  return `${cleanEndpoint}/restapis/${restApiId}/${stageName}/_user_request_${cleanPath}`;
}

export async function listRestApis(
  client: APIGatewayClient,
): Promise<RestApiSummary[]> {
  let position: string | undefined = undefined;
  const apis: RestApiSummary[] = [];

  do {
    const res: GetRestApisCommandOutput = await client.send(
      new GetRestApisCommand({ position }),
    );
    for (const item of res.items ?? []) {
      if (item.id && item.name) {
        apis.push({
          id: item.id,
          name: item.name,
          description: item.description,
          createdDate: item.createdDate
            ? item.createdDate.toISOString()
            : undefined,
        });
      }
    }
    position = res.position;
  } while (position);

  return apis.sort((a, b) => a.name.localeCompare(b.name));
}

export async function createRestApi(
  client: APIGatewayClient,
  name: string,
): Promise<RestApiSummary> {
  const res = await client.send(new CreateRestApiCommand({ name }));
  if (!res.id) {
    throw new Error("CreateRestApi returned no id");
  }
  return {
    id: res.id,
    name: res.name ?? name,
    description: res.description,
    createdDate: res.createdDate ? res.createdDate.toISOString() : undefined,
  };
}

export async function deleteRestApi(
  client: APIGatewayClient,
  restApiId: string,
): Promise<void> {
  await client.send(new DeleteRestApiCommand({ restApiId }));
}

export async function listResources(
  client: APIGatewayClient,
  restApiId: string,
): Promise<RestApiResource[]> {
  let position: string | undefined = undefined;
  const resources: RestApiResource[] = [];

  do {
    const res: GetResourcesCommandOutput = await client.send(
      new GetResourcesCommand({
        restApiId,
        embed: ["methods"],
        position,
      }),
    );
    for (const item of res.items ?? []) {
      if (item.id && item.path) {
        resources.push({
          id: item.id,
          parentId: item.parentId,
          path: item.path,
          pathPart: item.pathPart,
          methods: Object.keys(item.resourceMethods ?? {}).sort(),
        });
      }
    }
    position = res.position;
  } while (position);

  return resources.sort((a, b) => a.path.localeCompare(b.path));
}

export async function createResource(
  client: APIGatewayClient,
  { restApiId, pathPart }: { restApiId: string; pathPart: string },
): Promise<RestApiResource> {
  const resources = await listResources(client, restApiId);
  const root = resources.find((r) => r.path === "/");
  if (!root) {
    throw new Error("Root resource not found for API");
  }
  const res = await client.send(
    new CreateResourceCommand({
      restApiId,
      parentId: root.id,
      pathPart,
    }),
  );
  return {
    id: res.id!,
    parentId: res.parentId,
    path: res.path ?? `/${pathPart}`,
    pathPart: res.pathPart ?? pathPart,
    methods: Object.keys(res.resourceMethods ?? {}).sort(),
  };
}

export async function deleteResource(
  client: APIGatewayClient,
  { restApiId, resourceId }: { restApiId: string; resourceId: string },
): Promise<void> {
  await client.send(new DeleteResourceCommand({ restApiId, resourceId }));
}

export async function getMethod(
  client: APIGatewayClient,
  {
    restApiId,
    resourceId,
    httpMethod,
  }: { restApiId: string; resourceId: string; httpMethod: string },
): Promise<MethodDetail> {
  const res = await client.send(
    new GetMethodCommand({
      restApiId,
      resourceId,
      httpMethod,
    }),
  );
  return {
    httpMethod: res.httpMethod ?? httpMethod,
    authorizationType: res.authorizationType,
    apiKeyRequired: res.apiKeyRequired,
    integrationType: res.methodIntegration?.type,
    integrationUri: res.methodIntegration?.uri,
  };
}

export async function putMethod(
  client: APIGatewayClient,
  {
    restApiId,
    resourceId,
    httpMethod,
    integration,
    region,
  }: {
    restApiId: string;
    resourceId: string;
    httpMethod: string;
    integration: MethodIntegration;
    region: string;
  },
): Promise<void> {
  await client.send(
    new PutMethodCommand({
      restApiId,
      resourceId,
      httpMethod,
      authorizationType: "NONE",
      apiKeyRequired: false,
    }),
  );

  if (integration.type === "MOCK") {
    await client.send(
      new PutIntegrationCommand({
        restApiId,
        resourceId,
        httpMethod,
        type: "MOCK",
        requestTemplates: { "application/json": '{"statusCode": 200}' },
      }),
    );
    await client.send(
      new PutMethodResponseCommand({
        restApiId,
        resourceId,
        httpMethod,
        statusCode: "200",
      }),
    );
    await client.send(
      new PutIntegrationResponseCommand({
        restApiId,
        resourceId,
        httpMethod,
        statusCode: "200",
        responseTemplates: {
          "application/json": integration.responseTemplate,
        },
      }),
    );
  } else if (integration.type === "AWS_PROXY") {
    await client.send(
      new PutIntegrationCommand({
        restApiId,
        resourceId,
        httpMethod,
        type: "AWS_PROXY",
        integrationHttpMethod: "POST",
        uri: buildLambdaIntegrationUri(region, integration.functionArn),
      }),
    );
  } else if (integration.type === "HTTP_PROXY") {
    await client.send(
      new PutIntegrationCommand({
        restApiId,
        resourceId,
        httpMethod,
        type: "HTTP_PROXY",
        integrationHttpMethod: httpMethod,
        uri: integration.uri,
      }),
    );
  }
}

export async function deleteMethod(
  client: APIGatewayClient,
  {
    restApiId,
    resourceId,
    httpMethod,
  }: { restApiId: string; resourceId: string; httpMethod: string },
): Promise<void> {
  await client.send(
    new DeleteMethodCommand({
      restApiId,
      resourceId,
      httpMethod,
    }),
  );
}

export async function listStages(
  client: APIGatewayClient,
  restApiId: string,
): Promise<StageSummary[]> {
  const res = await client.send(new GetStagesCommand({ restApiId }));
  const stages: StageSummary[] = (res.item ?? [])
    .filter((s) => s.stageName)
    .map((s) => ({
      stageName: s.stageName!,
      deploymentId: s.deploymentId,
      createdDate: s.createdDate ? s.createdDate.toISOString() : undefined,
    }));
  return stages.sort((a, b) => a.stageName.localeCompare(b.stageName));
}

export async function deployApi(
  client: APIGatewayClient,
  { restApiId, stageName }: { restApiId: string; stageName: string },
): Promise<StageSummary> {
  const res = await client.send(
    new CreateDeploymentCommand({ restApiId, stageName }),
  );
  if (!res.id) {
    throw new Error("CreateDeployment returned no deployment id");
  }
  return {
    stageName,
    deploymentId: res.id,
    createdDate: res.createdDate ? res.createdDate.toISOString() : undefined,
  };
}

export async function deleteStage(
  client: APIGatewayClient,
  { restApiId, stageName }: { restApiId: string; stageName: string },
): Promise<void> {
  await client.send(new DeleteStageCommand({ restApiId, stageName }));
}

export async function testInvokeMethod(
  client: APIGatewayClient,
  {
    restApiId,
    resourceId,
    httpMethod,
    path,
    queryString,
    headers,
    body,
  }: {
    restApiId: string;
    resourceId: string;
    httpMethod: string;
    path: string;
    queryString?: string;
    headers?: Record<string, string>;
    body?: string;
  },
): Promise<{
  status?: number;
  headers?: Record<string, string>;
  body?: string;
  log?: string;
  latency?: number;
}> {
  const pathWithQueryString = queryString ? `${path}?${queryString}` : path;
  const res = await client.send(
    new TestInvokeMethodCommand({
      restApiId,
      resourceId,
      httpMethod,
      pathWithQueryString,
      headers,
      body,
    }),
  );
  return {
    status: res.status,
    headers: res.headers,
    body: res.body,
    log: res.log,
    latency: res.latency,
  };
}
