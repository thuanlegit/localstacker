import { test, expect } from "./fixtures";
import {
  ListAccessKeysCommand,
  DeleteAccessKeyCommand,
  DeleteUserCommand,
  ListRolePoliciesCommand,
  DeleteRolePolicyCommand,
  DeleteRoleCommand,
} from "@aws-sdk/client-iam";
import { requireLocalStack, makeClients, unique } from "./helpers";

test.describe("IAM e2e", () => {
  const { iam } = makeClients();
  const roleName = unique("Role");
  const userName = unique("User");

  test.beforeAll(async () => {
    await requireLocalStack();
  });

  test.afterAll(async () => {
    // Cleanup user
    try {
      const keysRes = await iam.send(
        new ListAccessKeysCommand({ UserName: userName }),
      );
      if (keysRes.AccessKeyMetadata) {
        for (const k of keysRes.AccessKeyMetadata) {
          if (k.AccessKeyId) {
            await iam.send(
              new DeleteAccessKeyCommand({
                UserName: userName,
                AccessKeyId: k.AccessKeyId,
              }),
            );
          }
        }
      }
      await iam.send(new DeleteUserCommand({ UserName: userName }));
    } catch {
      // Best-effort cleanup
    }

    // Cleanup role
    try {
      const polRes = await iam.send(
        new ListRolePoliciesCommand({ RoleName: roleName }),
      );
      if (polRes.PolicyNames) {
        for (const p of polRes.PolicyNames) {
          await iam.send(
            new DeleteRolePolicyCommand({
              RoleName: roleName,
              PolicyName: p,
            }),
          );
        }
      }
      await iam.send(new DeleteRoleCommand({ RoleName: roleName }));
    } catch {
      // Best-effort cleanup
    }
  });

  test("creates role, adds inline policy, creates user, generates and deactivates access key", async ({
    page,
  }) => {
    await page.goto("/");

    // 1. Open IAM service via sidebar
    await page
      .locator("aside")
      .getByRole("button", { name: /^IAM/ })
      .click();
    await expect(page.getByRole("heading", { name: "IAM" })).toBeVisible();

    // 2. Create IAM Role via UI
    await page.getByRole("button", { name: "Create Role" }).click();
    const roleDialog = page.getByRole("dialog");
    await expect(roleDialog.getByText("Create IAM Role")).toBeVisible();
    await roleDialog.getByLabel("Role Name").fill(roleName);
    await roleDialog.getByLabel("Description (optional)").fill("E2E Test Role");
    await roleDialog.getByRole("button", { name: "Create Role" }).click();

    // Role tab should be opened
    await expect(page.getByRole("heading", { name: roleName })).toBeVisible();
    // Trust relationship should be visible
    await expect(page.getByText('"sts:AssumeRole"')).toBeVisible();

    // 3. Add Inline Policy to Role
    const inlineTab = page.getByRole("tab", { name: /Inline Policies/ });
    await inlineTab.click();
    await page.getByRole("button", { name: "Add Inline Policy" }).click();

    const policyDialog = page.getByRole("dialog");
    await expect(policyDialog.getByText("Add Inline Policy")).toBeVisible();
    await policyDialog.getByLabel("Policy Name").fill("S3ReadAccess");

    const policyJson = JSON.stringify(
      {
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Action: "s3:GetObject",
            Resource: "*",
          },
        ],
      },
      null,
      2,
    );
    await policyDialog.getByLabel(/Policy Document/).fill(policyJson);
    await policyDialog.getByRole("button", { name: "Save Policy" }).click();

    // Assert inline policy appears and is rendered in PolicyJsonViewer
    await expect(page.getByText("S3ReadAccess").first()).toBeVisible();
    await expect(page.getByText('"s3:GetObject"')).toBeVisible();

    // 4. Navigate back to IAM service overview
    await page
      .locator("aside")
      .getByRole("button", { name: /^IAM/ })
      .click();

    // Switch to Users tab
    const usersTab = page.getByRole("tab", { name: /Users/ });
    await usersTab.click();

    // 5. Create IAM User
    await page.getByRole("button", { name: "Create User" }).click();
    const userDialog = page.getByRole("dialog");
    await expect(userDialog.getByRole("heading", { name: "Create IAM User" })).toBeVisible();
    await userDialog.getByLabel("User Name").fill(userName);
    await userDialog.getByRole("button", { name: "Create User" }).click();

    // User detail tab should be opened
    await expect(page.getByRole("heading", { name: userName })).toBeVisible();

    // 6. Generate Access Key
    await page.getByRole("button", { name: "Create Access Key" }).click();
    const keyDialog = page.getByRole("dialog");
    await expect(keyDialog.getByRole("heading", { name: "Access Key Created" })).toBeVisible();
    await expect(
      keyDialog.getByText(/Secret Access Key cannot be viewed again/),
    ).toBeVisible();
    await keyDialog.getByRole("button", { name: "Done" }).click();

    // Assert key is listed with Active status
    await expect(page.getByText("Active")).toBeVisible();

    // 7. Toggle Access Key status (Active -> Inactive)
    const deactivateBtn = page.getByRole("button", { name: "Deactivate" });
    await deactivateBtn.click();
    await expect(page.getByText("Inactive").first()).toBeVisible();
  });
});
