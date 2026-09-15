import {
  type ACMClient,
  ListCertificatesCommand,
  DescribeCertificateCommand,
  ImportCertificateCommand,
  RequestCertificateCommand,
  DeleteCertificateCommand,
} from "@aws-sdk/client-acm";

export interface CertificateSummary {
  arn: string;
  domainName: string;
  status: string;
  type: string;
}

export interface CertificateDetail {
  arn: string;
  domainName: string;
  status: string;
  type: string;
  subject: string;
  issuer: string;
  keyAlgorithm: string;
  notBefore?: Date;
  notAfter?: Date;
  validationMethod: string;
  cnameRecord?: { name: string; type: string; value: string };
  sans: string[];
}

export async function listCertificates(
  client: ACMClient,
): Promise<CertificateSummary[]> {
  const out: CertificateSummary[] = [];
  let nextToken: string | undefined;
  do {
    const res = await client.send(
      new ListCertificatesCommand({ NextToken: nextToken }),
    );
    for (const c of res.CertificateSummaryList ?? []) {
      if (!c.CertificateArn) continue;
      out.push({
        arn: c.CertificateArn,
        domainName: c.DomainName ?? "",
        status: c.Status ?? "",
        type: c.Type ?? "",
      });
    }
    nextToken = res.NextToken;
  } while (nextToken);
  return out;
}

export async function describeCertificate(
  client: ACMClient,
  arn: string,
): Promise<CertificateDetail> {
  const res = await client.send(new DescribeCertificateCommand({ CertificateArn: arn }));
  const c = res.Certificate;
  if (!c?.CertificateArn) throw new Error("ACM returned no certificate detail");
  const validation = c.DomainValidationOptions?.[0];
  return {
    arn: c.CertificateArn,
    domainName: c.DomainName ?? "",
    status: c.Status ?? "",
    type: c.Type ?? "",
    subject: c.Subject ?? "",
    issuer: c.Issuer ?? "",
    keyAlgorithm: c.KeyAlgorithm ?? "",
    notBefore: c.NotBefore,
    notAfter: c.NotAfter,
    validationMethod: validation?.ValidationMethod ?? "",
    cnameRecord: validation?.ResourceRecord
      ? {
          name: validation.ResourceRecord.Name ?? "",
          type: validation.ResourceRecord.Type ?? "",
          value: validation.ResourceRecord.Value ?? "",
        }
      : undefined,
    sans: c.SubjectAlternativeNames ?? [],
  };
}

export async function importCertificate(
  client: ACMClient,
  input: { certificate: string; privateKey: string },
): Promise<string> {
  const res = await client.send(
    new ImportCertificateCommand({
      Certificate: new TextEncoder().encode(input.certificate),
      PrivateKey: new TextEncoder().encode(input.privateKey),
    }),
  );
  if (!res.CertificateArn) throw new Error("ACM imported no certificate");
  return res.CertificateArn;
}

export async function requestCertificate(
  client: ACMClient,
  input: { domainName: string },
): Promise<string> {
  const res = await client.send(
    new RequestCertificateCommand({
      DomainName: input.domainName,
      ValidationMethod: "DNS",
    }),
  );
  if (!res.CertificateArn) throw new Error("ACM requested no certificate");
  return res.CertificateArn;
}

export async function deleteCertificate(client: ACMClient, arn: string): Promise<void> {
  await client.send(new DeleteCertificateCommand({ CertificateArn: arn }));
}
