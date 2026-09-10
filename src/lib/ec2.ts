import {
  type EC2Client,
  DescribeInstancesCommand,
  StartInstancesCommand,
  StopInstancesCommand,
  RebootInstancesCommand,
  TerminateInstancesCommand,
  RunInstancesCommand,
  DescribeKeyPairsCommand,
  CreateKeyPairCommand,
  DeleteKeyPairCommand,
  DescribeSecurityGroupsCommand,
  CreateSecurityGroupCommand,
  DeleteSecurityGroupCommand,
  AuthorizeSecurityGroupIngressCommand,
  RevokeSecurityGroupIngressCommand,
  AuthorizeSecurityGroupEgressCommand,
  RevokeSecurityGroupEgressCommand,
  type IpPermission,
  type Instance,
  type _InstanceType,
} from "@aws-sdk/client-ec2";

export type InstanceStateName =
  | "pending"
  | "running"
  | "shutting-down"
  | "terminated"
  | "stopping"
  | "stopped";

export interface InstanceSummary {
  instanceId: string;
  name?: string; // from Tags where Key === "Name"
  state: InstanceStateName;
  instanceType: string;
  availabilityZone?: string;
  privateIpAddress?: string;
  publicIpAddress?: string;
  keyName?: string;
  securityGroups: Array<{ groupId: string; groupName: string }>;
  launchTime?: Date;
  vpcId?: string;
  subnetId?: string;
  tags: Record<string, string>;
}

export interface KeyPairSummary {
  keyPairId?: string;
  keyName: string;
  keyFingerprint?: string;
  keyType?: string; // "rsa" | "ed25519"
  createTime?: Date;
  tags: Record<string, string>;
}

export interface CreatedKeyPair {
  keyPairId?: string;
  keyName: string;
  keyFingerprint?: string;
  keyMaterial: string; // Private key PEM content
}

export interface IpPermissionRule {
  ipProtocol: string; // "tcp", "udp", "icmp", "-1" (all)
  fromPort?: number;
  toPort?: number;
  ipRanges: Array<{ cidrIp: string; description?: string }>;
  ipv6Ranges: Array<{ cidrIpv6: string; description?: string }>;
  userIdGroupPairs: Array<{
    groupId: string;
    groupName?: string;
    description?: string;
    vpcId?: string;
  }>;
}

export interface IpPermissionRuleInput {
  ipProtocol: string;
  fromPort?: number;
  toPort?: number;
  cidrIp?: string;
  sourceGroupId?: string;
  description?: string;
}

export interface SecurityGroupSummary {
  groupId: string;
  groupName: string;
  description?: string;
  vpcId?: string;
  ownerId?: string;
  inboundRules: IpPermissionRule[];
  outboundRules: IpPermissionRule[];
  tags: Record<string, string>;
}

export interface RunInstancesInput {
  imageId?: string;
  instanceType?: string;
  minCount?: number;
  maxCount?: number;
  keyName?: string;
  securityGroupIds?: string[];
  name?: string;
}

export function parseTags(tags?: Array<{ Key?: string; Value?: string }>): Record<string, string> {
  const result: Record<string, string> = {};
  if (!tags) return result;
  for (const tag of tags) {
    if (tag.Key) {
      result[tag.Key] = tag.Value ?? "";
    }
  }
  return result;
}

export function formatPortRange(
  ipProtocol: string,
  fromPort?: number,
  toPort?: number,
): string {
  if (ipProtocol === "-1") {
    return "All traffic";
  }
  if (fromPort == null && toPort == null) {
    return "All";
  }
  if (fromPort === toPort) {
    return `${fromPort}`;
  }
  return `${fromPort}-${toPort}`;
}

export function formatRuleTargets(rule: IpPermissionRule): string[] {
  const targets: string[] = [];
  for (const r of rule.ipRanges) {
    if (r.cidrIp) targets.push(r.cidrIp);
  }
  for (const r of rule.ipv6Ranges) {
    if (r.cidrIpv6) targets.push(r.cidrIpv6);
  }
  for (const g of rule.userIdGroupPairs) {
    if (g.groupId) targets.push(g.groupId);
  }
  return targets.length > 0 ? targets : ["—"];
}

