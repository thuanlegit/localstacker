import {
  type SSMClient,
  DescribeParametersCommand,
  GetParameterCommand,
  PutParameterCommand,
  DeleteParameterCommand,
  type DescribeParametersCommandOutput,
} from "@aws-sdk/client-ssm";

export type ParameterType = "String" | "StringList" | "SecureString";

export interface ParameterSummary {
  name: string;
  type: ParameterType;
  version: number;
  lastModified?: Date;
}

export interface ParameterDetail {
  name: string;
  type: ParameterType;
  value: string;
  version: number;
  lastModified?: Date;
  arn?: string;
}

export async function describeParameters(
  client: SSMClient,
): Promise<ParameterSummary[]> {
  const summaries: ParameterSummary[] = [];
  let nextToken: string | undefined = undefined;

  do {
    const res: DescribeParametersCommandOutput = await client.send(
      new DescribeParametersCommand({
        NextToken: nextToken,
      }),
    );

    if (res.Parameters) {
      for (const p of res.Parameters) {
        summaries.push({
          name: p.Name ?? "",
          type: (p.Type as ParameterType) ?? "String",
          version: p.Version ?? 1,
          lastModified: p.LastModifiedDate,
        });
      }
    }

    nextToken = res.NextToken;
  } while (nextToken);

  summaries.sort((a, b) => a.name.localeCompare(b.name));
  return summaries;
}

export async function getParameter(
  client: SSMClient,
  params: { name: string; withDecryption?: boolean },
): Promise<ParameterDetail> {
  const res = await client.send(
    new GetParameterCommand({
      Name: params.name,
      WithDecryption: params.withDecryption,
    }),
  );

  return {
    name: res.Parameter?.Name ?? params.name,
    type: (res.Parameter?.Type as ParameterType) ?? "String",
    value: res.Parameter?.Value ?? "",
    version: res.Parameter?.Version ?? 1,
    lastModified: res.Parameter?.LastModifiedDate,
    arn: res.Parameter?.ARN,
  };
}

export async function putParameter(
  client: SSMClient,
  params: {
    name: string;
    value: string;
    type: ParameterType;
    overwrite?: boolean;
  },
): Promise<{ version: number }> {
  const res = await client.send(
    new PutParameterCommand({
      Name: params.name,
      Value: params.value,
      Type: params.type,
      Overwrite: params.overwrite ?? false,
    }),
  );

  return { version: res.Version ?? 1 };
}

export async function deleteParameter(
  client: SSMClient,
  name: string,
): Promise<void> {
  await client.send(new DeleteParameterCommand({ Name: name }));
}

export interface ParameterNode {
  segment: string;
  children: ParameterNode[];
  parameter?: ParameterSummary;
}

interface MutableNode {
  segment: string;
  children: Map<string, MutableNode>;
  parameter?: ParameterSummary;
}

export function buildParameterTree(
  params: ParameterSummary[],
): ParameterNode[] {
  const rootChildren = new Map<string, MutableNode>();

  for (const param of params) {
    const path = param.name.startsWith("/") ? param.name.slice(1) : param.name;
    const segments = path.split("/").filter(Boolean);
    if (segments.length === 0) continue;

    let currentMap = rootChildren;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      let node = currentMap.get(seg);
      if (!node) {
        node = {
          segment: seg,
          children: new Map(),
        };
        currentMap.set(seg, node);
      }
      if (i === segments.length - 1) {
        node.parameter = param;
      }
      currentMap = node.children;
    }
  }

  function convert(map: Map<string, MutableNode>): ParameterNode[] {
    const nodes: ParameterNode[] = [];
    for (const node of map.values()) {
      nodes.push({
        segment: node.segment,
        parameter: node.parameter,
        children: convert(node.children),
      });
    }

    nodes.sort((a, b) => {
      const aIsFolder = a.children.length > 0;
      const bIsFolder = b.children.length > 0;
      if (aIsFolder !== bIsFolder) {
        return aIsFolder ? -1 : 1;
      }
      return a.segment.localeCompare(b.segment);
    });

    return nodes;
  }

  return convert(rootChildren);
}
