import { setTimeout as delay } from "node:timers/promises";
import { test, expect } from "./fixtures";
import {
  CreateFunctionCommand,
  DeleteFunctionCommand,
  GetFunctionConfigurationCommand,
} from "@aws-sdk/client-lambda";
import { zipSync, strToU8 } from "fflate";
import { requireLocalStack, makeClients, unique } from "./helpers";

test.describe("Lambda to CloudWatch Logs deep link e2e", () => {
  const { lambda } = makeClients();
  const functionName = unique("e2e-fn-link");

  test.beforeAll(async () => {
    await requireLocalStack();

    const codeZip = zipSync({
      "index.js": strToU8(
        "exports.handler = async (event) => { return { statusCode: 200 }; };",
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
      }),
    );

    const start = Date.now();
    while (Date.now() - start < 30_000) {
      const cfg = await lambda.send(
        new GetFunctionConfigurationCommand({ FunctionName: functionName }),
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
      await lambda.send(
        new DeleteFunctionCommand({ FunctionName: functionName }),
      );
    } catch (err) {
      console.warn(`Failed to cleanup function ${functionName}:`, err);
    }
  });

  test("opens function view and navigates to CloudWatch Logs tab via 'View logs'", async ({
    page,
  }) => {
    await page.goto("/");

    // 1. Open Lambda via sidebar
    await page.locator("aside").getByRole("button", { name: /Lambda/ }).click();

    // 2. Open function
    const fnItem = page.getByText(functionName, { exact: true });
    await expect(fnItem).toBeVisible({ timeout: 15_000 });
    await fnItem.click();

    // 3. Click 'View logs' button in FunctionView header
    const viewLogsBtn = page.getByRole("button", { name: /View logs/i });
    await expect(viewLogsBtn).toBeVisible({ timeout: 10_000 });
    await viewLogsBtn.click();

    // 4. Verify log group tab opens with title `/aws/lambda/<name>`
    const expectedLogGroup = `/aws/lambda/${functionName}`;
    const logTab = page.getByRole("tab", { name: expectedLogGroup });
    await expect(logTab).toBeVisible({ timeout: 10_000 });

    // Header inside LogGroupView displays the log group name
    await expect(
      page.getByRole("heading", { name: expectedLogGroup }),
    ).toBeVisible();
  });
});
