import { test, expect } from "./fixtures";
import {
  ListHostedZonesCommand,
  ListResourceRecordSetsCommand,
  ChangeResourceRecordSetsCommand,
  DeleteHostedZoneCommand,
} from "@aws-sdk/client-route-53";
import { requireLocalStack, makeClients, unique } from "./helpers";

test.describe("Route53 e2e", () => {
  const { route53 } = makeClients();
  const domainName = `${unique("zone")}.local`;

  test.beforeAll(async () => {
    await requireLocalStack();
  });

  test.afterAll(async () => {
    try {
      const zonesRes = await route53.send(new ListHostedZonesCommand({}));
      const testZones = (zonesRes.HostedZones ?? []).filter(
        (z) => z.Name === `${domainName}.` || z.Name === domainName,
      );
      for (const tz of testZones) {
        if (!tz.Id) continue;
        const recordsRes = await route53.send(
          new ListResourceRecordSetsCommand({ HostedZoneId: tz.Id }),
        );
        if (recordsRes.ResourceRecordSets) {
          for (const r of recordsRes.ResourceRecordSets) {
            if (r.Type !== "NS" && r.Type !== "SOA") {
              await route53.send(
                new ChangeResourceRecordSetsCommand({
                  HostedZoneId: tz.Id,
                  ChangeBatch: {
                    Changes: [{ Action: "DELETE", ResourceRecordSet: r }],
                  },
                }),
              );
            }
          }
        }
        await route53.send(new DeleteHostedZoneCommand({ Id: tz.Id }));
      }
    } catch {
      // Best-effort cleanup
    }
  });

  test("creates hosted zone, manages A and CNAME record sets in virtualized grid, and cleans up", async ({
    page,
  }) => {
    await page.goto("/");

    // 1. Open Route 53 service via sidebar
    await page
      .locator("aside")
      .getByRole("button", { name: /^Route 53/ })
      .click();
    await expect(page.getByRole("heading", { name: "Route 53" })).toBeVisible();

    // 2. Create Hosted Zone
    await page.getByRole("button", { name: "Create Hosted Zone" }).click();
    const zoneDialog = page.getByRole("dialog");
    await expect(zoneDialog.getByRole("heading", { name: "Create Hosted Zone" })).toBeVisible();
    await zoneDialog.getByLabel("Domain Name").fill(domainName);
    await zoneDialog.getByLabel("Comment (optional)").fill("E2E Test Zone");
    await zoneDialog.getByRole("button", { name: "Create Hosted Zone" }).click();

    // Hosted Zone detail tab should open
    await expect(
      page.getByRole("heading", { name: new RegExp(domainName) }),
    ).toBeVisible();


    // 3. Create an A record set: api.<domain> -> 192.0.2.42, TTL 300
    await page.getByRole("button", { name: "Create Record" }).click();
    const recordDialog = page.getByRole("dialog");
    await expect(recordDialog.getByRole("heading", { name: "Create Record Set" })).toBeVisible();
    await recordDialog.getByLabel("Record Name").fill("api");
    await recordDialog.getByLabel(/Routing Values/).fill("192.0.2.42");
    await recordDialog.getByRole("button", { name: "Create Record" }).click();

    // Assert A record appears in virtualized grid
    await expect(page.getByText(`api.${domainName}.`)).toBeVisible();
    await expect(page.getByText("192.0.2.42")).toBeVisible();

    // 4. Create a CNAME record set: web.<domain> -> api.<domain>., TTL 600
    await page.getByRole("button", { name: "Create Record" }).click();
    const cnameDialog = page.getByRole("dialog");
    await expect(cnameDialog.getByRole("heading", { name: "Create Record Set" })).toBeVisible();
    await cnameDialog.getByLabel("Record Name").fill("web");

    // Select CNAME type
    await cnameDialog.getByRole("combobox").click();
    await page.getByRole("option", { name: "CNAME" }).click();

    await cnameDialog.getByLabel("TTL (Seconds)").fill("600");
    await cnameDialog.getByLabel(/Routing Values/).fill(`api.${domainName}.`);
    await cnameDialog.getByRole("button", { name: "Create Record" }).click();

    // Assert CNAME record appears
    await expect(page.getByText(`web.${domainName}.`)).toBeVisible();

    // 5. Edit the A record TTL to 120
    const aRecordRow = page
      .locator("div[class*='grid-cols-12']")
      .filter({ has: page.getByText(`api.${domainName}.`, { exact: true }) })
      .filter({ has: page.getByText("A", { exact: true }) });
    await aRecordRow.getByTitle("Edit record").click();

    const editDialog = page.getByRole("dialog");
    await expect(editDialog.getByText(/Edit Record Set/)).toBeVisible();
    await editDialog.getByLabel("TTL (Seconds)").fill("120");
    await editDialog.getByRole("button", { name: "Update Record" }).click();

    // Verify updated TTL
    await expect(aRecordRow.getByText("120")).toBeVisible();

    // 6. Delete both custom records
    await aRecordRow.getByTitle("Delete record").click();
    const deleteRecordDialog = page.getByRole("dialog");
    await deleteRecordDialog.getByRole("button", { name: "Delete" }).click();
    await expect(aRecordRow).not.toBeVisible();

    const cnameRow = page
      .locator("div[class*='grid-cols-12']")
      .filter({ has: page.getByText(`web.${domainName}.`, { exact: true }) })
      .filter({ has: page.getByText("CNAME", { exact: true }) });
    await cnameRow.getByTitle("Delete record").click();
    const deleteCnameDialog = page.getByRole("dialog");
    await deleteCnameDialog.getByRole("button", { name: "Delete" }).click();
    await expect(cnameRow).not.toBeVisible();

    // 7. Delete the hosted zone
    await page.getByRole("button", { name: /Delete Zone/ }).click();
    const deleteZoneDialog = page.getByRole("dialog");
    await deleteZoneDialog.getByRole("button", { name: "Delete" }).click();

    // Verify zone tab closed
    await expect(
      page.getByRole("tab", { name: new RegExp(domainName) }),
    ).not.toBeVisible();
  });
});
