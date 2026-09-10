import {
  type Route53Client,
  ListHostedZonesCommand,
  CreateHostedZoneCommand,
  DeleteHostedZoneCommand,
  ListResourceRecordSetsCommand,
  ChangeResourceRecordSetsCommand,
  type RRType,
  type ChangeAction,
  type ListHostedZonesCommandOutput,
  type ListResourceRecordSetsCommandOutput,
} from "@aws-sdk/client-route-53";

export interface HostedZoneSummary {
  id: string; // Clean ID (e.g. "Z12345", stripped of "/hostedzone/")
  rawId: string; // Full ID (e.g. "/hostedzone/Z12345")
  name: string; // Domain name (e.g. "example.com.")
  callerReference: string;
  comment?: string;
  privateZone: boolean;
  recordCount?: number;
}

export interface ResourceRecordSetSummary {
  name: string;
  type: string; // A, AAAA, CNAME, TXT, MX, NS, SOA, SRV, PTR, CAA
  ttl?: number;
  values: string[];
  aliasTarget?: {
    dnsName: string;
    hostedZoneId: string;
    evaluateTargetHealth: boolean;
  };
}

export function cleanZoneId(rawId: string): string {
  return rawId.replace(/^\/?hostedzone\//, "");
}

export function validateRecordValue(type: string, value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return "Record value cannot be empty";
  }

  const upperType = type.toUpperCase();

  if (upperType === "A") {
    // IPv4 address format
    const ipv4Regex =
      /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    if (!ipv4Regex.test(trimmed)) {
      return "Invalid IPv4 address format (e.g. 192.0.2.1)";
    }
  } else if (upperType === "AAAA") {
    // IPv6 address format
    const isValidIpv6 = (str: string): boolean => {
      if (!/^[0-9a-fA-F:]+$/.test(str)) return false;
      if ((str.match(/::/g) || []).length > 1) return false;
      if (
        (str.startsWith(":") && !str.startsWith("::")) ||
        (str.endsWith(":") && !str.endsWith("::"))
      ) {
        return false;
      }
      const parts = str.split(":");
      const hasDoubleColon = str.includes("::");
      const nonEmpties = parts.filter((p) => p.length > 0);
      if (nonEmpties.length > (hasDoubleColon ? 7 : 8)) return false;
      if (!hasDoubleColon && nonEmpties.length !== 8) return false;
      return nonEmpties.every((p) => /^[0-9a-fA-F]{1,4}$/.test(p));
    };

    if (!isValidIpv6(trimmed)) {
      return "Invalid IPv6 address format (e.g. 2001:db8::1)";
    }
  } else if (upperType === "CNAME") {
    // Hostname format
    const hostnameRegex =
      /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.?$/;
    if (!hostnameRegex.test(trimmed)) {
      return "Invalid hostname format (e.g. host.example.com)";
    }
  } else if (upperType === "MX") {
    // Priority integer + hostname
    const mxRegex = /^(\d+)\s+([a-zA-Z0-9.-]+\.?)$/;
    const match = trimmed.match(mxRegex);
    if (!match) {
      return "Invalid MX record format (expected: <priority> <hostname>, e.g. '10 mail.example.com')";
    }
    const priority = Number(match[1]);
    if (priority < 0 || priority > 65535) {
      return "MX priority must be between 0 and 65535";
    }
  } else if (upperType === "TXT") {
    if (trimmed.length === 0) {
      return "TXT record cannot be empty";
    }
  }

  return null;
}

export async function listHostedZones(
  client: Route53Client,
): Promise<HostedZoneSummary[]> {
  const zones: HostedZoneSummary[] = [];
  let marker: string | undefined = undefined;

  do {
    const res: ListHostedZonesCommandOutput = await client.send(
      new ListHostedZonesCommand({
        Marker: marker,
      }),
    );

    if (res.HostedZones) {
      for (const z of res.HostedZones) {
        const rawId = z.Id ?? "";
        zones.push({
          id: cleanZoneId(rawId),
          rawId,
          name: z.Name ?? "",
          callerReference: z.CallerReference ?? "",
          comment: z.Config?.Comment,
          privateZone: Boolean(z.Config?.PrivateZone),
          recordCount: z.ResourceRecordSetCount,
        });
      }
    }

    marker = res.IsTruncated ? res.NextMarker : undefined;
  } while (marker);

  return zones;
}

