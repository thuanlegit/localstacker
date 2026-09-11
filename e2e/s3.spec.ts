import { test, expect } from "./fixtures";
import {
  CreateBucketCommand,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  DeleteBucketCommand,
} from "@aws-sdk/client-s3";
import { requireLocalStack, makeClients, unique } from "./helpers";

test.describe("S3 e2e", () => {
  const { s3 } = makeClients();
  const seededBucket = unique("e2e-s3");
  const createdBucket = unique("e2e-created");
  const bucketsToClean: string[] = [];

  test.beforeAll(async () => {
    await requireLocalStack();

    await s3.send(new CreateBucketCommand({ Bucket: seededBucket }));
    bucketsToClean.push(seededBucket);

    await s3.send(
      new PutObjectCommand({
        Bucket: seededBucket,
        Key: "hello.txt",
        Body: "e2e hello",
      })
    );
    await s3.send(
      new PutObjectCommand({
        Bucket: seededBucket,
        Key: "dir/nested.json",
        Body: JSON.stringify({ nested: true }),
      })
    );
  });

  test.afterAll(async () => {
    for (const bucket of bucketsToClean) {
      try {
        let token: string | undefined;
        do {
          const list = await s3.send(
            new ListObjectsV2Command({
              Bucket: bucket,
              ContinuationToken: token,
            })
          );
          if (list.Contents && list.Contents.length > 0) {
            await s3.send(
              new DeleteObjectsCommand({
                Bucket: bucket,
                Delete: {
                  Objects: list.Contents.map((o) => ({ Key: o.Key! })),
                },
              })
            );
          }
          token = list.NextContinuationToken;
        } while (token);
        await s3.send(new DeleteBucketCommand({ Bucket: bucket }));
      } catch (err) {
        console.warn(`Cleanup failed for bucket ${bucket}:`, err);
      }
    }
  });

  test("browses, creates bucket, and deletes an object", async ({ page }) => {
    await page.goto("/");

    // 1. Open S3 via sidebar
    await page.locator("aside").getByRole("button", { name: /S3/ }).click();

    // 2. Click seeded bucket row
    const bucketItem = page.getByText(seededBucket, { exact: true });
    await expect(bucketItem).toBeVisible({ timeout: 15_000 });
    await bucketItem.click();
    // BucketView shows hello.txt and dir
    await expect(page.getByText("hello.txt")).toBeVisible();
    await expect(page.getByText("dir", { exact: true })).toBeVisible();
    // Open dir/ folder
    await page.getByText("dir", { exact: true }).click();
    await expect(page.getByText("nested.json")).toBeVisible();

    // Navigate back to root prefix via breadcrumb
    const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb" });
    await breadcrumb.getByRole("button", { name: seededBucket }).click();
    await expect(page.getByText("hello.txt")).toBeVisible();

    // Delete hello.txt
    await page.getByRole("button", { name: "Actions for hello.txt" }).click();
    await page.getByRole("menuitem", { name: "Delete object" }).click();

    const deleteDialog = page.getByRole("dialog");
    await expect(deleteDialog).toBeVisible();
    await deleteDialog.getByRole("button", { name: "Delete" }).click();
    await expect(deleteDialog).not.toBeVisible();

    await expect(page.locator("table").getByText("hello.txt")).not.toBeVisible();
    // 3. Create bucket via UI
    // Switch to S3 Service view tab
    await page.getByRole("tab", { name: /S3/ }).click();
    await page.getByRole("button", { name: "Create bucket" }).click();

    const createDialog = page.getByRole("dialog");
    await expect(createDialog).toBeVisible();
    await createDialog.locator("#new-bucket-name").fill(createdBucket);
    await createDialog.getByRole("button", { name: "Create bucket" }).click();

    bucketsToClean.push(createdBucket);
    await expect(page.getByText(createdBucket, { exact: true })).toBeVisible({
      timeout: 15_000,
    });
  });
});
