import { test, expect } from "./fixtures";
import {
  DescribeInstancesCommand,
  TerminateInstancesCommand,
  DescribeKeyPairsCommand,
  DeleteKeyPairCommand,
  DescribeSecurityGroupsCommand,
  DeleteSecurityGroupCommand,
} from "@aws-sdk/client-ec2";
import { requireLocalStack, makeClients, unique } from "./helpers";

test.describe("EC2 e2e", () => {
  const { ec2 } = makeClients();
  const sgName = unique("web-sg");
  const keyName = unique("ssh-key");
  const instanceName = unique("ec2-inst");

  test.beforeAll(async () => {
    await requireLocalStack();
  });

  test.afterAll(async () => {
    // Best-effort cleanup
    try {
      const keysRes = await ec2.send(new DescribeKeyPairsCommand({}));
      for (const k of keysRes.KeyPairs ?? []) {
        if (k.KeyName && k.KeyName.includes("e2e")) {
          await ec2.send(new DeleteKeyPairCommand({ KeyName: k.KeyName }));
        }
      }
    } catch {
      // ignore
    }

    try {
      const sgsRes = await ec2.send(new DescribeSecurityGroupsCommand({}));
      for (const sg of sgsRes.SecurityGroups ?? []) {
        if (sg.GroupName && sg.GroupName.includes("e2e") && sg.GroupId) {
          await ec2.send(
            new DeleteSecurityGroupCommand({ GroupId: sg.GroupId }),
          );
        }
      }
    } catch {
      // ignore
    }

    try {
      const instsRes = await ec2.send(new DescribeInstancesCommand({}));
      const instIds: string[] = [];
      for (const res of instsRes.Reservations ?? []) {
        for (const inst of res.Instances ?? []) {
          if (inst.InstanceId && inst.State?.Name !== "terminated") {
            const hasE2e = inst.Tags?.some((t) =>
              t.Value?.includes("e2e"),
            );
            if (hasE2e) instIds.push(inst.InstanceId);
          }
        }
      }
      if (instIds.length > 0) {
        await ec2.send(
          new TerminateInstancesCommand({ InstanceIds: instIds }),
        );
      }
    } catch {
      // ignore
    }
  });

  test("full EC2 lifecycle: instances, key pairs, security groups with rule matrix", async ({
    page,
  }) => {
    await page.goto("/");

    // 1. Open EC2 service via sidebar
    await page
      .locator("aside")
      .getByRole("button", { name: /^EC2/ })
      .click();
    await expect(page.getByRole("heading", { name: "EC2" })).toBeVisible();
    await expect(page.getByText("Stateful Mock")).toBeVisible();

    // 2. Key Pairs Lifecycle
    await page.getByRole("tab", { name: /Key Pairs/i }).click();
    await page.getByRole("button", { name: "Create Key Pair" }).first().click();
    const kpDialog = page.getByRole("dialog");
    await expect(
      kpDialog.getByRole("heading", { name: /Create SSH Key Pair/i }),
    ).toBeVisible();
    await kpDialog.getByLabel("Key Pair Name").fill(keyName);
    await kpDialog.getByRole("button", { name: "Create Key Pair" }).click();

    // Assert key pair appears in table
    await expect(page.locator("table").getByText(keyName)).toBeVisible({
      timeout: 10_000,
    });

    // Delete key pair
    await page
      .getByRole("button", { name: new RegExp(`Delete key pair ${keyName}`) })
      .click();
    await page.getByRole("button", { name: "Delete" }).click();
    await expect(page.locator("table").getByText(keyName)).not.toBeVisible();

    // 3. Security Groups Lifecycle & Rule Matrix
    await page.getByRole("tab", { name: /Security Groups/i }).click();
    await page.getByRole("button", { name: "Create Security Group" }).first().click();
    const sgDialog = page.getByRole("dialog");
    await expect(
      sgDialog.getByRole("heading", { name: /Create Security Group/i }),
    ).toBeVisible();
    await sgDialog.getByLabel("Security Group Name").fill(sgName);
    await sgDialog.getByLabel("Description").fill("E2E Test Security Group");
    await sgDialog.getByRole("button", { name: "Create Security Group" }).click();

    // Assert appears in table
    const sgRow = page.locator("tr", { hasText: sgName });
    await expect(sgRow).toBeVisible({ timeout: 10_000 });

    // Manage Rules
    await sgRow.getByRole("button", { name: /Manage Rules/i }).click();
    await expect(
      page.getByRole("heading", { name: sgName }),
    ).toBeVisible();

    // Add Inbound Rule
    await page
      .getByRole("button", { name: "Add Inbound Rule" })
      .first()
      .click();
    const ruleDialog = page.getByRole("dialog");
    await expect(
      ruleDialog.getByRole("heading", { name: /Add Inbound Rule/i }),
    ).toBeVisible();
    await ruleDialog.getByLabel("Description").fill("Allow HTTPS traffic");
    await ruleDialog.getByRole("button", { name: "Save Rule" }).click();

    // Assert port 443 rule in matrix
    await expect(page.getByText("443")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Allow HTTPS traffic")).toBeVisible();

    // Revoke Rule
    await page
      .getByRole("button", { name: /Revoke rule for port 443/i })
      .click();
    await page.getByRole("button", { name: "Revoke" }).click();
    await expect(page.locator("table").getByText("Allow HTTPS traffic")).not.toBeVisible();

    // Delete Security Group
    await page.getByRole("button", { name: /^Delete$/i }).click();
    await page
      .getByRole("button", { name: "Delete Security Group" })
      .click();

    // Wait for SG tab to close and return to EC2
    await expect(page.getByRole("heading", { name: sgName })).not.toBeVisible();

    // 4. Mock Instances View & Launch
    await page.locator("aside").getByRole("button", { name: /^EC2/ }).click();
    await page.getByRole("tab", { name: /Instances/i }).click();
    await page
      .getByRole("button", { name: "Launch Instance" })
      .first()
      .click();
    const instDialog = page.getByRole("dialog");
    await expect(
      instDialog.getByRole("heading", { name: /Launch Mock Instance/i }),
    ).toBeVisible();
    await instDialog.getByLabel(/Name tag/i).fill(instanceName);
    await instDialog.getByRole("button", { name: "Launch Instance" }).click();

    // Assert instance appears
    await expect(page.locator("table").getByText(instanceName)).toBeVisible({ timeout: 10_000 });
  });
});
