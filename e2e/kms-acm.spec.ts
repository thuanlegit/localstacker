import { test, expect } from "./fixtures";
import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ListKeysCommand } from "@aws-sdk/client-kms";
import {
  DeleteCertificateCommand,
  ListCertificatesCommand,
} from "@aws-sdk/client-acm";
import { requireLocalStack, makeClients, unique } from "./helpers";

test.describe("KMS & ACM e2e", () => {
  const { kms, acm } = makeClients();
  const keyDescription = unique("e2e-key");
  const aliasName = `alias/${unique("e2e-alias")}`;
  const requestDomain = `${unique("e2e-req")}.example.com`;
  const importDomain = `${unique("e2e-imp")}.example.com`;

  let pemDir: string;
  let newKeyId = "";
  let requestArn = "";
  let importedArn = "";

  test.beforeAll(async () => {
    await requireLocalStack();
    // Generate a self-signed PEM pair for the import flow.
    pemDir = mkdtempSync(join(tmpdir(), "acm-pem-"));
    execSync(
      `openssl req -x509 -newkey rsa:2048 -sha256 -days 1 -nodes ` +
        `-keyout ${join(pemDir, "key.pem")} -out ${join(pemDir, "cert.pem")} ` +
        `-subj "/CN=${importDomain}"`,
      { stdio: "ignore" },
    );
  });

  test.afterAll(async () => {
    rmSync(pemDir, { recursive: true, force: true });
    for (const arn of [requestArn, importedArn]) {
      if (!arn) continue;
      try {
        await acm.send(new DeleteCertificateCommand({ CertificateArn: arn }));
      } catch (err) {
        console.warn(`Cert cleanup failed for ${arn}:`, err);
      }
    }
  });

  test("creates a key, aliases it, round-trips encrypt/decrypt, and manages certificates", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await requireLocalStack();
    await page.goto("/");

    // ---------- KMS ----------
    const keyIdsBefore = new Set(
      (await kms.send(new ListKeysCommand({}))).Keys?.map((k) => k.KeyId) ?? [],
    );

    await page
      .locator("aside")
      .getByRole("button", { name: "KMS Keys & encryption" })
      .click();
    await page.getByRole("button", { name: "Create key" }).click();
    const keyDialog = page.getByRole("dialog");
    await expect(keyDialog).toBeVisible();
    await keyDialog.getByLabel("Description (optional)").fill(keyDescription);
    await keyDialog.getByRole("button", { name: "Create key" }).click();
    await expect(keyDialog).not.toBeVisible();

    // Find the newly created key id by diffing ListKeys.
    for (let i = 0; i < 20; i++) {
      const listed = (await kms.send(new ListKeysCommand({}))).Keys ?? [];
      const created = listed.find((k) => k.KeyId && !keyIdsBefore.has(k.KeyId));
      if (created?.KeyId) {
        newKeyId = created.KeyId;
        break;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    expect(newKeyId).toBeTruthy();

    // Open the key view and create an alias.
    await page.getByText(newKeyId).first().click();
    await expect(page.getByRole("button", { name: "Create alias" })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole("button", { name: "Create alias" }).click();
    const aliasDialog = page.getByRole("dialog");
    await expect(aliasDialog).toBeVisible();
    await aliasDialog.getByLabel("Alias name").fill(aliasName);
    await aliasDialog.getByRole("button", { name: "Create alias" }).click();
    await expect(page.getByText(aliasName).first()).toBeVisible({ timeout: 15_000 });

    // Round-trip: plaintext -> Encrypt -> base64 -> Decrypt -> plaintext.
    const secret = `e2e-secret-${Date.now()}`;
    await page.getByLabel("Plaintext").fill(secret);
    await page.getByRole("button", { name: /Encrypt/ }).click();
    await expect
      .poll(async () => page.getByLabel("Ciphertext (base64)").inputValue(), {
        timeout: 15_000,
      })
      .not.toBe("");
    await page.getByRole("button", { name: /Decrypt/ }).click();
    await expect
      .poll(async () => page.getByLabel("Plaintext").inputValue(), { timeout: 15_000 })
      .toBe(secret);

    // ---------- ACM ----------
    await page.locator("aside").getByRole("button", { name: "ACM Certificates" }).click();

    // Request a DNS-validated certificate via the UI.
    await page.getByRole("button", { name: "Request certificate" }).click();
    const reqDialog = page.getByRole("dialog");
    await expect(reqDialog).toBeVisible();
    await reqDialog.getByLabel("Domain name").fill(requestDomain);
    await reqDialog.getByRole("button", { name: "Request", exact: true }).click();
    await expect(reqDialog).not.toBeVisible();

    await expect(async () => {
      await page.getByRole("button", { name: "Refresh" }).click();
      await expect(page.getByText(requestDomain).first()).toBeVisible();
    }).toPass({ timeout: 20_000 });

    // Expand the row: detail drawer shows the DNS validation token.
    await page.getByText(requestDomain).first().click();
    await expect(page.getByText("DNS validation record")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/\.acm-validations\.aws\./).first()).toBeVisible();

    // Resolve the request ARN for cleanup.
    const certsListed = await acm.send(new ListCertificatesCommand({}));
    requestArn =
      certsListed.CertificateSummaryList?.find((c) => c.DomainName === requestDomain)
        ?.CertificateArn ?? "";

    // Import a self-signed PEM pair generated in beforeAll.
    const certificate = readFileSync(join(pemDir, "cert.pem"), "utf8");
    const privateKey = readFileSync(join(pemDir, "key.pem"), "utf8");
    await page.getByRole("button", { name: "Import", exact: true }).click();
    const importDialog = page.getByRole("dialog");
    await expect(importDialog).toBeVisible();
    await importDialog.getByLabel("Certificate (PEM)").fill(certificate);
    await importDialog.getByLabel("Private key (PEM)").fill(privateKey);
    await importDialog.getByRole("button", { name: "Import", exact: true }).click();
    await expect(importDialog).not.toBeVisible();

    await expect(async () => {
      await page.getByRole("button", { name: "Refresh" }).click();
      await expect(page.getByText(importDomain).first()).toBeVisible();
    }).toPass({ timeout: 20_000 });

    // Imported certs are ISSUED; expand to confirm the detail drawer shows the subject.
    await page.getByText(importDomain).first().click();
    await expect(page.getByText(`CN=${importDomain}`)).toBeVisible({ timeout: 15_000 });

    const certsAfter = await acm.send(new ListCertificatesCommand({}));
    importedArn =
      certsAfter.CertificateSummaryList?.find((c) => c.DomainName === importDomain)
        ?.CertificateArn ?? "";
  });
});
