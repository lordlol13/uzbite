import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { env } from '../config/env.js';
import { db } from '../config/database.js';
import { ApiError } from '../utils/errors.js';

export type Identity = {
  id: string;
  role: string;
  tokenVersion: number;
  sessionId: string;
  accessExpiresAt: number;
};

declare module 'express-serve-static-core' {
  interface Request {
    user?: Identity;
  }
}

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function decode(token: string, refresh = false): JwtPayload {
  const payload = jwt.verify(
    token,
    refresh ? (env.JWT_REFRESH_SECRET ?? `${env.JWT_SECRET}:refresh`) : env.JWT_SECRET,
    {
      algorithms: ['HS256'],
      issuer: 'uzbite',
      audience: refresh ? 'uzbite-refresh' : 'uzbite-web',
    },
  );
  if (
    typeof payload === 'string' ||
    typeof payload.sub !== 'string' ||
    typeof payload.sid !== 'string' ||
    typeof payload.ver !== 'number'
  ) {
    throw new Error('Invalid token');
  }
  return payload;
}

export async function identityFromAccess(token: string): Promise<Identity> {
  try {
    const payload = decode(token);
    const session = await db.session.findUnique({
      where: { id: payload.sid as string },
      include: { user: true },
    });
    if (
      !session ||
      session.expiresAt < new Date() ||
      session.userId !== payload.sub ||
      session.user.tokenVersion !== payload.ver ||
      session.user.role !== 'RESTAURANT'
    ) {
      throw new Error('Revoked');
    }
    return {
      id: session.userId,
      role: session.user.role,
      tokenVersion: session.user.tokenVersion,
      sessionId: session.id,
      accessExpiresAt: Math.min((payload.exp ?? 0) * 1000, session.expiresAt.getTime()),
    };
  } catch (error) {
    if (error instanceof Error && error.name.startsWith('Prisma')) throw error;
    throw new ApiError(401, 'UNAUTHORIZED', 'Войдите в бизнес-аккаунт');
  }
}

function signTokens(user: { id: string; tokenVersion: number }, sessionId: string, nonce: string) {
  const accessToken = jwt.sign(
    { sid: sessionId, ver: user.tokenVersion },
    env.JWT_SECRET,
    { subject: user.id, issuer: 'uzbite', audience: 'uzbite-web', algorithm: 'HS256', expiresIn: '15m' },
  );
  const refreshToken = jwt.sign(
    { sid: sessionId, ver: user.tokenVersion, nonce },
    env.JWT_REFRESH_SECRET ?? `${env.JWT_SECRET}:refresh`,
    { subject: user.id, issuer: 'uzbite', audience: 'uzbite-refresh', algorithm: 'HS256', expiresIn: '30d' },
  );
  return { accessToken, refreshToken };
}

export async function createTokenSession(user: { id: string; tokenVersion: number }) {
  const nonce = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 86400_000);
  const session = await db.$transaction(async tx => {
    await tx.session.deleteMany({ where: { userId: user.id, expiresAt: { lte: new Date() } } });
    return tx.session.create({ data: { userId: user.id, refreshHash: hash(nonce), expiresAt } });
  });
  const tokens = signTokens(user, session.id, nonce);
  return { ...tokens, sessionId: session.id, expiresAt: expiresAt.toISOString() };
}

export async function refreshTokenSession(refreshToken: string, expectedRole: Role) {
  try {
    const payload = decode(refreshToken, true);
    if (typeof payload.nonce !== 'string') throw new Error('Invalid');
    const session = await db.session.findUnique({
      where: { id: payload.sid as string },
      include: { user: true },
    });
    const digest = hash(payload.nonce);
    if (
      !session ||
      session.userId !== payload.sub ||
      session.expiresAt < new Date() ||
      session.user.tokenVersion !== payload.ver ||
      session.user.role !== expectedRole ||
      !timingSafeEqual(Buffer.from(session.refreshHash), Buffer.from(digest))
    ) {
      throw new Error('Revoked');
    }
    const nonce = randomBytes(32).toString('hex');
    const rotated = await db.session.updateMany({
      where: { id: session.id, refreshHash: digest },
      data: { refreshHash: hash(nonce) },
    });
    if (rotated.count !== 1) throw new Error('Already rotated');
    const tokens = signTokens(session.user, session.id, nonce);
    return { ...tokens, expiresAt: session.expiresAt.toISOString() };
  } catch (error) {
    if (error instanceof Error && error.name.startsWith('Prisma')) throw error;
    throw new ApiError(401, 'UNAUTHORIZED', 'Сессия истекла. Войдите снова');
  }
}

export async function createBusinessSession(user: { id: string; tokenVersion: number }) {
  const result = await createTokenSession(user);
  return { accessToken: result.accessToken, refreshToken: result.refreshToken, expiresAt: result.expiresAt };
}

export async function refreshBusinessSession(refreshToken: string) {
  return refreshTokenSession(refreshToken, 'RESTAURANT');
}
