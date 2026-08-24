import path from "node:path";
import { config } from "../config.js";
import { logger } from "../logger.js";

const VIDEO_EXTENSIONS = new Set([".mp4", ".m4v", ".mkv", ".webm", ".mov", ".avi"]);

/**
 * The AWS SDK is an optional dependency — a local install shouldn't have to pull
 * it in. It is imported lazily so `STORAGE_DRIVER=local` never touches it.
 */
async function loadSdk() {
  try {
    const [client, presigner] = await Promise.all([
      import("@aws-sdk/client-s3"),
      import("@aws-sdk/s3-request-presigner"),
    ]);
    return { ...client, ...presigner };
  } catch {
    throw new Error(
      "STORAGE_DRIVER=s3 requires the AWS SDK. Install it with:\n" +
        "  npm --prefix backend install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner",
    );
  }
}

export async function createS3Storage() {
  const sdk = await loadSdk();
  const { bucket, prefix, signedUrls, signedUrlTtlSeconds } = config.s3;

  const client = new sdk.S3Client({
    region: config.s3.region,
    ...(config.s3.endpoint ? { endpoint: config.s3.endpoint } : {}),
    // MinIO, Backblaze and some R2 setups need path-style addressing.
    forcePathStyle: config.s3.forcePathStyle,
    ...(config.s3.accessKeyId
      ? {
          credentials: {
            accessKeyId: config.s3.accessKeyId,
            secretAccessKey: config.s3.secretAccessKey,
          },
        }
      : {}),
  });

  const toObjectKey = (key) => `${prefix}${key}`;
  const fromObjectKey = (objectKey) => objectKey.slice(prefix.length);

  async function listObjects() {
    const out = [];
    let ContinuationToken;
    do {
      const page = await client.send(
        new sdk.ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken }),
      );
      for (const item of page.Contents ?? []) {
        if (item.Key.endsWith("/")) continue;
        out.push({ key: fromObjectKey(item.Key), size: item.Size, mtime: item.LastModified });
      }
      ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (ContinuationToken);
    return out;
  }

  async function signed(key, ttl = signedUrlTtlSeconds) {
    return sdk.getSignedUrl(
      client,
      new sdk.GetObjectCommand({ Bucket: bucket, Key: toObjectKey(key) }),
      { expiresIn: ttl },
    );
  }

  return {
    kind: "s3",
    describe: () => `s3://${bucket}/${prefix}`,

    async list() {
      try {
        return (await listObjects()).filter((o) =>
          VIDEO_EXTENSIONS.has(path.extname(o.key).toLowerCase()),
        );
      } catch (err) {
        logger.error({ err: err.message, bucket }, "storage.list_failed");
        return [];
      }
    },

    async listAll() {
      try {
        return (await listObjects()).map((o) => o.key);
      } catch {
        return [];
      }
    },

    async stat(key) {
      try {
        const head = await client.send(
          new sdk.HeadObjectCommand({ Bucket: bucket, Key: toObjectKey(key) }),
        );
        return { size: head.ContentLength, mtime: head.LastModified };
      } catch {
        return null;
      }
    },

    async exists(key) {
      return (await this.stat(key)) !== null;
    },

    async readText(key) {
      const res = await client.send(
        new sdk.GetObjectCommand({ Bucket: bucket, Key: toObjectKey(key) }),
      );
      return res.Body.transformToString();
    },

    /**
     * Range is pushed down to S3 so we fetch only the bytes the player asked
     * for — never the whole object.
     */
    async createReadStream(key, range) {
      const Range =
        range && Number.isFinite(range.start) ? `bytes=${range.start}-${range.end ?? ""}` : undefined;
      const res = await client.send(
        new sdk.GetObjectCommand({ Bucket: bucket, Key: toObjectKey(key), Range }),
      );
      return res.Body;
    },

    /** ffprobe speaks https and will range-request the moov atom itself. */
    async probeInput(key) {
      return signed(key, 3600);
    },

    async signedUrl(key, ttl) {
      return signedUrls ? signed(key, ttl) : null;
    },
  };
}
