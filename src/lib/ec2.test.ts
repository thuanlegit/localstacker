import { describe, it, expect, vi } from "vitest";
import type { EC2Client } from "@aws-sdk/client-ec2";
import {
  listInstances,
  startInstances,
  stopInstances,
  rebootInstances,
  terminateInstances,
  runInstances,
  listKeyPairs,
  createKeyPair,
  deleteKeyPair,
  listSecurityGroups,
  createSecurityGroup,
  deleteSecurityGroup,
  authorizeSecurityGroupIngress,
  revokeSecurityGroupIngress,
  authorizeSecurityGroupEgress,
  revokeSecurityGroupEgress,
  formatPortRange,
  formatRuleTargets,
  formatIpPermission,
  parseTags,
  type IpPermissionRule,
} from "./ec2";

function createMockClient(sendFn: (...args: unknown[]) => unknown = vi.fn()): EC2Client {
  return {
    send: sendFn,
  } as unknown as EC2Client;
}

describe("ec2 data plane", () => {
  describe("helpers", () => {
    it("formatPortRange formats various combinations correctly", () => {
      expect(formatPortRange("-1")).toBe("All traffic");
      expect(formatPortRange("tcp", undefined, undefined)).toBe("All");
      expect(formatPortRange("tcp", 80, 80)).toBe("80");
      expect(formatPortRange("tcp", 1000, 2000)).toBe("1000-2000");
    });

    it("formatRuleTargets returns CIDR, IPv6, and group targets or fallback", () => {
      const ruleWithTargets: IpPermissionRule = {
        ipProtocol: "tcp",
        ipRanges: [{ cidrIp: "0.0.0.0/0" }, { cidrIp: "10.0.0.0/16" }],
        ipv6Ranges: [{ cidrIpv6: "::/0" }],
        userIdGroupPairs: [{ groupId: "sg-123456" }],
      };
      expect(formatRuleTargets(ruleWithTargets)).toEqual([
        "0.0.0.0/0",
        "10.0.0.0/16",
        "::/0",
        "sg-123456",
      ]);

      const emptyRule: IpPermissionRule = {
        ipProtocol: "tcp",
        ipRanges: [],
        ipv6Ranges: [],
        userIdGroupPairs: [],
      };
      expect(formatRuleTargets(emptyRule)).toEqual(["—"]);
    });

    it("formatIpPermission constructs SDK IpPermission with CIDR and Group targets", () => {
      const cidrPerm = formatIpPermission({
        ipProtocol: "tcp",
        fromPort: 80,
        toPort: 80,
        cidrIp: "0.0.0.0/0",
        description: "HTTP",
      });
      expect(cidrPerm).toEqual({
        IpProtocol: "tcp",
        FromPort: 80,
        ToPort: 80,
        IpRanges: [{ CidrIp: "0.0.0.0/0", Description: "HTTP" }],
      });

      const groupPerm = formatIpPermission({
        ipProtocol: "tcp",
        fromPort: 443,
        toPort: 443,
        sourceGroupId: "sg-99999",
        description: "Internal SG",
      });
      expect(groupPerm).toEqual({
        IpProtocol: "tcp",
        FromPort: 443,
        ToPort: 443,
        UserIdGroupPairs: [{ GroupId: "sg-99999", Description: "Internal SG" }],
      });
    });

    it("parseTags converts key-value pairs and ignores empty keys", () => {
      expect(parseTags(undefined)).toEqual({});
      expect(
        parseTags([
          { Key: "Name", Value: "web" },
          { Key: "Env", Value: "prod" },
          { Key: undefined, Value: "invalid" },
        ]),
      ).toEqual({
        Name: "web",
        Env: "prod",
      });
    });
  });

  describe("instances", () => {
    it("listInstances paginates across reservations and normalizes instances", async () => {
      const mockSend = vi
        .fn()
        .mockResolvedValueOnce({
          Reservations: [
            {
              Instances: [
                {
                  InstanceId: "i-01",
                  State: { Name: "running" },
                  InstanceType: "t2.micro",
                  Placement: { AvailabilityZone: "us-east-1a" },
                  PrivateIpAddress: "10.0.0.1",
                  PublicIpAddress: "54.0.0.1",
                  KeyName: "my-key",
                  SecurityGroups: [{ GroupId: "sg-01", GroupName: "default" }],
                  Tags: [{ Key: "Name", Value: "prod-web" }],
                },
              ],
            },
          ],
          NextToken: "token-1",
        })
        .mockResolvedValueOnce({
          Reservations: [
            {
              Instances: [
                {
                  InstanceId: "i-02",
                  State: { Name: "stopped" },
                  InstanceType: "t3.medium",
                },
              ],
            },
          ],
        });

      const client = createMockClient(mockSend);
      const instances = await listInstances(client);

      expect(instances).toHaveLength(2);
      expect(instances[0]).toEqual({
        instanceId: "i-01",
        name: "prod-web",
        state: "running",
        instanceType: "t2.micro",
        availabilityZone: "us-east-1a",
        privateIpAddress: "10.0.0.1",
        publicIpAddress: "54.0.0.1",
        keyName: "my-key",
        securityGroups: [{ groupId: "sg-01", groupName: "default" }],
        launchTime: undefined,
        vpcId: undefined,
        subnetId: undefined,
        tags: { Name: "prod-web" },
      });
      expect(instances[1].instanceId).toBe("i-02");
      expect(instances[1].name).toBeUndefined();
      expect(instances[1].state).toBe("stopped");
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it("startInstances, stopInstances, rebootInstances, terminateInstances invoke respective commands", async () => {
      const mockSend = vi.fn().mockResolvedValue({});
      const client = createMockClient(mockSend);

      await startInstances(client, ["i-01", "i-02"]);
      expect(mockSend.mock.calls[0][0].input).toEqual({
        InstanceIds: ["i-01", "i-02"],
      });

      await stopInstances(client, ["i-01"]);
      expect(mockSend.mock.calls[1][0].input).toEqual({
        InstanceIds: ["i-01"],
      });

      await rebootInstances(client, ["i-01"]);
      expect(mockSend.mock.calls[2][0].input).toEqual({
        InstanceIds: ["i-01"],
      });

      await terminateInstances(client, ["i-01"]);
      expect(mockSend.mock.calls[3][0].input).toEqual({
        InstanceIds: ["i-01"],
      });
    });

    it("runInstances creates an instance with tags and returns normalized summary", async () => {
      const mockSend = vi.fn().mockResolvedValue({
        Instances: [
          {
            InstanceId: "i-new",
            State: { Name: "pending" },
            InstanceType: "t2.micro",
            Tags: [{ Key: "Name", Value: "api-server" }],
          },
        ],
      });
      const client = createMockClient(mockSend);

      const result = await runInstances(client, {
        name: "api-server",
        instanceType: "t2.micro",
        keyName: "my-key",
        securityGroupIds: ["sg-111"],
      });

      expect(result.instanceId).toBe("i-new");
      expect(result.name).toBe("api-server");
      expect(result.state).toBe("pending");
      const sentInput = mockSend.mock.calls[0][0].input;
      expect(sentInput.InstanceType).toBe("t2.micro");
      expect(sentInput.KeyName).toBe("my-key");
      expect(sentInput.SecurityGroupIds).toEqual(["sg-111"]);
      expect(sentInput.TagSpecifications).toEqual([
        {
          ResourceType: "instance",
          Tags: [{ Key: "Name", Value: "api-server" }],
        },
      ]);
    });

    it("runInstances throws if response contains no instances", async () => {
      const mockSend = vi.fn().mockResolvedValue({ Instances: [] });
      const client = createMockClient(mockSend);
      await expect(runInstances(client, {})).rejects.toThrow(
        "No instance returned from runInstances",
      );
    });
  });

  describe("key pairs", () => {
    it("listKeyPairs returns normalized key pairs", async () => {
      const now = new Date();
      const mockSend = vi.fn().mockResolvedValue({
        KeyPairs: [
          {
            KeyPairId: "key-01",
            KeyName: "deploy-key",
            KeyFingerprint: "ab:cd:ef",
            KeyType: "rsa",
            CreateTime: now,
            Tags: [{ Key: "owner", Value: "ci" }],
          },
          {
            KeyPairId: "key-02",
            KeyName: "dev-key",
          },
        ],
      });

      const client = createMockClient(mockSend);
      const keys = await listKeyPairs(client);

      expect(keys).toHaveLength(2);
      expect(keys[0]).toEqual({
        keyPairId: "key-01",
        keyName: "deploy-key",
        keyFingerprint: "ab:cd:ef",
        keyType: "rsa",
        createTime: now,
        tags: { owner: "ci" },
      });
      expect(keys[1].keyName).toBe("dev-key");
    });

    it("createKeyPair returns key material and metadata", async () => {
      const mockSend = vi.fn().mockResolvedValue({
        KeyPairId: "key-99",
        KeyName: "bastion",
        KeyFingerprint: "11:22:33",
        KeyMaterial: "-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----",
      });
      const client = createMockClient(mockSend);

      const created = await createKeyPair(client, {
        keyName: "bastion",
        keyType: "rsa",
      });

      expect(created.keyName).toBe("bastion");
      expect(created.keyPairId).toBe("key-99");
      expect(created.keyMaterial).toContain("BEGIN RSA PRIVATE KEY");
    });

    it("createKeyPair throws if KeyMaterial is absent", async () => {
      const mockSend = vi.fn().mockResolvedValue({ KeyName: "bad-key" });
      const client = createMockClient(mockSend);

      await expect(
        createKeyPair(client, { keyName: "bad-key" }),
      ).rejects.toThrow("Missing KeyMaterial in createKeyPair response");
    });

    it("deleteKeyPair sends KeyName and KeyPairId", async () => {
      const mockSend = vi.fn().mockResolvedValue({});
      const client = createMockClient(mockSend);

      await deleteKeyPair(client, "bastion", "key-99");
      expect(mockSend.mock.calls[0][0].input).toEqual({
        KeyName: "bastion",
        KeyPairId: "key-99",
      });
    });
  });

  describe("security groups", () => {
    it("listSecurityGroups normalizes rules and tags with pagination", async () => {
      const mockSend = vi
        .fn()
        .mockResolvedValueOnce({
          SecurityGroups: [
            {
              GroupId: "sg-100",
              GroupName: "web-sg",
              Description: "Web tier",
              VpcId: "vpc-01",
              IpPermissions: [
                {
                  IpProtocol: "tcp",
                  FromPort: 80,
                  ToPort: 80,
                  IpRanges: [{ CidrIp: "0.0.0.0/0", Description: "HTTP" }],
                },
              ],
              IpPermissionsEgress: [
                {
                  IpProtocol: "-1",
                  IpRanges: [{ CidrIp: "0.0.0.0/0" }],
                },
              ],
              Tags: [{ Key: "Env", Value: "prod" }],
            },
          ],
        });

      const client = createMockClient(mockSend);
      const sgs = await listSecurityGroups(client);

      expect(sgs).toHaveLength(1);
      expect(sgs[0].groupId).toBe("sg-100");
      expect(sgs[0].groupName).toBe("web-sg");
      expect(sgs[0].inboundRules).toHaveLength(1);
      expect(sgs[0].inboundRules[0].fromPort).toBe(80);
      expect(sgs[0].outboundRules).toHaveLength(1);
      expect(sgs[0].tags).toEqual({ Env: "prod" });
    });

    it("createSecurityGroup sends input and returns GroupId", async () => {
      const mockSend = vi.fn().mockResolvedValue({ GroupId: "sg-created-55" });
      const client = createMockClient(mockSend);

      const groupId = await createSecurityGroup(client, {
        groupName: "db-sg",
        description: "Database firewall",
        vpcId: "vpc-77",
      });

      expect(groupId).toBe("sg-created-55");
      expect(mockSend.mock.calls[0][0].input).toEqual({
        GroupName: "db-sg",
        Description: "Database firewall",
        VpcId: "vpc-77",
      });
    });

    it("createSecurityGroup throws if GroupId is missing", async () => {
      const mockSend = vi.fn().mockResolvedValue({});
      const client = createMockClient(mockSend);

      await expect(
        createSecurityGroup(client, {
          groupName: "bad-sg",
          description: "no id",
        }),
      ).rejects.toThrow("Missing GroupId in createSecurityGroup response");
    });

    it("deleteSecurityGroup sends GroupId", async () => {
      const mockSend = vi.fn().mockResolvedValue({});
      const client = createMockClient(mockSend);

      await deleteSecurityGroup(client, "sg-100");
      expect(mockSend.mock.calls[0][0].input).toEqual({
        GroupId: "sg-100",
      });
    });

    it("authorize and revoke ingress/egress rules call corresponding commands", async () => {
      const mockSend = vi.fn().mockResolvedValue({});
      const client = createMockClient(mockSend);

      const rule = {
        ipProtocol: "tcp",
        fromPort: 22,
        toPort: 22,
        cidrIp: "192.168.1.0/24",
        description: "SSH Bastion",
      };

      await authorizeSecurityGroupIngress(client, "sg-100", rule);
      expect(mockSend.mock.calls[0][0].input).toEqual({
        GroupId: "sg-100",
        IpPermissions: [formatIpPermission(rule)],
      });

      await revokeSecurityGroupIngress(client, "sg-100", rule);
      expect(mockSend.mock.calls[1][0].input).toEqual({
        GroupId: "sg-100",
        IpPermissions: [formatIpPermission(rule)],
      });

      await authorizeSecurityGroupEgress(client, "sg-100", rule);
      expect(mockSend.mock.calls[2][0].input).toEqual({
        GroupId: "sg-100",
        IpPermissions: [formatIpPermission(rule)],
      });

      await revokeSecurityGroupEgress(client, "sg-100", rule);
      expect(mockSend.mock.calls[3][0].input).toEqual({
        GroupId: "sg-100",
        IpPermissions: [formatIpPermission(rule)],
      });
    });
  });
});
