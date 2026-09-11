import { setTimeout as delay } from "node:timers/promises";
import { test, expect } from "./fixtures";
import {
  CreateFunctionCommand,
  DeleteFunctionCommand,
  GetFunctionConfigurationCommand,
} from "@aws-sdk/client-lambda";
import { zipSync, strToU8 } from "fflate";
import { requireLocalStack, makeClients, unique } from "./helpers";
test.describe("Lambda e2e", () => {
  const { lambda } = makeClients();
  const functionName = unique("e2e-fn");

  test.beforeAll(async () => {
    await requireLocalStack();

    const codeZip = zipSync({
      "index.js": strToU8(
        "exports.handler = async (event) => { console.log('e2e-invoke-log'); return { statusCode: 200, body: JSON.stringify(event) }; };"
      ),
    });

    await lambda.send(
      new CreateFunctionCommand({
        FunctionName: functionName,
        Runtime: "nodejs22.x",
        Handler: "index.handler",
        Role: "arn:aws:iam::000000000000:role/irrelevant",
        Code: {
          ZipFile: codeZip,
        },
      })
    );

    const start = Date.now();
    while (Date.now() - start < 30_000) {
      const cfg = await lambda.send(
        new GetFunctionConfigurationCommand({ FunctionName: functionName })
      );
      if (cfg.State === "Active") break;
      if (cfg.State === "Failed") {
        throw new Error(`Function failed to activate: ${cfg.StateReason}`);
      }
      await delay(500);
    }
  });

  test.afterAll(async () => {
    try {
      await lambda.send(new DeleteFunctionCommand({ FunctionName: functionName }));
    } catch (err) {
      console.warn(`Failed to cleanup function ${functionName}:`, err);
    }
  });

  test("displays seeded function, opens, and invokes with logs", async ({ page }) => {
    await page.goto("/");

    // 1. Open Lambda via sidebar
    await page.locator("aside").getByRole("button", { name: /Lambda/ }).click();

    // 2. Function row shows name and runtime badge
    const fnItem = page.getByText(functionName, { exact: true });
    await expect(fnItem).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("tr", { hasText: functionName }).getByText("nodejs22.x")).toBeVisible();

    // 3. Open function tab
    await fnItem.click();

    // 4. Click Invoke in header
    await page.getByRole("button", { name: "Invoke", exact: true }).click();

    const invokeDialog = page.getByRole("dialog");
    await expect(invokeDialog).toBeVisible();

    // 5. Fill payload and submit
    await invokeDialog.locator("#invoke-payload").fill(JSON.stringify({ name: "e2e" }));
    await invokeDialog.getByRole("button", { name: "Invoke", exact: true }).click();

    // 6. Assert result panel: status 200, response echo, and logs
    await expect(invokeDialog.getByText("200", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(invokeDialog.locator("pre").first()).toContainText("e2e");
    await expect(invokeDialog.getByText("e2e-invoke-log")).toBeVisible();
  });
});
