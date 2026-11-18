import type { RequestHandler } from 'express';
import { identityFromAccess } from '../services/auth.js';
import { ApiError } from '../utils/errors.js';

export const optionalAuth: RequestHandler = async (req, _res, next) => {
  const authHeader = req.get('authorization');
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined;
  if (typeof bearer === 'string' && bearer.length > 0) {
    try {
      req.user = await identityFromAccess(bearer);
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) {
        next(error);
        return;
      }
    }
  }
  next();
};

export const requireRestaurant: RequestHandler = (req, _res, next) => {
  if (!req.user || req.user.role !== 'RESTAURANT') {
    next(new ApiError(401, 'UNAUTHORIZED', 'Войдите в бизнес-аккаунт'));
    return;
  }
  next();
};
