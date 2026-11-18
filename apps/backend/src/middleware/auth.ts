import type { RequestHandler } from 'express';
import { accessCookie, identityFromAccess } from '../services/auth.js';
import { ApiError } from '../utils/errors.js';

export const optionalAuth: RequestHandler = async (req, _res, next) => {
  const authHeader = req.get('authorization');
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined;
  const token: unknown = bearer || req.cookies[accessCookie];
  if (typeof token === 'string' && token.length > 0) {
    try {
      req.user = await identityFromAccess(token);
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) {
        next(error);
        return;
      }
    }
  }
  next();
};

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.user || req.user.role !== 'USER') {
    next(new ApiError(401, 'UNAUTHORIZED', 'Войдите в аккаунт пользователя'));
    return;
  }
  next();
};

export const requireRestaurant: RequestHandler = (req, _res, next) => {
  if (!req.user || req.user.role !== 'RESTAURANT') {
    next(new ApiError(401, 'UNAUTHORIZED', 'Войдите в бизнес-аккаунт ресторана'));
    return;
  }
  next();
};

export const requireCourier: RequestHandler = (req, _res, next) => {
  if (!req.user || req.user.role !== 'COURIER') {
    next(new ApiError(401, 'UNAUTHORIZED', 'Войдите в аккаунт курьера'));
    return;
  }
  next();
};
