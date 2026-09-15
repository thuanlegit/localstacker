import { test, expect } from "./fixtures";
import { setTimeout as delay } from "node:timers/promises";
import {
  CreateStackCommand,
  DeleteStackCommand,
  ListStacksCommand,
} from "@aws-sdk/client-cloudformation";
import { requireLocalStack, makeClients, unique } from "./helpers";

test.describe("CloudFormation & Resolver e2e", () => {
  const { cloudformation } = makeClients();
  const stackName = unique("e2e-stack").replace(/_/g, "-");
  const template = JSON.stringify({
    Resources: { Topic: { Type: "AWS::SNS::Topic" } },
  });

  test.beforeAll(async () => {
    await requireLocalStack();
  });

  test.afterAll(async () => {
    try {
      await cloudformation.send(new DeleteStackCommand({ StackName: stackName }));
    } catch (err) {
      console.warn(`Stack cleanup failed for ${stackName}:`, err);
    }
  });

  test("inspects a stack: template, events, resources; resolver sections render", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await requireLocalStack();
    await page.goto("/");

    // 1. Create a stack via SDK (deploy-from-UI deferred per plan)
    await cloudformation.send(
      new CreateStackCommand({ StackName: stackName, TemplateBody: template }),
    );
    for (let i = 0; i < 30; i++) {
      const listed = await cloudformation.send(new ListStacksCommand({}));
      const found = listed.StackSummaries?.find(
        (s) => s.StackName === stackName && s.StackStatus === "CREATE_COMPLETE",
      );
      if (found) break;
      await delay(500);
    }

    // 2. The stack appears in the service view
    await page
      .locator("aside")
      .getByRole("button", { name: "CloudFormation Stacks & resources" })
      .click();
    await expect(page.getByText(stackName).first()).toBeVisible({ timeout: 15_000 });

    // 3. Open the stack view: template, events, and resources all render
    await page.getByText(stackName).first().click();
    await expect(page.getByText(/CREATE COMPLETE/).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/"Topic"/).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("AWS::SNS::Topic").first()).toBeVisible();
    await expect(page.getByText("TopicArn").or(page.getByText("No outputs declared."))).toBeVisible();

    // 4. Back to the service tab, then delete the stack through the UI
    await page.getByRole("tab", { name: "CFN" }).click();
    await expect(page.getByRole("button", { name: `Actions for ${stackName}` })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole("button", { name: `Actions for ${stackName}` }).click();
    await page.getByRole("menuitem", { name: /Delete stack/i }).click();
    const confirmDialog = page.getByRole("dialog");
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole("button", { name: "Delete" }).click();
    await expect(confirmDialog).not.toBeVisible();

    // 5. Route53 service view renders the Resolver sections
    await page.locator("aside").getByRole("button", { name: "Route 53" }).click();
    await expect(
      page.getByText(/Resolver endpoints \(0\)/),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Resolver rules \(\d+\)/)).toBeVisible();
  });
});
