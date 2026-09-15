import { describe, it, expect, vi } from "vitest";
import type { ACMClient } from "@aws-sdk/client-acm";
import {
  listCertificates,
  describeCertificate,
  importCertificate,
  requestCertificate,
  deleteCertificate,
} from "./acm";

describe("acm data plane", () => {
  describe("listCertificates", () => {
    it("paginates by NextToken and maps summaries", async () => {
      const send = vi
        .fn()
        .mockResolvedValueOnce({
          CertificateSummaryList: [
            {
              CertificateArn: "arn:c1",
              DomainName: "a.example.com",
              Status: "ISSUED",
              Type: "AMAZON_ISSUED",
            },
          ],
          NextToken: "t1",
        })
        .mockResolvedValueOnce({
          CertificateSummaryList: [
            {
              CertificateArn: "arn:c2",
              DomainName: "b.example.com",
              Status: "PENDING_VALIDATION",
              Type: "IMPORTED",
            },
          ],
        });

      const client = { send } as unknown as ACMClient;
      const certs = await listCertificates(client);

      expect(send).toHaveBeenCalledTimes(2);
      expect(send).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ input: { NextToken: "t1" } }),
      );
      expect(certs).toEqual([
        {
          arn: "arn:c1",
          domainName: "a.example.com",
          status: "ISSUED",
          type: "AMAZON_ISSUED",
        },
        {
          arn: "arn:c2",
          domainName: "b.example.com",
          status: "PENDING_VALIDATION",
          type: "IMPORTED",
        },
      ]);
    });
  });

  describe("describeCertificate", () => {
    it("maps detail including DNS validation record", async () => {
      const send = vi.fn().mockResolvedValueOnce({
        Certificate: {
          CertificateArn: "arn:c1",
          DomainName: "a.example.com",
          Status: "PENDING_VALIDATION",
          Type: "AMAZON_ISSUED",
          Subject: "CN=a.example.com",
          Issuer: "Amazon",
          NotBefore: new Date("2026-01-01T00:00:00Z"),
          NotAfter: new Date("2027-01-01T00:00:00Z"),
          KeyAlgorithm: "RSA-2048",
          DomainValidationOptions: [
            {
              ValidationMethod: "DNS",
              ResourceRecord: {
                Name: "_token.a.example.com.",
                Type: "CNAME",
                Value: "_value.acm-validations.aws.",
              },
            },
          ],
        },
      });
      const client = { send } as unknown as ACMClient;

      const detail = await describeCertificate(client, "arn:c1");
      expect(detail).toMatchObject({
        arn: "arn:c1",
        domainName: "a.example.com",
        status: "PENDING_VALIDATION",
        validationMethod: "DNS",
        cnameRecord: {
          name: "_token.a.example.com.",
          type: "CNAME",
          value: "_value.acm-validations.aws.",
        },
      });
    });

    it("throws when the certificate detail is missing", async () => {
      const send = vi.fn().mockResolvedValueOnce({});
      const client = { send } as unknown as ACMClient;
      await expect(describeCertificate(client, "arn:c1")).rejects.toThrow(/certificate/i);
    });
  });

  describe("mutating operations", () => {
    it("imports a PEM pair and returns the arn", async () => {
      const send = vi.fn().mockResolvedValueOnce({ CertificateArn: "arn:new" });
      const client = { send } as unknown as ACMClient;
      const arn = await importCertificate(client, {
        certificate: "-----BEGIN CERTIFICATE-----",
        privateKey: "-----BEGIN PRIVATE KEY-----",
      });

      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            Certificate: new TextEncoder().encode("-----BEGIN CERTIFICATE-----"),
            PrivateKey: new TextEncoder().encode("-----BEGIN PRIVATE KEY-----"),
          },
        }),
      );
      expect(arn).toBe("arn:new");
    });

    it("requests a DNS-validated certificate", async () => {
      const send = vi.fn().mockResolvedValueOnce({ CertificateArn: "arn:pending" });
      const client = { send } as unknown as ACMClient;
      const arn = await requestCertificate(client, { domainName: "x.example.com" });

      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: { DomainName: "x.example.com", ValidationMethod: "DNS" },
        }),
      );
      expect(arn).toBe("arn:pending");
    });

    it("deletes by arn", async () => {
      const send = vi.fn().mockResolvedValueOnce({});
      const client = { send } as unknown as ACMClient;
      await deleteCertificate(client, "arn:c1");
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({ input: { CertificateArn: "arn:c1" } }),
      );
    });
  });
});
