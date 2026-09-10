import {
  type SESClient,
  type ListIdentitiesCommandOutput,
  ListIdentitiesCommand,
  GetIdentityVerificationAttributesCommand,
  VerifyEmailIdentityCommand,
  VerifyDomainIdentityCommand,
  DeleteIdentityCommand,
  SendEmailCommand,
} from "@aws-sdk/client-ses";
import { platformFetch } from "./fetch";

export interface IdentitySummary {
  identity: string;
  type: "EmailAddress" | "Domain";
  status?: string;
  verificationToken?: string;
}

export interface CapturedEmail {
  Id: string;
  Timestamp?: string;
  Source?: string;
  Destination?: {
    ToAddresses?: string[];
    CcAddresses?: string[];
    BccAddresses?: string[];
  };
  Subject?: string;
  Body?: {
    text_part?: string;
    html_part?: string;
  };
  RawData?: string;
}

export function parseAttachments(
  rawData?: string,
): Array<{ filename: string; size: number }> {
  if (!rawData) return [];

  const attachments: Array<{ filename: string; size: number }> = [];

  const boundaryMatch = rawData.match(/boundary="?([^"\r\n;]+)"?/i);
  if (!boundaryMatch) {
    const dispMatch = rawData.match(
      /content-disposition:\s*attachment[^;\r\n]*;\s*filename="?([^"\r\n;]+)"?/i,
    );
    if (dispMatch) {
      const filename = dispMatch[1].trim();
      const bodyIdx =
        rawData.indexOf("\r\n\r\n") !== -1
          ? rawData.indexOf("\r\n\r\n") + 4
          : rawData.indexOf("\n\n") !== -1
            ? rawData.indexOf("\n\n") + 2
            : -1;
      const bodyContent = bodyIdx !== -1 ? rawData.slice(bodyIdx).trim() : "";
      attachments.push({ filename, size: bodyContent.length });
    }
    return attachments;
  }

  const boundary = boundaryMatch[1];
  const parts = rawData.split(
    new RegExp(`--${boundary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:--)?`),
  );

  for (const part of parts) {
    const dispMatch = part.match(
      /content-disposition:\s*attachment[^;\r\n]*;\s*filename="?([^"\r\n;]+)"?/i,
    );
    if (dispMatch) {
      const filename = dispMatch[1].trim();
      const sepMatch = part.match(/\r?\n\r?\n/);
      let size = 0;
      if (sepMatch && sepMatch.index !== undefined) {
        const bodyText = part.slice(sepMatch.index + sepMatch[0].length).trim();
        const cleanB64 = bodyText.replace(/\s+/g, "");
        if (/^[A-Za-z0-9+/=]+$/.test(cleanB64) && cleanB64.length > 0) {
          const padding = (cleanB64.match(/=+$/) || [""])[0].length;
          size = Math.floor((cleanB64.length * 3) / 4) - padding;
        } else {
          size = bodyText.length;
        }
      }
      attachments.push({ filename, size: Math.max(size, 0) });
    }
  }

  return attachments;
}

export async function listIdentities(
  client: SESClient,
): Promise<IdentitySummary[]> {
  let nextToken: string | undefined = undefined;
  const rawIdentities: string[] = [];

  do {
    const res: ListIdentitiesCommandOutput = await client.send(
      new ListIdentitiesCommand({ NextToken: nextToken }),
    );
    for (const id of res.Identities ?? []) {
      rawIdentities.push(id);
    }
    nextToken = res.NextToken;
  } while (nextToken);

  if (rawIdentities.length === 0) {
    return [];
  }

  const attrRes = await client.send(
    new GetIdentityVerificationAttributesCommand({
      Identities: rawIdentities,
    }),
  );

  const attributes = attrRes.VerificationAttributes ?? {};

  const summaries: IdentitySummary[] = rawIdentities.map((identity) => {
    const attr = attributes[identity];
    return {
      identity,
      type: identity.includes("@") ? "EmailAddress" : "Domain",
      status: attr?.VerificationStatus,
      verificationToken: attr?.VerificationToken,
    };
  });

  return summaries.sort((a, b) => a.identity.localeCompare(b.identity));
}

export async function verifyEmailIdentity(
  client: SESClient,
  emailAddress: string,
): Promise<void> {
  await client.send(
    new VerifyEmailIdentityCommand({ EmailAddress: emailAddress }),
  );
}

export async function verifyDomainIdentity(
  client: SESClient,
  domain: string,
): Promise<string> {
  const res = await client.send(
    new VerifyDomainIdentityCommand({ Domain: domain }),
  );
  if (!res.VerificationToken) {
    throw new Error("VerifyDomainIdentity returned no token");
  }
  return res.VerificationToken;
}

export async function deleteIdentity(
  client: SESClient,
  identity: string,
): Promise<void> {
  await client.send(new DeleteIdentityCommand({ Identity: identity }));
}

export async function sendEmail(
  client: SESClient,
  {
    source,
    to,
    cc,
    bcc,
    subject,
    text,
    html,
  }: {
    source: string;
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    text?: string;
    html?: string;
  },
): Promise<string> {
  if (!text && !html) {
    throw new Error("Email requires a text or HTML body");
  }

  const res = await client.send(
    new SendEmailCommand({
      Source: source,
      Destination: {
        ToAddresses: to,
        CcAddresses: cc && cc.length > 0 ? cc : undefined,
        BccAddresses: bcc && bcc.length > 0 ? bcc : undefined,
      },
      Message: {
        Subject: { Data: subject },
        Body: {
          Text: text ? { Data: text } : undefined,
          Html: html ? { Data: html } : undefined,
        },
      },
    }),
  );

  return res.MessageId ?? "";
}

export async function listCapturedMessages(
  endpoint: string,
  opts?: {
    authToken?: string;
    fetchFn?: (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => Promise<Response>;
    signal?: AbortSignal;
  },
): Promise<CapturedEmail[]> {
  const fetchFn = opts?.fetchFn ?? platformFetch;
  const url = `${endpoint.replace(/\/+$/, "")}/_localstack/ses`;
  const headers: Record<string, string> = { accept: "application/json" };
  if (opts?.authToken) headers.authorization = opts.authToken;

  const res = await fetchFn(url, { headers, signal: opts?.signal });
  if (!res.ok) {
    throw new Error(`SES mailbox unavailable (HTTP ${res.status})`);
  }
  const body = (await res.json()) as { messages?: CapturedEmail[] };
  return body.messages ?? [];
}

export async function clearCapturedMessages(
  endpoint: string,
  opts?: {
    authToken?: string;
    fetchFn?: (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => Promise<Response>;
  },
): Promise<void> {
  const fetchFn = opts?.fetchFn ?? platformFetch;
  const url = `${endpoint.replace(/\/+$/, "")}/_localstack/ses`;
  const headers: Record<string, string> = { accept: "application/json" };
  if (opts?.authToken) headers.authorization = opts.authToken;

  const res = await fetchFn(url, { method: "DELETE", headers });
  if (!res.ok) {
    throw new Error(`SES mailbox unavailable (HTTP ${res.status})`);
  }
}
