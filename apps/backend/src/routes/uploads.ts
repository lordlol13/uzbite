import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/security.js';
import { storeUpload, signedReceipt } from '../services/storage.js';

const multipart = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 0 } });
export const uploadRouter = Router();
uploadRouter.use(requireAuth);
uploadRouter.post('/avatar', rateLimit('upload', 30, 3600), multipart.single('file'), async (req, res) => { res.status(201).json({ data: await storeUpload(req.user!.id, 'AVATAR', req.file) }); });
uploadRouter.post('/receipt', rateLimit('upload', 30, 3600), multipart.single('file'), async (req, res) => { res.status(201).json({ data: await storeUpload(req.user!.id, 'RECEIPT', req.file) }); });
uploadRouter.get('/:id', async (req, res) => { res.setHeader('Cache-Control', 'private, no-store'); res.redirect(await signedReceipt(req.user!.id, req.params.id as string)); });
