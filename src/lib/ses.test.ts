import { describe, it, expect, vi } from "vitest";
import type { SESClient } from "@aws-sdk/client-ses";
import {
  listIdentities,
  verifyEmailIdentity,
  verifyDomainIdentity,
  deleteIdentity,
  sendEmail,
  listCapturedMessages,
  clearCapturedMessages,
  parseAttachments,
} from "./ses";

describe("ses data plane", () => {
  describe("parseAttachments", () => {
    it("returns empty array for null/undefined/empty string", () => {
      expect(parseAttachments()).toEqual([]);
      expect(parseAttachments("")).toEqual([]);
      expect(parseAttachments("Hello world")).toEqual([]);
    });

    it("parses MIME attachment with boundary and content-disposition", () => {
      const mime = [
        'Content-Type: multipart/mixed; boundary="BOUNDARY-123"',
        "",
        "--BOUNDARY-123",
        "Content-Type: text/plain",
        "",
        "Email text",
        "--BOUNDARY-123",
        'Content-Type: application/pdf; name="invoice.pdf"',
        'Content-Disposition: attachment; filename="invoice.pdf"',
        "Content-Transfer-Encoding: base64",
        "",
        "SGVsbG8gV29ybGQ=",
        "--BOUNDARY-123--",
      ].join("\r\n");

      const attachments = parseAttachments(mime);
      expect(attachments).toEqual([
        {
          filename: "invoice.pdf",
          size: 11, // "Hello World" decoded is 11 bytes
        },
      ]);
    });

    it("returns empty array for multipart message without attachments", () => {
      const mime = [
        'Content-Type: multipart/alternative; boundary="BOUNDARY-ALT"',
        "",
        "--BOUNDARY-ALT",
        "Content-Type: text/plain",
        "",
        "Just text",
        "--BOUNDARY-ALT--",
      ].join("\r\n");

      expect(parseAttachments(mime)).toEqual([]);
    });
  });

  describe("listIdentities", () => {
    it("lists identities and fans out to get verification attributes", async () => {
      const send = vi
        .fn()
        .mockResolvedValueOnce({
          Identities: ["zebra.com", "user@example.com"],
        })
        .mockResolvedValueOnce({
          VerificationAttributes: {
            "zebra.com": {
              VerificationStatus: "Pending",
              VerificationToken: "token-zebra",
            },
            "user@example.com": {
              VerificationStatus: "Success",
            },
          },
        });

      const client = { send } as unknown as SESClient;
      const identities = await listIdentities(client);

      expect(send).toHaveBeenCalledTimes(2);
      expect(identities).toEqual([
        {
          identity: "user@example.com",
          type: "EmailAddress",
          status: "Success",
          verificationToken: undefined,
        },
        {
          identity: "zebra.com",
          type: "Domain",
          status: "Pending",
          verificationToken: "token-zebra",
        },
      ]);
    });

    it("returns empty array when no identities exist", async () => {
      const send = vi.fn().mockResolvedValueOnce({
        Identities: [],
      });
      const client = { send } as unknown as SESClient;
      const identities = await listIdentities(client);

      expect(send).toHaveBeenCalledTimes(1);
      expect(identities).toEqual([]);
    });
  });

  describe("verifyEmailIdentity", () => {
    it("calls VerifyEmailIdentityCommand", async () => {
      const send = vi.fn().mockResolvedValueOnce({});
      const client = { send } as unknown as SESClient;
      await verifyEmailIdentity(client, "test@example.com");

      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: { EmailAddress: "test@example.com" },
        }),
      );
    });
  });

  describe("verifyDomainIdentity", () => {
    it("returns verification token", async () => {
      const send = vi.fn().mockResolvedValueOnce({
        VerificationToken: "tok-abc",
      });
      const client = { send } as unknown as SESClient;
      const token = await verifyDomainIdentity(client, "example.com");

      expect(token).toBe("tok-abc");
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: { Domain: "example.com" },
        }),
      );
    });

    it("throws when VerifyDomainIdentity returns no token", async () => {
      const send = vi.fn().mockResolvedValueOnce({});
      const client = { send } as unknown as SESClient;

      await expect(
        verifyDomainIdentity(client, "example.com"),
      ).rejects.toThrow("VerifyDomainIdentity returned no token");
    });
  });

  describe("deleteIdentity", () => {
    it("calls DeleteIdentityCommand", async () => {
      const send = vi.fn().mockResolvedValueOnce({});
      const client = { send } as unknown as SESClient;
      await deleteIdentity(client, "example.com");

      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: { Identity: "example.com" },
        }),
      );
    });
  });

  describe("sendEmail", () => {
    it("sends email with text and HTML bodies", async () => {
      const send = vi.fn().mockResolvedValueOnce({
        MessageId: "msg-12345",
      });
      const client = { send } as unknown as SESClient;

      const id = await sendEmail(client, {
        source: "sender@example.com",
        to: ["to@example.com"],
        cc: ["cc@example.com"],
        bcc: ["bcc@example.com"],
        subject: "Hello",
        text: "Plaintext body",
        html: "<p>HTML body</p>",
      });

      expect(id).toBe("msg-12345");
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            Source: "sender@example.com",
            Destination: {
              ToAddresses: ["to@example.com"],
              CcAddresses: ["cc@example.com"],
              BccAddresses: ["bcc@example.com"],
            },
            Message: {
              Subject: { Data: "Hello" },
              Body: {
                Text: { Data: "Plaintext body" },
                Html: { Data: "<p>HTML body</p>" },
              },
            },
          },
        }),
      );
    });

    it("throws when both text and html body are missing", async () => {
      const send = vi.fn();
      const client = { send } as unknown as SESClient;

      await expect(
        sendEmail(client, {
          source: "sender@example.com",
          to: ["to@example.com"],
          subject: "Hello",
        }),
      ).rejects.toThrow("Email requires a text or HTML body");
      expect(send).not.toHaveBeenCalled();
    });
  });

  describe("listCapturedMessages", () => {
    it("fetches messages from /_localstack/ses with auth token and parse messages", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          messages: [
            {
              Id: "msg-1",
              Source: "sender@example.com",
              Subject: "Test subject",
              Timestamp: "2026-01-01T00:00:00Z",
              Body: { text_part: "Hello", html_part: "<p>Hello</p>" },
            },
          ],
        }),
      });

      const messages = await listCapturedMessages("http://localhost:4566/", {
        authToken: "test-auth-token",
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:4566/_aws/ses",
        expect.objectContaining({
          headers: {
            accept: "application/json",
            authorization: "test-auth-token",
          },
        }),
      );
      expect(messages).toHaveLength(1);
      expect(messages[0].Id).toBe("msg-1");
      expect(messages[0].Subject).toBe("Test subject");
    });

    it("throws error when response not ok (e.g. 404)", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 404 })
        .mockResolvedValueOnce({ ok: false, status: 404 });

      await expect(
        listCapturedMessages("http://localhost:4566", {
          fetchFn: mockFetch as unknown as typeof fetch,
        }),
      ).rejects.toThrow("SES mailbox unavailable (HTTP 404)");
    });
  });

  describe("clearCapturedMessages", () => {
    it("issues DELETE to /_localstack/ses", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      await clearCapturedMessages("http://localhost:4566", {
        authToken: "tok",
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:4566/_aws/ses",
        expect.objectContaining({
          method: "DELETE",
          headers: {
            accept: "application/json",
            authorization: "tok",
          },
        }),
      );
    });

    it("throws error on DELETE failure", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      await expect(
        clearCapturedMessages("http://localhost:4566", {
          fetchFn: mockFetch as unknown as typeof fetch,
        }),
      ).rejects.toThrow("SES mailbox unavailable (HTTP 500)");
    });
  });
});
