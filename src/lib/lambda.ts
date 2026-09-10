import {
  CreateFunctionCommand,
  DeleteFunctionCommand,
  GetFunctionConfigurationCommand,
  InvokeCommand,
  ListFunctionsCommand,
  UpdateFunctionConfigurationCommand,
  type LambdaClient,
} from "@aws-sdk/client-lambda";
import { zipSync, strToU8 } from "fflate";

export interface LambdaFunctionSummary {
  name: string;
  runtime?: string;
  handler?: string;
  description?: string;
  codeSize?: number;
  lastModified?: Date;
}

export interface LambdaFunctionConfig {
  name: string;
  runtime?: string;
  handler?: string;
  description?: string;
  role?: string;
  timeoutSeconds: number;
  memorySize: number;
  envVars: Record<string, string>;
  lastModified?: Date;
  state?: string;
}

export interface InvocationResult {
  statusCode?: number;
  executedVersion?: string;
  functionError?: string;
  payload: string;
  logs?: string;
  durationMs: number;
  requestId?: string;
}

function decodeBase64(s: string): string {
  if (typeof atob === "function") {
    return atob(s);
  }
  const buf = (
    globalThis as unknown as {
      Buffer?: {
        from: (
          str: string,
          enc: string,
        ) => { toString: (enc: string) => string };
      };
    }
  ).Buffer;
  if (buf) {
    return buf.from(s, "base64").toString("utf-8");
  }
  return s;
}

export async function listFunctions(
  client: LambdaClient,
): Promise<LambdaFunctionSummary[]> {
  const fns: LambdaFunctionSummary[] = [];
  let marker: string | undefined;

  do {
    const res = await client.send(
      new ListFunctionsCommand({
        Marker: marker,
      }),
    );

    if (res.Functions) {
      for (const f of res.Functions) {
        fns.push({
          name: f.FunctionName ?? "",
          runtime: f.Runtime,
          handler: f.Handler,
          description: f.Description,
          codeSize: f.CodeSize,
          lastModified: f.LastModified ? new Date(f.LastModified) : undefined,
        });
      }
    }

    marker = res.NextMarker;
  } while (marker);

  return fns;
}

export async function getFunctionConfig(
  client: LambdaClient,
  functionName: string,
): Promise<LambdaFunctionConfig> {
  const res = await client.send(
    new GetFunctionConfigurationCommand({
      FunctionName: functionName,
    }),
  );

  return {
    name: res.FunctionName ?? functionName,
    runtime: res.Runtime,
    handler: res.Handler,
    description: res.Description,
    role: res.Role,
    timeoutSeconds: res.Timeout ?? 3,
    memorySize: res.MemorySize ?? 128,
    envVars: res.Environment?.Variables ?? {},
    lastModified: res.LastModified ? new Date(res.LastModified) : undefined,
    state: res.State,
  };
}

export async function invokeFunction(
  client: LambdaClient,
  params: {
    functionName: string;
    payload?: string;
  },
): Promise<InvocationResult> {
  const start = performance.now();
  const res = await client.send(
    new InvokeCommand({
      FunctionName: params.functionName,
      InvocationType: "RequestResponse",
      LogType: "Tail",
      Payload:
        params.payload !== undefined
          ? new TextEncoder().encode(params.payload)
          : undefined,
    }),
  );
  const durationMs = Math.round(performance.now() - start);

  const payload = new TextDecoder().decode(res.Payload ?? new Uint8Array());
  const logs = res.LogResult ? decodeBase64(res.LogResult) : undefined;
  const metadata = res.$metadata as
    | { requestId?: string; httpHeaders?: Record<string, string> }
    | undefined;
  const requestId =
    metadata?.httpHeaders?.["x-amzn-requestid"] ?? metadata?.requestId;

  return {
    statusCode: res.StatusCode,
    executedVersion: res.ExecutedVersion,
    functionError: res.FunctionError,
    payload,
    logs,
    durationMs,
    requestId,
  };
}

export async function updateFunctionEnvVars(
  client: LambdaClient,
  params: {
    functionName: string;
    envVars: Record<string, string>;
  },
): Promise<void> {
  await client.send(
    new UpdateFunctionConfigurationCommand({
      FunctionName: params.functionName,
      Environment: {
        Variables: params.envVars,
      },
    }),
  );
}

export async function createDemoFunction(
  client: LambdaClient,
  name = "demo-hello",
): Promise<string> {
  const codeZip = zipSync({
    "index.js": strToU8(
      "exports.handler = async (event) => {\n" +
        "  console.log('Demo lambda invoked with event:', JSON.stringify(event));\n" +
        "  return {\n" +
        "    statusCode: 200,\n" +
        "    body: JSON.stringify({\n" +
        "      message: 'Hello from LocalStack Lambda!',\n" +
        "      timestamp: new Date().toISOString(),\n" +
        "      event,\n" +
        "    }),\n" +
        "  };\n" +
        "};",
    ),
  });

  await client.send(
    new CreateFunctionCommand({
      FunctionName: name,
      Runtime: "nodejs22.x",
      Handler: "index.handler",
      Role: "arn:aws:iam::000000000000:role/lambda-demo-role",
      Description: "Demo function created from Localstacker",
      Code: {
        ZipFile: codeZip,
      },
    }),
  );

  return name;
}

export async function deleteFunction(
  client: LambdaClient,
  name: string,
): Promise<void> {
  await client.send(new DeleteFunctionCommand({ FunctionName: name }));
}
