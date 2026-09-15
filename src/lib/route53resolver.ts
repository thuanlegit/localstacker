import {
  type Route53ResolverClient,
  ListResolverEndpointsCommand,
  ListResolverRulesCommand,
} from "@aws-sdk/client-route53resolver";

export interface ResolverEndpoint {
  id: string;
  arn: string;
  name: string;
  direction: string;
  status: string;
  vpcId: string;
}

export interface ResolverRule {
  id: string;
  name: string;
  ruleType: string;
  status: string;
  domainName: string;
}

export async function listResolverEndpoints(
  client: Route53ResolverClient,
): Promise<ResolverEndpoint[]> {
  const res = await client.send(new ListResolverEndpointsCommand({}));
  return (res.ResolverEndpoints ?? []).map((e) => ({
    id: e.Id ?? "",
    arn: e.Arn ?? "",
    name: e.Name ?? "",
    direction: e.Direction ?? "",
    status: e.Status ?? "",
    vpcId: e.HostVPCId ?? "",
  }));
}

export async function listResolverRules(
  client: Route53ResolverClient,
): Promise<ResolverRule[]> {
  const res = await client.send(new ListResolverRulesCommand({}));
  return (res.ResolverRules ?? []).map((r) => ({
    id: r.Id ?? "",
    name: r.Name ?? "",
    ruleType: r.RuleType ?? "",
    status: r.Status ?? "",
    domainName: r.DomainName ?? "",
  }));
}
