import {
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListBucketsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  type BucketLocationConstraint,
  type S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export interface BucketSummary {
  name: string;
  creationDate?: Date;
}

export interface S3ObjectEntry {
  key: string;
  name: string;
  size: number;
  lastModified?: Date;
  etag?: string;
  storageClass?: string;
}

export interface S3ObjectPage {
  folders: string[];
  objects: S3ObjectEntry[];
  nextToken?: string;
}

export interface FetchedObject {
  bytes: Uint8Array;
  contentType?: string;
  contentLength?: number;
  lastModified?: Date;
}

export const MAX_PREVIEW_BYTES = 2 * 1024 * 1024;

export async function listBuckets(client: S3Client): Promise<BucketSummary[]> {
  const res = await client.send(new ListBucketsCommand({}));
  const buckets: BucketSummary[] = [];
  for (const b of res.Buckets ?? []) {
    if (b.Name) {
      buckets.push({
        name: b.Name,
        creationDate: b.CreationDate,
      });
    }
  }
  return buckets;
}

export async function createBucket(
  client: S3Client,
  name: string,
  region?: string,
): Promise<void> {
  const needsConstraint = region && region !== "us-east-1";
  await client.send(
    new CreateBucketCommand({
      Bucket: name,
      ...(needsConstraint
        ? {
            CreateBucketConfiguration: {
              LocationConstraint: region as BucketLocationConstraint,
            },
          }
        : {}),
    }),
  );
}

export async function deleteBucket(client: S3Client, name: string): Promise<void> {
  await client.send(new DeleteBucketCommand({ Bucket: name }));
}

export async function deleteObject(
  client: S3Client,
  params: { bucket: string; key: string },
): Promise<void> {
  await client.send(
    new DeleteObjectCommand({
      Bucket: params.bucket,
      Key: params.key,
    }),
  );
}

export async function listObjectsPage(
  client: S3Client,
  params: {
    bucket: string;
    prefix?: string;
    token?: string;
    pageSize?: number;
  },
): Promise<S3ObjectPage> {
  const prefix = params.prefix ?? "";
  const res = await client.send(
    new ListObjectsV2Command({
      Bucket: params.bucket,
      Prefix: prefix || undefined,
      Delimiter: "/",
      ContinuationToken: params.token,
      MaxKeys: params.pageSize ?? 500,
    }),
  );

  const folderSet = new Set<string>();
  for (const cp of res.CommonPrefixes ?? []) {
    if (cp.Prefix) folderSet.add(cp.Prefix);
  }
  for (const o of res.Contents ?? []) {
    if (o.Key && o.Key.endsWith("/") && o.Key !== prefix) {
      const rel = prefix && o.Key.startsWith(prefix) ? o.Key.slice(prefix.length) : o.Key;
      const slashIdx = rel.indexOf("/");
      if (slashIdx !== -1) {
        folderSet.add(prefix + rel.slice(0, slashIdx + 1));
      }
    }
  }
  const folders = Array.from(folderSet);

  const objects: S3ObjectEntry[] = (res.Contents ?? [])
    .filter(
      (o): o is typeof o & { Key: string } =>
        Boolean(o.Key && o.Key !== prefix && !o.Key.endsWith("/")),
    )
    .map((o) => ({
      key: o.Key,
      name: o.Key.startsWith(prefix) ? o.Key.slice(prefix.length) : o.Key,
      size: o.Size ?? 0,
      lastModified: o.LastModified,
      etag: o.ETag?.replace(/"/g, ""),
      storageClass: o.StorageClass,
    }));

  return {
    folders,
    objects,
    nextToken: res.NextContinuationToken,
  };
}

export async function getObject(
  client: S3Client,
  params: { bucket: string; key: string },
): Promise<FetchedObject> {
  const res = await client.send(
    new GetObjectCommand({
      Bucket: params.bucket,
      Key: params.key,
    }),
  );

  let bytes: Uint8Array = new Uint8Array();
  if (res.Body) {
    if (typeof (res.Body as { transformToByteArray?: unknown }).transformToByteArray === "function") {
      bytes = await (res.Body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray();
    } else if (res.Body instanceof Uint8Array) {
      bytes = res.Body;
    }
  }
  return {
    bytes,
    contentType: res.ContentType,
    contentLength: res.ContentLength,
    lastModified: res.LastModified,
  };
}

export async function putObject(
  client: S3Client,
  params: {
    bucket: string;
    key: string;
    body: Uint8Array | Blob | File | string;
    contentType?: string;
  },
): Promise<void> {
  let body: Uint8Array | string;
  if (
    params.body &&
    typeof (params.body as { arrayBuffer?: unknown }).arrayBuffer === "function"
  ) {
    const buffer = await (params.body as Blob).arrayBuffer();
    body = new Uint8Array(buffer);
  } else if (typeof Blob !== "undefined" && params.body instanceof Blob) {
    const buffer = await params.body.arrayBuffer();
    body = new Uint8Array(buffer);
  } else {
    body = params.body as Uint8Array | string;
  }

  await client.send(
    new PutObjectCommand({
      Bucket: params.bucket,
      Key: params.key,
      Body: body,
      ContentType: params.contentType,
    }),
  );
}

export async function createDirectory(
  client: S3Client,
  params: {
    bucket: string;
    key: string;
  },
): Promise<void> {
  let key = params.key.trim().replace(/^\/+/, "");
  if (!key.endsWith("/")) {
    key += "/";
  }

  await client.send(
    new PutObjectCommand({
      Bucket: params.bucket,
      Key: key,
      Body: new Uint8Array(0),
      ContentType: "application/x-directory",
    }),
  );
}

export const createFolder = createDirectory;

export async function presignGetObject(
  client: S3Client,
  params: { bucket: string; key: string },
  expiresIn = 604800,
): Promise<string> {
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: params.bucket,
      Key: params.key,
    }),
    { expiresIn },
  );
}

const TEXT_EXTENSIONS: Record<string, true> = {
  txt: true,
  md: true,
  log: true,
  csv: true,
  yaml: true,
  yml: true,
  xml: true,
  js: true,
  ts: true,
  html: true,
  css: true,
  env: true,
  ini: true,
  toml: true,
  py: true,
  sh: true,
};

const IMAGE_EXTENSIONS: Record<string, true> = {
  png: true,
  jpg: true,
  jpeg: true,
  gif: true,
  svg: true,
  webp: true,
  ico: true,
  bmp: true,
  avif: true,
};

export type PreviewMode = "image" | "json" | "text" | "binary";

export function previewModeFor(key: string, contentType?: string): PreviewMode {
  const ct = contentType?.toLowerCase();
  if (ct?.startsWith("image/")) {
    return "image";
  }

  const dotIdx = key.lastIndexOf(".");
  const ext = dotIdx !== -1 ? key.slice(dotIdx + 1).toLowerCase() : "";

  if (
    ct === "application/json" ||
    ct?.startsWith("application/json;") ||
    ext === "json"
  ) {
    return "json";
  }

  if (
    ct?.startsWith("text/") ||
    ct?.startsWith("application/xml") ||
    ct?.startsWith("application/javascript") ||
    ct?.startsWith("application/yaml") ||
    ct?.startsWith("application/x-yaml") ||
    (ext && TEXT_EXTENSIONS[ext])
  ) {
    return "text";
  }

  if (ext && IMAGE_EXTENSIONS[ext]) {
    return "image";
  }

  return "binary";
}
