import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env, storageReady, receiptStorageReady } from '../config/env.js';
import { db } from '../config/database.js';
import { assert } from '../utils/errors.js';

const s3 = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  forcePathStyle: Boolean(env.S3_ENDPOINT),
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY_ID ?? '',
    secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? '',
  },
});

const localMediaDir = resolve(process.cwd(), '.local/restaurant-media');
const safeFilenamePattern = /^[a-f0-9-]{36}\.(jpg|png|webp|mp4|webm|mov)$/;

export function detectImageBuffer(buffer: Buffer): { mimeType: string; extension: string; kind: 'IMAGE' } | null {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { mimeType: 'image/png', extension: 'png', kind: 'IMAGE' };
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mimeType: 'image/jpeg', extension: 'jpg', kind: 'IMAGE' };
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return { mimeType: 'image/webp', extension: 'webp', kind: 'IMAGE' };
  }
  return null;
}

export function detectVideoBuffer(buffer: Buffer): { mimeType: string; extension: string; kind: 'VIDEO' } | null {
  if (buffer.length >= 12 && buffer.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buffer.toString('ascii', 8, 12);
    if (brand === 'qt  ') {
      return { mimeType: 'video/quicktime', extension: 'mov', kind: 'VIDEO' };
    }
    return { mimeType: 'video/mp4', extension: 'mp4', kind: 'VIDEO' };
  }
  if (buffer.length >= 4 && buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
    return { mimeType: 'video/webm', extension: 'webm', kind: 'VIDEO' };
  }
  return null;
}

export async function storeRestaurantMedia(
  restaurantId: string,
  file: Express.Multer.File | undefined,
  acceptedKind: 'IMAGE' | 'VIDEO' | 'ANY' = 'ANY',
) {
  assert(file, 400, 'FILE_REQUIRED', 'Выберите файл для загрузки');
  const detectedImage = detectImageBuffer(file.buffer);
  const detectedVideo = detectVideoBuffer(file.buffer);
  const detected = detectedImage ?? detectedVideo;
  assert(
    detected,
    400,
    'FILE_TYPE',
    'Разрешены только изображения (JPEG, PNG, WebP) и видео (MP4, WebM, MOV)',
  );
  if (acceptedKind === 'IMAGE') {
    assert(detected.kind === 'IMAGE', 400, 'FILE_TYPE', 'Требуется изображение JPEG, PNG или WebP');
  } else if (acceptedKind === 'VIDEO') {
    assert(detected.kind === 'VIDEO', 400, 'FILE_TYPE', 'Требуется видео MP4, WebM или MOV');
  }
  const maxBytes = detected.kind === 'IMAGE' ? 10 * 1024 * 1024 : 100 * 1024 * 1024;
  assert(file.size > 0 && file.size <= maxBytes, 400, 'FILE_TOO_LARGE', 'Размер файла превышает допустимый предел');

  const fileName = `${randomUUID()}.${detected.extension}`;

  if (storageReady) {
    const key = `public/restaurants/${restaurantId}/${fileName}`;
    await s3.send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET!,
        Key: key,
        Body: file.buffer,
        ContentType: detected.mimeType,
        ContentLength: file.size,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
    const url = `${env.CDN_BASE_URL!.replace(/\/$/, '')}/${key}`;
    return { url, mimeType: detected.mimeType, size: file.size, kind: detected.kind };
  }

  assert(
    env.NODE_ENV !== 'production',
    503,
    'STORAGE_NOT_CONFIGURED',
    'В production требуется настроенное S3/CDN хранилище',
  );
  mkdirSync(localMediaDir, { recursive: true });
  await writeFile(resolve(localMediaDir, fileName), file.buffer);
  return {
    url: `/api/media/${fileName}`,
    mimeType: detected.mimeType,
    size: file.size,
    kind: detected.kind,
  };
}

export function resolveLocalMediaFile(filename: string): string | null {
  if (!safeFilenamePattern.test(filename)) return null;
  const full = resolve(localMediaDir, filename);
  if (!full.startsWith(localMediaDir) || !existsSync(full)) return null;
  return full;
}

export async function restaurantReceiptSignedUrl(restaurantId: string, paymentId: string) {
  const payment = await db.payment.findFirst({
    where: { id: paymentId, order: { restaurantId } },
    include: { receipt: true },
  });
  assert(payment, 404, 'NOT_FOUND', 'Платёж не найден');
  assert(payment.receipt, 404, 'NOT_FOUND', 'Чек не прикреплён к заказу');
  assert(receiptStorageReady, 503, 'STORAGE_NOT_CONFIGURED', 'Приватное облачное хранилище чеков не настроено');
  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: env.S3_PRIVATE_BUCKET!,
      Key: payment.receipt.key,
      ResponseCacheControl: 'private, no-store',
    }),
    { expiresIn: 120 },
  );
}