export function formatIpPermission(input: IpPermissionRuleInput): IpPermission {
  const perm: IpPermission = {
    IpProtocol: input.ipProtocol,
  };
  if (input.fromPort !== undefined) {
    perm.FromPort = input.fromPort;
  }
  if (input.toPort !== undefined) {
    perm.ToPort = input.toPort;
  }
  if (input.cidrIp) {
    perm.IpRanges = [
      {
        CidrIp: input.cidrIp,
        Description: input.description,
      },
    ];
  }
  if (input.sourceGroupId) {
    perm.UserIdGroupPairs = [
      {
        GroupId: input.sourceGroupId,
        Description: input.description,
      },
    ];
  }
  return perm;
}

function normalizeInstance(instance: Instance): InstanceSummary {
  const tags = parseTags(instance.Tags);
  const name = tags["Name"] || undefined;
  const state = (instance.State?.Name ?? "pending") as InstanceStateName;

  return {
    instanceId: instance.InstanceId ?? "",
    name,
    state,
    instanceType: instance.InstanceType ?? "t2.micro",
    availabilityZone: instance.Placement?.AvailabilityZone,
    privateIpAddress: instance.PrivateIpAddress,
    publicIpAddress: instance.PublicIpAddress,
    keyName: instance.KeyName,
    securityGroups: (instance.SecurityGroups ?? []).map((sg) => ({
      groupId: sg.GroupId ?? "",
      groupName: sg.GroupName ?? "",
    })),
    launchTime: instance.LaunchTime,
    vpcId: instance.VpcId,
    subnetId: instance.SubnetId,
    tags,
  };
}

function normalizeIpPermissions(perms?: IpPermission[]): IpPermissionRule[] {
  if (!perms) return [];
  return perms.map((p) => ({
    ipProtocol: p.IpProtocol ?? "-1",
    fromPort: p.FromPort,
    toPort: p.ToPort,
    ipRanges: (p.IpRanges ?? []).map((r) => ({
      cidrIp: r.CidrIp ?? "",
      description: r.Description,
    })),
    ipv6Ranges: (p.Ipv6Ranges ?? []).map((r) => ({
      cidrIpv6: r.CidrIpv6 ?? "",
      description: r.Description,
    })),
    userIdGroupPairs: (p.UserIdGroupPairs ?? []).map((g) => ({
      groupId: g.GroupId ?? "",
      groupName: g.GroupName,
      description: g.Description,
      vpcId: g.VpcId,
    })),
  }));
}

export async function listInstances(client: EC2Client): Promise<InstanceSummary[]> {
  const instances: InstanceSummary[] = [];
  let nextToken: string | undefined;

  do {
    const output = await client.send(
      new DescribeInstancesCommand({ NextToken: nextToken }),
    );
    if (output.Reservations) {
      for (const reservation of output.Reservations) {
        if (reservation.Instances) {
          for (const inst of reservation.Instances) {
            instances.push(normalizeInstance(inst));
          }
        }
      }
    }
    nextToken = output.NextToken;
  } while (nextToken);

  return instances;
}

export async function startInstances(
  client: EC2Client,
  instanceIds: string[],
): Promise<void> {
  await client.send(new StartInstancesCommand({ InstanceIds: instanceIds }));
}

export async function stopInstances(
  client: EC2Client,
  instanceIds: string[],
): Promise<void> {
  await client.send(new StopInstancesCommand({ InstanceIds: instanceIds }));
}

export async function rebootInstances(
  client: EC2Client,
  instanceIds: string[],
): Promise<void> {
  await client.send(new RebootInstancesCommand({ InstanceIds: instanceIds }));
}

export async function terminateInstances(
  client: EC2Client,
  instanceIds: string[],
): Promise<void> {
  await client.send(new TerminateInstancesCommand({ InstanceIds: instanceIds }));
}

export async function runInstances(
  client: EC2Client,
  input: RunInstancesInput,
): Promise<InstanceSummary> {
  const tagSpecifications = input.name
    ? [
        {
          ResourceType: "instance" as const,
          Tags: [{ Key: "Name", Value: input.name }],
        },
      ]
    : undefined;

  const output = await client.send(
    new RunInstancesCommand({
      ImageId: input.imageId ?? "ami-12345678",
      InstanceType: (input.instanceType ?? "t2.micro") as _InstanceType,
      MinCount: input.minCount ?? 1,
      MaxCount: input.maxCount ?? 1,
      KeyName: input.keyName || undefined,
      SecurityGroupIds: input.securityGroupIds?.length
        ? input.securityGroupIds
        : undefined,
      TagSpecifications: tagSpecifications,
    }),
  );

  const instance = output.Instances?.[0];
  if (!instance) {
    throw new Error("No instance returned from runInstances");
  }

  return normalizeInstance(instance);
}

