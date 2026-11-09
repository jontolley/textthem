import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { AppConfig } from '../config.js';

/** Image types an MMS can carry that every US carrier handles. */
export const MEDIA_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
} as const;

export type MediaType = keyof typeof MEDIA_TYPES;

/** Twilio's limit for one MMS's media. Carriers may shrink anything much over ~600 KB. */
export const MAX_MEDIA_BYTES = 5 * 1024 * 1024;

/**
 * Where broadcast images are kept. Twilio downloads each one from its public
 * URL when it sends, which for a scheduled broadcast can be days after the
 * upload, so stored images are never removed.
 */
export interface MediaStore {
  /** Stores the image and returns the public URL Twilio will fetch it from. */
  put(bytes: Buffer, contentType: MediaType): Promise<string>;
  /** True for a URL this store handed out, so broadcasts can't point anywhere else. */
  owns(url: string): boolean;
}

function newKey(contentType: MediaType): string {
  // Unguessable, so only the people a broadcast went to can find its image.
  return `broadcasts/${randomUUID()}.${MEDIA_TYPES[contentType]}`;
}

function withSlash(base: string): string {
  return base.endsWith('/') ? base : `${base}/`;
}

/** Production: a Cloudflare R2 bucket served publicly at `R2_PUBLIC_URL`. */
export function createR2MediaStore(config: {
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_BUCKET: string;
  R2_PUBLIC_URL: string;
}): MediaStore {
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${config.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.R2_ACCESS_KEY_ID,
      secretAccessKey: config.R2_SECRET_ACCESS_KEY,
    },
  });
  const publicBase = withSlash(config.R2_PUBLIC_URL);

  return {
    async put(bytes, contentType) {
      const key = newKey(contentType);
      await client.send(
        new PutObjectCommand({
          Bucket: config.R2_BUCKET,
          Key: key,
          Body: bytes,
          ContentType: contentType,
          // Keys are never reused, so the image can be cached forever.
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      );
      return new URL(key, publicBase).toString();
    },
    owns: (url) => url.startsWith(publicBase),
  };
}

/**
 * Local dev without R2: files in `dir`, served by the API at `/media/…` so the
 * dashboard can show them. Twilio can't reach localhost, so a real send needs R2.
 */
export function createLocalMediaStore(
  dir: string,
  publicBaseUrl: string,
): MediaStore & {
  read(name: string): Promise<{ bytes: Buffer; contentType: MediaType } | null>;
} {
  const publicBase = new URL('/media/', publicBaseUrl).toString();
  const types = Object.entries(MEDIA_TYPES) as [MediaType, string][];

  return {
    async put(bytes, contentType) {
      const name = newKey(contentType).replace('broadcasts/', '');
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, name), bytes);
      return new URL(name, publicBase).toString();
    },
    owns: (url) => url.startsWith(publicBase),
    async read(name) {
      // Only names this store made: a UUID and a known extension, so no path tricks.
      const match = /^[0-9a-f-]{36}\.(jpg|png|gif)$/.exec(name);
      if (!match) return null;
      const contentType = types.find(([, ext]) => ext === match[1])![0];
      try {
        return { bytes: await readFile(join(dir, name)), contentType };
      } catch {
        return null;
      }
    },
  };
}

export type LocalMediaStore = ReturnType<typeof createLocalMediaStore>;

/** R2 when it's configured; otherwise local files outside production; otherwise none. */
export function createMediaStore(config: AppConfig): MediaStore | undefined {
  if (config.r2) return createR2MediaStore(config.r2);
  if (config.isProduction) return undefined;
  return createLocalMediaStore(join(process.cwd(), '.media'), config.PUBLIC_BASE_URL);
}
