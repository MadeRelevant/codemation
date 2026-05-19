import { PassThrough, Readable } from "node:stream";

import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";

import { Upload } from "@aws-sdk/lib-storage";

import type {
  BinaryBody,
  BinaryStorage,
  BinaryStorageReadResult,
  BinaryStorageStatResult,
  BinaryStorageWriteResult,
} from "@codemation/core";

import { BinaryBodyNodeReadableFactory } from "./BinaryBodyNodeReadableFactory";
import type { S3BinaryStorageConfig } from "./S3BinaryStorageConfig";

const DELETE_BATCH_SIZE = 1000;

export class S3BinaryStorage implements BinaryStorage {
  readonly driverName = "s3";

  private readonly client: S3Client;
  private readonly bucket: string;

  /**
   * @param config - S3 connection details.
   * @param forcePathStyle - Use path-style addressing (true for MinIO / testcontainers; false for Scaleway). Default false.
   */
  constructor(config: S3BinaryStorageConfig, forcePathStyle = false) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async write(args: { storageKey: string; body: BinaryBody }): Promise<BinaryStorageWriteResult> {
    const readable = new BinaryBodyNodeReadableFactory(args.body).create();
    let size = 0;
    const passThrough = new PassThrough();
    readable.on("data", (chunk: Buffer) => {
      size += chunk.byteLength;
    });
    readable.pipe(passThrough);

    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: this.bucket,
        Key: args.storageKey,
        Body: passThrough,
      },
    });

    await upload.done();

    return {
      storageKey: args.storageKey,
      size,
    };
  }

  async openReadStream(storageKey: string): Promise<BinaryStorageReadResult | undefined> {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    let response;
    try {
      response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: storageKey }));
    } catch (err) {
      if (this.isNotFoundError(err)) {
        return undefined;
      }
      throw err;
    }

    if (!response.Body) {
      return undefined;
    }

    const nodeReadable = Readable.from(response.Body as AsyncIterable<Uint8Array>);
    return {
      body: Readable.toWeb(nodeReadable) as BinaryStorageReadResult["body"],
      size: response.ContentLength,
    };
  }

  async stat(storageKey: string): Promise<BinaryStorageStatResult> {
    try {
      const response = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: storageKey }));
      return { exists: true, size: response.ContentLength };
    } catch (err) {
      if (this.isNotFoundError(err)) {
        return { exists: false };
      }
      throw err;
    }
  }

  async delete(storageKey: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: storageKey }));
  }

  async deleteMany(storageKeys: ReadonlyArray<string>): Promise<void> {
    for (let i = 0; i < storageKeys.length; i += DELETE_BATCH_SIZE) {
      const batch = storageKeys.slice(i, i + DELETE_BATCH_SIZE);
      await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: {
            Objects: batch.map((key) => ({ Key: key })),
            Quiet: true,
          },
        }),
      );
    }
  }

  async listByPrefix(prefix: string): Promise<ReadonlyArray<string>> {
    const keys: string[] = [];
    let continuationToken: string | undefined;

    do {
      const response = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );

      for (const obj of response.Contents ?? []) {
        if (obj.Key) {
          keys.push(obj.Key);
        }
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    return keys;
  }

  /** Checks that the configured bucket is reachable. Throws if not. */
  async checkConnectivity(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }

  private isNotFoundError(err: unknown): boolean {
    if (typeof err !== "object" || err === null) {
      return false;
    }
    const anyErr = err as Record<string, unknown>;
    const statusCode =
      anyErr["$metadata"] != null ? (anyErr["$metadata"] as Record<string, unknown>)["httpStatusCode"] : undefined;
    return statusCode === 404 || statusCode === 403 || anyErr["name"] === "NotFound" || anyErr["name"] === "NoSuchKey";
  }
}