export async function listKeyPairs(client: EC2Client): Promise<KeyPairSummary[]> {
  const output = await client.send(new DescribeKeyPairsCommand({}));
  const keyPairs: KeyPairSummary[] = [];
  if (output.KeyPairs) {
    for (const kp of output.KeyPairs) {
      keyPairs.push({
        keyPairId: kp.KeyPairId,
        keyName: kp.KeyName ?? "",
        keyFingerprint: kp.KeyFingerprint,
        keyType: kp.KeyType,
        createTime: kp.CreateTime,
        tags: parseTags(kp.Tags),
      });
    }
  }
  return keyPairs;
}

export async function createKeyPair(
  client: EC2Client,
  input: { keyName: string; keyType?: "rsa" | "ed25519" },
): Promise<CreatedKeyPair> {
  const output = await client.send(
    new CreateKeyPairCommand({
      KeyName: input.keyName,
      KeyType: input.keyType,
    }),
  );

  if (!output.KeyMaterial) {
    throw new Error("Missing KeyMaterial in createKeyPair response");
  }

  return {
    keyPairId: output.KeyPairId,
    keyName: output.KeyName ?? input.keyName,
    keyFingerprint: output.KeyFingerprint,
    keyMaterial: output.KeyMaterial,
  };
}

export async function deleteKeyPair(
  client: EC2Client,
  keyName: string,
  keyPairId?: string,
): Promise<void> {
  await client.send(
    new DeleteKeyPairCommand({
      KeyName: keyName,
      KeyPairId: keyPairId,
    }),
  );
}

export async function listSecurityGroups(
  client: EC2Client,
): Promise<SecurityGroupSummary[]> {
  const securityGroups: SecurityGroupSummary[] = [];
  let nextToken: string | undefined;

  do {
    const output = await client.send(
      new DescribeSecurityGroupsCommand({ NextToken: nextToken }),
    );
    if (output.SecurityGroups) {
      for (const sg of output.SecurityGroups) {
        securityGroups.push({
          groupId: sg.GroupId ?? "",
          groupName: sg.GroupName ?? "",
          description: sg.Description,
          vpcId: sg.VpcId,
          ownerId: sg.OwnerId,
          inboundRules: normalizeIpPermissions(sg.IpPermissions),
          outboundRules: normalizeIpPermissions(sg.IpPermissionsEgress),
          tags: parseTags(sg.Tags),
        });
      }
    }
    nextToken = output.NextToken;
  } while (nextToken);

  return securityGroups;
}

export async function createSecurityGroup(
  client: EC2Client,
  input: { groupName: string; description: string; vpcId?: string },
): Promise<string> {
  const output = await client.send(
    new CreateSecurityGroupCommand({
      GroupName: input.groupName,
      Description: input.description,
      VpcId: input.vpcId || undefined,
    }),
  );

  if (!output.GroupId) {
    throw new Error("Missing GroupId in createSecurityGroup response");
  }

  return output.GroupId;
}

export async function deleteSecurityGroup(
  client: EC2Client,
  groupId: string,
): Promise<void> {
  await client.send(new DeleteSecurityGroupCommand({ GroupId: groupId }));
}

export async function authorizeSecurityGroupIngress(
  client: EC2Client,
  groupId: string,
  rule: IpPermissionRuleInput,
): Promise<void> {
  await client.send(
    new AuthorizeSecurityGroupIngressCommand({
      GroupId: groupId,
      IpPermissions: [formatIpPermission(rule)],
    }),
  );
}

export async function revokeSecurityGroupIngress(
  client: EC2Client,
  groupId: string,
  rule: IpPermissionRuleInput,
): Promise<void> {
  await client.send(
    new RevokeSecurityGroupIngressCommand({
      GroupId: groupId,
      IpPermissions: [formatIpPermission(rule)],
    }),
  );
}

export async function authorizeSecurityGroupEgress(
  client: EC2Client,
  groupId: string,
  rule: IpPermissionRuleInput,
): Promise<void> {
  await client.send(
    new AuthorizeSecurityGroupEgressCommand({
      GroupId: groupId,
      IpPermissions: [formatIpPermission(rule)],
    }),
  );
}

export async function revokeSecurityGroupEgress(
  client: EC2Client,
  groupId: string,
  rule: IpPermissionRuleInput,
): Promise<void> {
  await client.send(
    new RevokeSecurityGroupEgressCommand({
      GroupId: groupId,
      IpPermissions: [formatIpPermission(rule)],
    }),
  );
}
