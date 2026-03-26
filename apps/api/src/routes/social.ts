import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';

export const socialRouter = Router();

socialRouter.post('/posts/:postId/comments', requireAuth(), async (req, res) => {
  try {
    const { postId } = req.params;
    const user = (req as unknown as { user?: { userId: string } }).user;
    if (!user) return res.status(401).json({ error: 'unauthorized' });

    const { content } = req.body as { content?: string };
    const text = String(content ?? '').trim();
    if (!text) return res.status(400).json({ error: 'missing_content' });

    const comment = await prisma.comment.create({
      data: { postId, authorId: user.userId, content: text },
      include: { author: { select: { id: true, username: true } } },
    });

    return res.status(201).json({
      comment: { id: comment.id, content: comment.content, createdAt: comment.createdAt, author: comment.author },
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'create_comment_failed' });
  }
});

socialRouter.post('/posts/:postId/likes', requireAuth(), async (req, res) => {
  try {
    const { postId } = req.params;
    const user = (req as unknown as { user?: { userId: string } }).user;
    if (!user) return res.status(401).json({ error: 'unauthorized' });

    await prisma.postLike.upsert({
      where: { postId_userId: { postId, userId: user.userId } },
      update: {},
      create: { postId, userId: user.userId },
    });

    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'like_failed' });
  }
});

socialRouter.delete('/posts/:postId/likes', requireAuth(), async (req, res) => {
  try {
    const { postId } = req.params;
    const user = (req as unknown as { user?: { userId: string } }).user;
    if (!user) return res.status(401).json({ error: 'unauthorized' });

    await prisma.postLike.deleteMany({ where: { postId, userId: user.userId } });
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'unlike_failed' });
  }
});

socialRouter.post('/posts/:postId/favorites', requireAuth(), async (req, res) => {
  try {
    const { postId } = req.params;
    const user = (req as unknown as { user?: { userId: string } }).user;
    if (!user) return res.status(401).json({ error: 'unauthorized' });

    await prisma.postFavorite.upsert({
      where: { postId_userId: { postId, userId: user.userId } },
      update: {},
      create: { postId, userId: user.userId },
    });

    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'favorite_failed' });
  }
});

socialRouter.delete('/posts/:postId/favorites', requireAuth(), async (req, res) => {
  try {
    const { postId } = req.params;
    const user = (req as unknown as { user?: { userId: string } }).user;
    if (!user) return res.status(401).json({ error: 'unauthorized' });

    await prisma.postFavorite.deleteMany({ where: { postId, userId: user.userId } });
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'unfavorite_failed' });
  }
});

// 获取当前用户对某个帖子的状态（点赞/收藏/转发）
socialRouter.get('/posts/:postId/states', requireAuth(), async (req, res) => {
  try {
    const { postId } = req.params;
    const user = (req as unknown as { user?: { userId: string } }).user;
    if (!user) return res.status(401).json({ error: 'unauthorized' });

    const [like, favorite, share] = await Promise.all([
      prisma.postLike.findUnique({ where: { postId_userId: { postId, userId: user.userId } } }),
      prisma.postFavorite.findUnique({ where: { postId_userId: { postId, userId: user.userId } } }),
      prisma.postShare.findUnique({ where: { postId_sharerId: { postId, sharerId: user.userId } } }),
    ]);

    return res.json({ liked: !!like, favorited: !!favorite, shared: !!share });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'reaction_states_failed' });
  }
});

socialRouter.post('/posts/:postId/share', requireAuth(), async (req, res) => {
  try {
    const { postId } = req.params;
    const user = (req as unknown as { user?: { userId: string } }).user;
    if (!user) return res.status(401).json({ error: 'unauthorized' });

    await prisma.postShare.upsert({
      where: { postId_sharerId: { postId, sharerId: user.userId } },
      update: {},
      create: { postId, sharerId: user.userId },
    });

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'share_failed' });
  }
});

socialRouter.delete('/posts/:postId/share', requireAuth(), async (req, res) => {
  try {
    const { postId } = req.params;
    const user = (req as unknown as { user?: { userId: string } }).user;
    if (!user) return res.status(401).json({ error: 'unauthorized' });

    await prisma.postShare.deleteMany({ where: { postId, sharerId: user.userId } });
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'unshare_failed' });
  }
});

