import { test, expect } from "@playwright/test";
import {
  GetRestApisCommand,
  DeleteRestApiCommand,
} from "@aws-sdk/client-api-gateway";
import { requireLocalStack, makeClients, unique } from "./helpers";

test.describe("API Gateway e2e", () => {
  const { apigateway } = makeClients();
  const apiName = unique("e2e-api");

  test.beforeAll(async () => {
    await requireLocalStack();
  });

  test.afterAll(async () => {
    try {
      const apis = await apigateway.send(new GetRestApisCommand({}));
      const match = apis.items?.find((a) => a.name === apiName);
      if (match?.id) {
        await apigateway.send(
          new DeleteRestApiCommand({ restApiId: match.id }),
        );
      }
    } catch (err) {
      console.warn(`API Gateway cleanup failed for ${apiName}:`, err);
    }
  });

  test("creates REST API, resource, mock method, runs test invocation, deploys stage, and deletes", async ({
    page,
  }) => {
    await page.goto("/");

    // 1. Open API Gateway via sidebar
    await page
      .locator("aside")
      .getByRole("button", { name: /^API Gateway/ })
      .click();
    await expect(
      page.getByRole("heading", { name: "API Gateway" }),
    ).toBeVisible();

    // 2. Create REST API
    await page.getByRole("button", { name: "Create API" }).click();
    const createDialog = page.getByRole("dialog");
    await createDialog.getByLabel(/API name/i).fill(apiName);
    await createDialog.getByRole("button", { name: "Create API" }).click();

    // Verify tab opened and heading is visible
    await expect(
      page.getByRole("tab", { selected: true }),
    ).toContainText(apiName);

    // 3. Create resource /hello
    await page.getByRole("button", { name: "Create resource" }).click();
    const resDialog = page.getByRole("dialog");
    await resDialog.getByLabel(/Resource path/i).fill("hello");
    await resDialog.getByRole("button", { name: "Create Resource" }).click();
    await expect(page.getByText("/hello")).toBeVisible();

    // 4. Create Mock GET method under /hello
    const helloRow = page.getByTestId("resource-row-/hello");
    await helloRow.getByTitle("Create method").click();

    const methodDialog = page.getByRole("dialog");
    await expect(
      methodDialog.getByRole("heading", { name: "Create Method" }),
    ).toBeVisible();
    // Default is GET and Mock with default template
    await methodDialog.getByRole("button", { name: "Create Method" }).click();

    // 5. Verify GET badge appears and click it to open method inspector
    const getBadge = helloRow.getByText("GET");
    await expect(getBadge).toBeVisible();
    await getBadge.click();

    // 6. Test invoke method runner
    await expect(page.getByText("Method Details")).toBeVisible();
    await page.getByRole("button", { name: /Test invoke/i }).click();

    const testDialog = page.getByRole("dialog");
    await expect(
      testDialog.getByRole("heading", { name: "Method Test Runner" }),
    ).toBeVisible();
    await testDialog.getByRole("button", { name: "Run" }).click();

    // Assert status 200 badge and body text 'mock response'
    await expect(testDialog.getByText("200", { exact: true })).toBeVisible();
    await expect(testDialog.getByText(/mock response/).first()).toBeVisible();
    await testDialog.locator("form").getByRole("button", { name: "Close" }).click();
    // 7. Deploy to stage dev
    await page.getByRole("button", { name: "Deploy to stage" }).click();
    const deployDialog = page.getByRole("dialog");
    await deployDialog.getByLabel(/Stage name/i).fill("dev");
    await deployDialog.getByRole("button", { name: "Deploy" }).click();

    // Verify stage row and invoke URL
    await expect(
      page.locator("table").getByText("dev", { exact: true }),
    ).toBeVisible();
    await expect(page.locator("table").getByText(/_user_request_/)).toBeVisible();
    // 8. SDK assertion: API exists in LocalStack
    const apis = await apigateway.send(new GetRestApisCommand({}));
    expect(apis.items?.some((a) => a.name === apiName)).toBe(true);

    // 9. Delete API via UI
    await page.getByRole("button", { name: "API actions" }).click();
    await page.getByRole("menuitem", { name: /Delete API/i }).click();
    const deleteDialog = page.getByRole("dialog");
    await deleteDialog.getByRole("button", { name: "Delete API" }).click();

    // Verify tab closed and redirected back to service list
    await expect(
      page.getByRole("heading", { name: "API Gateway" }),
    ).toBeVisible();
  });
});
