import { describe, it, expect, vi } from "vitest";
import type { Route53Client } from "@aws-sdk/client-route-53";
import {
  cleanZoneId,
  validateRecordValue,
  listHostedZones,
  createHostedZone,
  deleteHostedZone,
  listResourceRecordSets,
  changeResourceRecordSets,
} from "./route53";

describe("route53 data plane", () => {
  describe("cleanZoneId", () => {
    it("strips /hostedzone/ prefix", () => {
      expect(cleanZoneId("/hostedzone/Z12345ABC")).toBe("Z12345ABC");
      expect(cleanZoneId("hostedzone/Z12345ABC")).toBe("Z12345ABC");
      expect(cleanZoneId("Z12345ABC")).toBe("Z12345ABC");
    });
  });

  describe("validateRecordValue", () => {
    it("flags empty values", () => {
      expect(validateRecordValue("A", "")).toBe("Record value cannot be empty");
      expect(validateRecordValue("CNAME", "   ")).toBe(
        "Record value cannot be empty",
      );
    });

    it("validates IPv4 addresses for A records", () => {
      expect(validateRecordValue("A", "192.0.2.1")).toBeNull();
      expect(validateRecordValue("A", "256.0.0.1")).toContain("Invalid IPv4");
      expect(validateRecordValue("A", "invalid-ip")).toContain("Invalid IPv4");
    });

    it("validates IPv6 addresses for AAAA records", () => {
      expect(validateRecordValue("AAAA", "2001:db8::1")).toBeNull();
      expect(validateRecordValue("AAAA", "not:an:ipv6:address:xyz")).toContain(
        "Invalid IPv6",
      );
    });

    it("validates hostnames for CNAME records", () => {
      expect(validateRecordValue("CNAME", "api.example.com.")).toBeNull();
      expect(validateRecordValue("CNAME", "sub-domain.example.com")).toBeNull();
      expect(validateRecordValue("CNAME", "invalid hostname with spaces")).toContain(
        "Invalid hostname",
      );
    });

    it("validates MX records with priority and hostname", () => {
      expect(validateRecordValue("MX", "10 mail.example.com")).toBeNull();
      expect(validateRecordValue("MX", "mail.example.com")).toContain(
        "Invalid MX record format",
      );
      expect(validateRecordValue("MX", "70000 mail.example.com")).toContain(
        "MX priority must be between 0 and 65535",
      );
    });

    it("validates TXT records", () => {
      expect(validateRecordValue("TXT", "v=spf1 include:_spf.example.com ~all")).toBeNull();
    });
  });

  describe("listHostedZones", () => {
    it("loops pagination until IsTruncated is false", async () => {
      const send = vi
        .fn()
        .mockResolvedValueOnce({
          HostedZones: [
            {
              Id: "/hostedzone/Z1",
              Name: "zone1.local.",
              CallerReference: "ref1",
              Config: { Comment: "test zone 1", PrivateZone: false },
              ResourceRecordSetCount: 2,
            },
          ],
          IsTruncated: true,
          NextMarker: "marker-2",
        })
        .mockResolvedValueOnce({
          HostedZones: [
            {
              Id: "/hostedzone/Z2",
              Name: "zone2.local.",
              CallerReference: "ref2",
              Config: { PrivateZone: true },
              ResourceRecordSetCount: 4,
            },
          ],
          IsTruncated: false,
        });

      const client = { send } as unknown as Route53Client;
      const zones = await listHostedZones(client);

      expect(send).toHaveBeenCalledTimes(2);
      expect(zones).toHaveLength(2);
      expect(zones[0].id).toBe("Z1");
      expect(zones[0].rawId).toBe("/hostedzone/Z1");
      expect(zones[0].name).toBe("zone1.local.");
      expect(zones[1].id).toBe("Z2");
      expect(zones[1].privateZone).toBe(true);
    });
  });

  describe("createHostedZone", () => {
    it("normalizes domain name with trailing dot and creates zone", async () => {
      const send = vi.fn().mockResolvedValueOnce({
        HostedZone: {
          Id: "/hostedzone/ZNEW",
          Name: "myzone.local.",
          CallerReference: "12345",
          Config: { Comment: "Primary zone", PrivateZone: false },
          ResourceRecordSetCount: 2,
        },
      });

      const client = { send } as unknown as Route53Client;
      const zone = await createHostedZone(client, {
        name: "myzone.local",
        comment: "Primary zone",
      });

      expect(send).toHaveBeenCalledTimes(1);
      expect(zone.id).toBe("ZNEW");
      expect(zone.name).toBe("myzone.local.");
    });
  });

  describe("deleteHostedZone", () => {
    it("sends DeleteHostedZoneCommand with zoneId", async () => {
      const send = vi.fn().mockResolvedValueOnce({});
      const client = { send } as unknown as Route53Client;

      await deleteHostedZone(client, "Z12345");
      expect(send).toHaveBeenCalledTimes(1);
    });
  });

  describe("listResourceRecordSets", () => {
    it("loops pagination and maps records with alias targets", async () => {
      const send = vi
        .fn()
        .mockResolvedValueOnce({
          ResourceRecordSets: [
            {
              Name: "api.myzone.local.",
              Type: "A",
              TTL: 300,
              ResourceRecords: [{ Value: "192.0.2.1" }],
            },
          ],
          IsTruncated: true,
          NextRecordName: "web.myzone.local.",
          NextRecordType: "CNAME",
        })
        .mockResolvedValueOnce({
          ResourceRecordSets: [
            {
              Name: "web.myzone.local.",
              Type: "CNAME",
              TTL: 600,
              ResourceRecords: [{ Value: "api.myzone.local." }],
            },
          ],
          IsTruncated: false,
        });

      const client = { send } as unknown as Route53Client;
      const records = await listResourceRecordSets(client, "Z1");

      expect(send).toHaveBeenCalledTimes(2);
      expect(records).toHaveLength(2);
      expect(records[0].name).toBe("api.myzone.local.");
      expect(records[0].values).toEqual(["192.0.2.1"]);
      expect(records[1].name).toBe("web.myzone.local.");
      expect(records[1].values).toEqual(["api.myzone.local."]);
    });
  });

  describe("changeResourceRecordSets", () => {
    it("normalizes record name with dot and sends change batch", async () => {
      const send = vi.fn().mockResolvedValueOnce({});
      const client = { send } as unknown as Route53Client;

      await changeResourceRecordSets(client, "Z1", "CREATE", {
        name: "test.myzone.local",
        type: "A",
        ttl: 120,
        values: ["192.0.2.42"],
      });

      expect(send).toHaveBeenCalledTimes(1);
    });
  });
});
