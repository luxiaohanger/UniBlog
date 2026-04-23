import multer from 'multer';
import path from 'node:path';
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { parseZod } from '../lib/parseRequest';
import { sendRouteError } from '../lib/routeError';
import { config } from '../lib/config';
import { ensureUploadsDir, uploadsDir } from '../lib/uploads';
import { createPostBodySchema, patchPostBodySchema, pinPostBodySchema } from '../validators/posts';
import * as postsService from '../services/postsService';

export const postsRouter = Router();

ensureUploadsDir();

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || '';
      const name = `${Date.now()}-${Math.random().toString(16).slice(2)}${ext}`;
      cb(null, name);
    },
  }),
  limits: { fileSize: config.postMediaMaxBytes },
});

postsRouter.post('/', requireAuth(), upload.array('media', 3), async (req, res) => {
  const user = (req as unknown as { user?: { userId: string } }).user;
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  try {
    const { content } = parseZod(createPostBodySchema, req.body);
    const files = (req.files as Express.Multer.File[]) || [];
    const out = await postsService.createPost(user.userId, content, files);
    return res.status(201).json(out);
  } catch (e) {
    return sendRouteError(res, e, 'create-post', 'create_post_failed');
  }
});

postsRouter.get('/feed', async (_req, res) => {
  try {
    const out = await postsService.getFeed();
    return res.json(out);
  } catch (e) {
    return sendRouteError(res, e, 'feed', 'feed_failed');
  }
});

postsRouter.get('/mine', requireAuth(), async (req, res) => {
  const user = (req as unknown as { user?: { userId: string } }).user;
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  try {
    const out = await postsService.getMine(user.userId);
    return res.json(out);
  } catch (e) {
    return sendRouteError(res, e, 'mine', 'mine_failed');
  }
});

postsRouter.get('/favorites', requireAuth(), async (req, res) => {
  const user = (req as unknown as { user?: { userId: string } }).user;
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  try {
    const out = await postsService.getFavorites(user.userId);
    return res.json(out);
  } catch (e) {
    return sendRouteError(res, e, 'favorites', 'favorites_failed');
  }
});

postsRouter.get('/author/:authorId', async (req, res) => {
  try {
    const out = await postsService.getAuthorPosts(req.params.authorId);
    return res.json(out);
  } catch (e) {
    return sendRouteError(res, e, 'author-posts', 'author_posts_failed');
  }
});

postsRouter.patch('/:postId/pin', requireAuth(), async (req, res) => {
  const user = (req as unknown as { user?: { userId: string } }).user;
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  try {
    const { scope, pinned } = parseZod(pinPostBodySchema, req.body);
    const out = await postsService.pinPost(user.userId, req.params.postId, scope, pinned);
    return res.json(out);
  } catch (e) {
    return sendRouteError(res, e, 'pin-post', 'pin_post_failed');
  }
});

postsRouter.patch('/:postId', requireAuth(), async (req, res) => {
  const user = (req as unknown as { user?: { userId: string } }).user;
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  try {
    const { content } = parseZod(patchPostBodySchema, req.body);
    const out = await postsService.updatePost(user.userId, req.params.postId, content);
    return res.json(out);
  } catch (e) {
    return sendRouteError(res, e, 'edit-post', 'edit_post_failed');
  }
});

postsRouter.delete('/:postId', requireAuth(), async (req, res) => {
  const user = (req as unknown as { user?: { userId: string } }).user;
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  try {
    const out = await postsService.deletePost(user.userId, req.params.postId);
    return res.json(out);
  } catch (e) {
    return sendRouteError(res, e, 'delete-post', 'delete_post_failed');
  }
});

postsRouter.get('/:postId', async (req, res) => {
  try {
    const out = await postsService.getPostById(req.params.postId);
    return res.json(out);
  } catch (e) {
    return sendRouteError(res, e, 'get-post', 'post_failed');
  }
});
