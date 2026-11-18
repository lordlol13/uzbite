import { randomUUID } from 'node:crypto';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { UploadPurpose } from '@prisma/client';
import { env, storageReady, receiptStorageReady } from '../config/env.js';
import { db } from '../config/database.js';
import { assert } from '../utils/errors.js';

const s3 = new S3Client({ endpoint: env.S3_ENDPOINT, region: env.S3_REGION, forcePathStyle: Boolean(env.S3_ENDPOINT), credentials: { accessKeyId: env.S3_ACCESS_KEY_ID ?? '', secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? '' } });
export function detectImage(buffer: Buffer): { mimeType: string; extension: string } | null {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return { mimeType: 'image/png', extension: 'png' };
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { mimeType: 'image/jpeg', extension: 'jpg' };
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return { mimeType: 'image/webp', extension: 'webp' };
  return null;
}
export async function storeUpload(userId: string, purpose: UploadPurpose, file: Express.Multer.File | undefined) {
  assert(purpose === 'RECEIPT' ? receiptStorageReady : storageReady, 503, 'STORAGE_NOT_CONFIGURED', 'Облачное хранилище пока не настроено');
  assert(file, 400, 'FILE_REQUIRED', 'Выберите файл');
  assert(file.size <= (purpose === 'AVATAR' ? 5 : 8) * 1024 * 1024, 400, 'FILE_TOO_LARGE', 'Файл слишком большой');
  const image = detectImage(file.buffer);
  assert(image && file.mimetype === image.mimeType, 400, 'FILE_TYPE', 'Разрешены только настоящие изображения JPEG, PNG и WebP');
  const key = `${purpose === 'AVATAR' ? 'public/avatars' : 'receipts'}/${userId}/${randomUUID()}.${image.extension}`;
  const bucket = purpose === 'RECEIPT' ? env.S3_PRIVATE_BUCKET! : env.S3_BUCKET!;
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: file.buffer, ContentType: image.mimeType, ContentLength: file.size, CacheControl: purpose === 'RECEIPT' ? 'private, no-store' : 'public, max-age=31536000, immutable', ServerSideEncryption: 'AES256' }));
  try {
    const upload = await db.upload.create({ data: { userId, purpose, key, mimeType: image.mimeType, size: file.size } });
    const url = purpose === 'AVATAR' ? `${env.CDN_BASE_URL!.replace(/\/$/, '')}/${key}` : `/api/uploads/${upload.id}`;
    if (purpose === 'AVATAR') await db.user.update({ where: { id: userId }, data: { avatarUrl: url } });
    return { id: upload.id, url };
  } catch (error) {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(() => {});
    throw error;
  }
}
export async function signedReceipt(userId: string, id: string) {
  const upload = await db.upload.findFirst({ where: { id, userId, purpose: 'RECEIPT' } });
  assert(upload, 404, 'NOT_FOUND', 'Файл не найден');
  assert(receiptStorageReady, 503, 'STORAGE_NOT_CONFIGURED', 'Облачное хранилище пока не настроено');
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: env.S3_PRIVATE_BUCKET!, Key: upload.key, ResponseCacheControl: 'private, no-store' }), { expiresIn: 60 });
}