export async function createHostedZone(
  client: Route53Client,
  input: { name: string; comment?: string; privateZone?: boolean },
): Promise<HostedZoneSummary> {
  const domainName = input.name.endsWith(".") ? input.name : `${input.name}.`;

  const res = await client.send(
    new CreateHostedZoneCommand({
      Name: domainName,
      CallerReference: Date.now().toString(),
      HostedZoneConfig: {
        Comment: input.comment,
        PrivateZone: input.privateZone,
      },
    }),
  );

  const z = res.HostedZone;
  if (!z) {
    throw new Error(`Failed to create hosted zone: ${input.name}`);
  }

  const rawId = z.Id ?? "";
  return {
    id: cleanZoneId(rawId),
    rawId,
    name: z.Name ?? domainName,
    callerReference: z.CallerReference ?? "",
    comment: z.Config?.Comment,
    privateZone: Boolean(z.Config?.PrivateZone),
    recordCount: z.ResourceRecordSetCount,
  };
}

export async function deleteHostedZone(
  client: Route53Client,
  zoneId: string,
): Promise<void> {
  await client.send(
    new DeleteHostedZoneCommand({
      Id: zoneId,
    }),
  );
}

export async function listResourceRecordSets(
  client: Route53Client,
  zoneId: string,
): Promise<ResourceRecordSetSummary[]> {
  const records: ResourceRecordSetSummary[] = [];
  let nextName: string | undefined = undefined;
  let nextType: RRType | undefined = undefined;
  let nextIdentifier: string | undefined = undefined;

  do {
    const res: ListResourceRecordSetsCommandOutput = await client.send(
      new ListResourceRecordSetsCommand({
        HostedZoneId: zoneId,
        StartRecordName: nextName,
        StartRecordType: nextType,
        StartRecordIdentifier: nextIdentifier,
      }),
    );

    if (res.ResourceRecordSets) {
      for (const r of res.ResourceRecordSets) {
        const values = (r.ResourceRecords ?? [])
          .map((v) => v.Value ?? "")
          .filter(Boolean);

        records.push({
          name: r.Name ?? "",
          type: r.Type ?? "A",
          ttl: r.TTL,
          values,
          aliasTarget: r.AliasTarget
            ? {
                dnsName: r.AliasTarget.DNSName ?? "",
                hostedZoneId: r.AliasTarget.HostedZoneId ?? "",
                evaluateTargetHealth: Boolean(
                  r.AliasTarget.EvaluateTargetHealth,
                ),
              }
            : undefined,
        });
      }
    }

    if (res.IsTruncated) {
      nextName = res.NextRecordName;
      nextType = res.NextRecordType;
      nextIdentifier = res.NextRecordIdentifier;
    } else {
      nextName = undefined;
    }
  } while (nextName);

  return records;
}

export async function changeResourceRecordSets(
  client: Route53Client,
  zoneId: string,
  action: "CREATE" | "UPSERT" | "DELETE",
  recordSet: {
    name: string;
    type: string;
    ttl?: number;
    values: string[];
  },
): Promise<void> {
  const normalizedName = recordSet.name.endsWith(".")
    ? recordSet.name
    : `${recordSet.name}.`;

  await client.send(
    new ChangeResourceRecordSetsCommand({
      HostedZoneId: zoneId,
      ChangeBatch: {
        Changes: [
          {
            Action: action as ChangeAction,
            ResourceRecordSet: {
              Name: normalizedName,
              Type: recordSet.type as RRType,
              TTL: recordSet.ttl ?? 300,
              ResourceRecords: recordSet.values.map((v) => ({
                Value: v,
              })),
            },
          },
        ],
      },
    }),
  );
}
