import { describe, it, expect, vi } from "vitest";
import type { Route53ResolverClient } from "@aws-sdk/client-route53resolver";
import { listResolverEndpoints, listResolverRules } from "./route53resolver";

describe("route53resolver data plane", () => {
  it("lists resolver endpoints", async () => {
    const send = vi.fn().mockResolvedValueOnce({
      ResolverEndpoints: [
        {
          Id: "rte-1",
          Arn: "arn:rte-1",
          Name: "inbound",
          Direction: "INBOUND",
          Status: "OPERATIONAL",
          HostVPCId: "vpc-1",
        },
      ],
    });
    const client = { send } as unknown as Route53ResolverClient;
    const endpoints = await listResolverEndpoints(client);

    expect(endpoints).toEqual([
      {
        id: "rte-1",
        arn: "arn:rte-1",
        name: "inbound",
        direction: "INBOUND",
        status: "OPERATIONAL",
        vpcId: "vpc-1",
      },
    ]);
  });

  it("lists resolver rules", async () => {
    const send = vi.fn().mockResolvedValueOnce({
      ResolverRules: [
        {
          Id: "rrl-1",
          Name: "system",
          RuleType: "SYSTEM",
          Status: "COMPLETE",
          DomainName: ".",
        },
      ],
    });
    const client = { send } as unknown as Route53ResolverClient;
    const rules = await listResolverRules(client);

    expect(rules).toEqual([
      {
        id: "rrl-1",
        name: "system",
        ruleType: "SYSTEM",
        status: "COMPLETE",
        domainName: ".",
      },
    ]);
  });

  it("handles empty responses", async () => {
    const send = vi.fn().mockResolvedValueOnce({});
    const client = { send } as unknown as Route53ResolverClient;
    expect(await listResolverEndpoints(client)).toEqual([]);
  });
});
