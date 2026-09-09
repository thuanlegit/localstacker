import { describe, expect, it, vi } from "vitest";
import type { S3Client } from "@aws-sdk/client-s3";
import {
  createBucket,
  createDirectory,
  deleteBucket,
  deleteObject,
  getObject,
  listBuckets,
  listObjectsPage,
  previewModeFor,
  putObject,
} from "./s3";

describe("s3 data plane", () => {
  it("listBuckets maps buckets and drops entries without names", async () => {
    const creationDate = new Date("2026-01-01T00:00:00Z");
    const send = vi.fn().mockResolvedValue({
      Buckets: [
        { Name: "alpha", CreationDate: creationDate },
        { CreationDate: new Date() }, // missing Name
        { Name: "beta" },
      ],
    });
    const client = { send } as unknown as S3Client;

    const result = await listBuckets(client);

    expect(result).toEqual([
      { name: "alpha", creationDate },
      { name: "beta", creationDate: undefined },
    ]);
  });

  it("createBucket omits CreateBucketConfiguration for us-east-1", async () => {
    const send = vi.fn().mockResolvedValue({});
    const client = { send } as unknown as S3Client;

    await createBucket(client, "my-bucket", "us-east-1");

    expect(send).toHaveBeenCalledOnce();
    const cmd = send.mock.calls[0][0];
    expect(cmd.input).toEqual({
      Bucket: "my-bucket",
    });
  });

  it("createBucket includes LocationConstraint for other regions", async () => {
    const send = vi.fn().mockResolvedValue({});
    const client = { send } as unknown as S3Client;

    await createBucket(client, "eu-bucket", "eu-west-1");

    expect(send).toHaveBeenCalledOnce();
    const cmd = send.mock.calls[0][0];
    expect(cmd.input).toEqual({
      Bucket: "eu-bucket",
      CreateBucketConfiguration: {
        LocationConstraint: "eu-west-1",
      },
    });
  });

  it("deleteBucket and deleteObject invoke correct commands", async () => {
    const send = vi.fn().mockResolvedValue({});
    const client = { send } as unknown as S3Client;

    await deleteBucket(client, "doomed-bucket");
    expect(send.mock.calls[0][0].input).toEqual({ Bucket: "doomed-bucket" });

    await deleteObject(client, { bucket: "my-bucket", key: "file.txt" });
    expect(send.mock.calls[1][0].input).toEqual({
      Bucket: "my-bucket",
      Key: "file.txt",
    });
  });

  it("listObjectsPage splits folders/objects, strips prefix from names, and drops placeholder", async () => {
    const lastModified = new Date("2026-02-01T00:00:00Z");
    const send = vi.fn().mockResolvedValue({
      CommonPrefixes: [{ Prefix: "logs/" }, { Prefix: "archive/" }],
      Contents: [
        { Key: "logs/" }, // folder placeholder object
        {
          Key: "logs/app.log",
          Size: 1024,
          LastModified: lastModified,
          ETag: '"etag-123"',
          StorageClass: "STANDARD",
        },
      ],
      NextContinuationToken: "token-456",
    });
    const client = { send } as unknown as S3Client;

    const page = await listObjectsPage(client, {
      bucket: "demo",
      prefix: "logs/",
      token: "prev-token",
      pageSize: 200,
    });

    expect(send).toHaveBeenCalledOnce();
    const cmdInput = send.mock.calls[0][0].input;
    expect(cmdInput).toEqual({
      Bucket: "demo",
      Prefix: "logs/",
      Delimiter: "/",
      ContinuationToken: "prev-token",
      MaxKeys: 200,
    });

    expect(page.folders).toEqual(["logs/", "archive/"]);
    expect(page.nextToken).toBe("token-456");
    expect(page.objects).toEqual([
      {
        key: "logs/app.log",
        name: "app.log",
        size: 1024,
        lastModified,
        etag: "etag-123",
        storageClass: "STANDARD",
      },
    ]);
  });

  it("getObject and putObject handle payloads properly", async () => {
    const testBytes = new Uint8Array([1, 2, 3]);
    const send = vi.fn().mockResolvedValue({
      Body: {
        transformToByteArray: vi.fn().mockResolvedValue(testBytes),
      },
      ContentType: "application/json",
      ContentLength: 3,
      LastModified: new Date("2026-01-01"),
    });
    const client = { send } as unknown as S3Client;

    const obj = await getObject(client, { bucket: "b", key: "k.json" });
    expect(obj.bytes).toEqual(testBytes);
    expect(obj.contentType).toBe("application/json");

    await putObject(client, {
      bucket: "b",
      key: "new.txt",
      body: "hello",
      contentType: "text/plain",
    });
    expect(send.mock.calls[1][0].input).toEqual({
      Bucket: "b",
      Key: "new.txt",
      Body: "hello",
      ContentType: "text/plain",
    });
  });

  it("putObject converts Blob and File bodies to Uint8Array to avoid stream reader bug", async () => {
    const send = vi.fn().mockResolvedValue({});
    const client = { send } as unknown as S3Client;

    const blob = new Blob(["image binary bytes"], { type: "image/png" });
    await putObject(client, {
      bucket: "test-bucket",
      key: "top10_new_2.png",
      body: blob,
      contentType: "image/png",
    });

    expect(send).toHaveBeenCalledTimes(1);
    const commandInput = send.mock.calls[0][0].input;
    expect(commandInput.Bucket).toBe("test-bucket");
    expect(commandInput.Key).toBe("top10_new_2.png");
    expect(commandInput.ContentType).toBe("image/png");
    expect(commandInput.Body).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(commandInput.Body)).toBe("image binary bytes");
  });

  it("createDirectory puts empty object ending in slash with directory content type", async () => {
    const send = vi.fn().mockResolvedValue({});
    const client = { send } as unknown as S3Client;

    await createDirectory(client, { bucket: "my-bucket", key: "photos" });
    expect(send.mock.calls[0][0].input).toEqual({
      Bucket: "my-bucket",
      Key: "photos/",
      Body: new Uint8Array(0),
      ContentType: "application/x-directory",
    });

    await createDirectory(client, { bucket: "my-bucket", key: "nested/dir/" });
    expect(send.mock.calls[1][0].input).toEqual({
      Bucket: "my-bucket",
      Key: "nested/dir/",
      Body: new Uint8Array(0),
      ContentType: "application/x-directory",
    });

    await createDirectory(client, { bucket: "my-bucket", key: "/leading/slash" });
    expect(send.mock.calls[2][0].input).toEqual({
      Bucket: "my-bucket",
      Key: "leading/slash/",
      Body: new Uint8Array(0),
      ContentType: "application/x-directory",
    });
  });

  it("listObjectsPage discovers folder markers from Contents and excludes them from objects", async () => {
    const send = vi.fn().mockResolvedValue({
      CommonPrefixes: [],
      Contents: [
        { Key: "uploads/", Size: 0 },
        { Key: "uploads/nested/", Size: 0 },
        { Key: "file.txt", Size: 42, LastModified: new Date() },
      ],
    });
    const client = { send } as unknown as S3Client;

    const page = await listObjectsPage(client, { bucket: "my-bucket", prefix: "" });
    expect(page.folders).toEqual(["uploads/"]);
    expect(page.objects).toHaveLength(1);
    expect(page.objects[0].name).toBe("file.txt");
  });

  it("previewModeFor determines mode accurately", () => {
    expect(previewModeFor("image.png", "image/png")).toBe("image");
    expect(previewModeFor("doc.json")).toBe("json");
    expect(previewModeFor("notes.txt", "text/plain")).toBe("text");
    expect(previewModeFor("script.py")).toBe("text");
    expect(previewModeFor("blob.bin", "application/octet-stream")).toBe("binary");
  });
});
