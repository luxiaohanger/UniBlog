import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { isUserAdmin } from '../lib/roles';
import {
  publicUserSelect,
  publicUserWithBioSelect,
  serializePublicUser,
  type PublicUser,
  type PublicUserInput,
} from '../lib/serializeUser';

export const postsRouter = Router();

const uploadsDir = path.resolve(__dirname, '../../uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || '';
      const name = `${Date.now()}-${Math.random().toString(16).slice(2)}${ext}`;
      cb(null, name);
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
});

function mediaKindByMime(mime: string) {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  return 'image';
}

type PinScope = 'feed' | 'profile';

function isPinnedByScope(
  p: { pinnedInFeedAt: Date | null; pinnedInProfileAt: Date | null },
  scope?: PinScope
) {
  if (scope === 'feed') return !!p.pinnedInFeedAt;
  if (scope === 'profile') return !!p.pinnedInProfileAt;
  return false;
}

function serializePost(
  p: {
    id: string;
    content: string;
    createdAt: Date;
    author: PublicUserInput;
    media: Array<{ id: string; kind: string; path: string }>;
    pinnedInFeedAt: Date | null;
    pinnedInProfileAt: Date | null;
  },
  counts: { comments: number; likes: number; favorites: number; shares: number },
  scope?: PinScope
) {
  return {
    id: p.id,
    content: p.content,
    createdAt: p.createdAt,
    author: serializePublicUser(p.author) as PublicUser,
    media: p.media.map((m) => ({ id: m.id, kind: m.kind, url: `/${m.path}` })),
    isPinned: isPinnedByScope(p, scope),
    counts,
  };
}

/** 按 PostMedia.path 删除 uploads 内文件；含 .. 或越界路径则跳过 */
function unlinkStoredMediaFile(storedPath: string) {
  const rel = storedPath.replace(/^uploads\/?/, '');
  if (!rel || rel.includes('..') || path.isAbsolute(rel)) return;
  const abs = path.resolve(uploadsDir, rel);
  const relFromRoot = path.relative(uploadsDir, abs);
  if (relFromRoot.startsWith('..') || path.isAbsolute(relFromRoot)) return;
  fs.unlink(abs, (err) => {
    const code = err && (err as NodeJS.ErrnoException).code;
    if (err && code !== 'ENOENT') console.error('unlink media failed', err);
  });
}

postsRouter.post('/', requireAuth(), upload.array('media', 3), async (req, res) => {
  try {
    const user = (req as unknown as { user?: { userId: string } }).user;
    if (!user) return res.status(401).json({ error: 'unauthorized' });

    const content = String(req.body?.content ?? '').trim();
    if (!content) return res.status(400).json({ error: 'missing_content' });

    const files = (req.files as Express.Multer.File[]) || [];

    const post = await prisma.post.create({
      data: {
        authorId: user.userId,
        content,
        media: files.length
          ? {
              create: files.map((f) => ({
                kind: mediaKindByMime(f.mimetype),
                path: `uploads/${f.filename}`,
              })),
            }
          : undefined,
      },
      include: {
        media: true,
        author: { select: publicUserSelect },
      },
    });

    return res.status(201).json({
      post: {
        ...post,
        author: serializePublicUser(post.author),
      },
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'create_post_failed' });
  }
});

postsRouter.get('/feed', async (_req, res) => {
  try {
    const posts = await prisma.post.findMany({
      orderBy: [{ pinnedInFeedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: 30,
      include: { author: { select: publicUserSelect }, media: true },
    });

    const result = await Promise.all(
      posts.map(async (p) => {
        const [commentCount, likeCount, favoriteCount, shareCount] = await Promise.all([
          prisma.comment.count({ where: { postId: p.id } }),
          prisma.postLike.count({ where: { postId: p.id } }),
          prisma.postFavorite.count({ where: { postId: p.id } }),
          prisma.postShare.count({ where: { postId: p.id } }),
        ]);

        return serializePost(
          p,
          { comments: commentCount, likes: likeCount, favorites: favoriteCount, shares: shareCount },
          'feed'
        );
      })
    );

    return res.json({ posts: result });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'feed_failed' });
  }
});

postsRouter.get('/mine', requireAuth(), async (req, res) => {
  try {
    const user = (req as unknown as { user?: { userId: string } }).user;
    if (!user) return res.status(401).json({ error: 'unauthorized' });

    const posts = await prisma.post.findMany({
      where: { authorId: user.userId },
      orderBy: [{ pinnedInProfileAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: 50,
      include: { author: { select: publicUserSelect }, media: true },
    });

    const result = await Promise.all(
      posts.map(async (p) => {
        const [commentCount, likeCount, favoriteCount, shareCount] = await Promise.all([
          prisma.comment.count({ where: { postId: p.id } }),
          prisma.postLike.count({ where: { postId: p.id } }),
          prisma.postFavorite.count({ where: { postId: p.id } }),
          prisma.postShare.count({ where: { postId: p.id } }),
        ]);

        return serializePost(
          p,
          { comments: commentCount, likes: likeCount, favorites: favoriteCount, shares: shareCount },
          'profile'
        );
      })
    );

    return res.json({ posts: result });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'mine_failed' });
  }
});

/** 必须在 /:postId 之前注册，否则会被当成 postId=favorites */
postsRouter.get('/favorites', requireAuth(), async (req, res) => {
  try {
    const user = (req as unknown as { user?: { userId: string } }).user;
    if (!user) return res.status(401).json({ error: 'unauthorized' });

    const favorites = await prisma.postFavorite.findMany({
      where: { userId: user.userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        post: {
          include: { author: { select: publicUserSelect }, media: true },
        },
      },
    });

    // 排除异常数据（帖子已删等）
    const posts = favorites.map((f) => f.post).filter(Boolean);

    const result = await Promise.all(
      posts.map(async (p) => {
        const [commentCount, likeCount, favoriteCount, shareCount] = await Promise.all([
          prisma.comment.count({ where: { postId: p.id } }),
          prisma.postLike.count({ where: { postId: p.id } }),
          prisma.postFavorite.count({ where: { postId: p.id } }),
          prisma.postShare.count({ where: { postId: p.id } }),
        ]);

        return serializePost(p, {
          comments: commentCount,
          likes: likeCount,
          favorites: favoriteCount,
          shares: shareCount,
        });
      })
    );

    return res.json({ posts: result });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'favorites_failed' });
  }
});

/** 某用户公开的帖子列表（须在 /:postId 之前注册） */
postsRouter.get('/author/:authorId', async (req, res) => {
  try {
    const { authorId } = req.params;
    const author = await prisma.user.findUnique({
      where: { id: authorId },
      select: publicUserWithBioSelect,
    });
    if (!author) return res.status(404).json({ error: 'user_not_found' });

    const posts = await prisma.post.findMany({
      where: { authorId },
      orderBy: [{ pinnedInProfileAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: 50,
      include: { author: { select: publicUserSelect }, media: true },
    });

    const result = await Promise.all(
      posts.map(async (p) => {
        const [commentCount, likeCount, favoriteCount, shareCount] = await Promise.all([
          prisma.comment.count({ where: { postId: p.id } }),
          prisma.postLike.count({ where: { postId: p.id } }),
          prisma.postFavorite.count({ where: { postId: p.id } }),
          prisma.postShare.count({ where: { postId: p.id } }),
        ]);

        return serializePost(
          p,
          { comments: commentCount, likes: likeCount, favorites: favoriteCount, shares: shareCount },
          'profile'
        );
      })
    );

    return res.json({ user: serializePublicUser(author), posts: result });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'author_posts_failed' });
  }
});

postsRouter.patch('/:postId/pin', requireAuth(), async (req, res) => {
  try {
    const user = (req as unknown as { user?: { userId: string } }).user;
    if (!user) return res.status(401).json({ error: 'unauthorized' });

    const { postId } = req.params;
    const scope = String(req.body?.scope ?? '');
    const pinned = !!req.body?.pinned;
    if (scope !== 'profile' && scope !== 'feed') {
      return res.status(400).json({ error: 'invalid_scope' });
    }

    const post = await prisma.post.findUnique({ where: { id: postId } });
    if (!post) return res.status(404).json({ error: 'post_not_found' });

    if (scope === 'profile') {
      if (post.authorId !== user.userId) {
        return res.status(403).json({ error: 'forbidden_not_author' });
      }
      if (pinned && !post.pinnedInProfileAt) {
        const pinnedCount = await prisma.post.count({
          where: { authorId: user.userId, pinnedInProfileAt: { not: null } },
        });
        if (pinnedCount >= 3) {
          return res.status(400).json({ error: 'pin_limit_reached' });
        }
      }
      const updated = await prisma.post.update({
        where: { id: postId },
        data: { pinnedInProfileAt: pinned ? new Date() : null },
        select: { id: true, pinnedInProfileAt: true },
      });
      return res.json({ ok: true, isPinned: !!updated.pinnedInProfileAt });
    }

    const admin = await isUserAdmin(user.userId);
    if (!admin) return res.status(403).json({ error: 'forbidden_admin_only' });
    if (pinned && !post.pinnedInFeedAt) {
      const pinnedCount = await prisma.post.count({
        where: { pinnedInFeedAt: { not: null } },
      });
      if (pinnedCount >= 3) {
        return res.status(400).json({ error: 'pin_limit_reached' });
      }
    }
    const updated = await prisma.post.update({
      where: { id: postId },
      data: { pinnedInFeedAt: pinned ? new Date() : null },
      select: { id: true, pinnedInFeedAt: true },
    });
    return res.json({ ok: true, isPinned: !!updated.pinnedInFeedAt });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'pin_post_failed' });
  }
});

/**
 * 帖子编辑：仅作者可改，发布后 3 天内可编辑，超期只读
 * - 本期仅允许修改正文，不支持增删媒体（避免与 multer/磁盘清理耦合）
 * - 不改 updatedAt 触发器：Prisma schema 已有 @updatedAt，Prisma 会自动刷新
 */
const POST_EDIT_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

postsRouter.patch('/:postId', requireAuth(), async (req, res) => {
  try {
    const user = (req as unknown as { user?: { userId: string } }).user;
    if (!user) return res.status(401).json({ error: 'unauthorized' });

    const { postId } = req.params;
    const content = String(req.body?.content ?? '').trim();
    if (!content) return res.status(400).json({ error: 'missing_content' });

    const existing = await prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, authorId: true, createdAt: true },
    });
    if (!existing) return res.status(404).json({ error: 'post_not_found' });
    if (existing.authorId !== user.userId) {
      return res.status(403).json({ error: 'forbidden_not_author' });
    }

    const elapsed = Date.now() - existing.createdAt.getTime();
    if (elapsed > POST_EDIT_WINDOW_MS) {
      return res.status(403).json({ error: 'edit_window_expired' });
    }

    const updated = await prisma.post.update({
      where: { id: postId },
      data: { content },
      include: {
        author: { select: publicUserSelect },
        media: true,
      },
    });

    const [commentCount, likeCount, favoriteCount, shareCount] = await Promise.all([
      prisma.comment.count({ where: { postId } }),
      prisma.postLike.count({ where: { postId } }),
      prisma.postFavorite.count({ where: { postId } }),
      prisma.postShare.count({ where: { postId } }),
    ]);

    return res.json({
      post: serializePost(updated, {
        comments: commentCount,
        likes: likeCount,
        favorites: favoriteCount,
        shares: shareCount,
      }),
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'edit_post_failed' });
  }
});

postsRouter.delete('/:postId', requireAuth(), async (req, res) => {
  try {
    const user = (req as unknown as { user?: { userId: string } }).user;
    if (!user) return res.status(401).json({ error: 'unauthorized' });

    const { postId } = req.params;
    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: { media: true },
    });
    if (!post) return res.status(404).json({ error: 'post_not_found' });
    const admin = await isUserAdmin(user.userId);
    if (post.authorId !== user.userId && !admin) {
      return res.status(403).json({ error: 'forbidden_not_author' });
    }

    const mediaPaths = post.media.map((m) => m.path);
    const postPreview = String(post.content || '').split('\n')[0]?.trim() || '';
    // 级联删除：Comment、PostMedia、PostLike、PostFavorite、PostShare 等由外键 ON DELETE CASCADE 处理
    await prisma.post.delete({ where: { id: postId } });
    // 管理员删除他人帖子：只通知被删除者本人；并清理该帖相关系统删除通知
    if (admin && post.authorId !== user.userId) {
      await prisma.systemNotification.deleteMany({ where: { postId } });
      await prisma.systemNotification.create({
        data: {
          recipientId: post.authorId,
          actorId: user.userId,
          kind: 'post_deleted_by_admin',
          content: postPreview,
          postId,
        },
      });
    }
    for (const p of mediaPaths) unlinkStoredMediaFile(p);

    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'delete_post_failed' });
  }
});

postsRouter.get('/:postId', async (req, res) => {
  try {
    const { postId } = req.params;
    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: {
        author: { select: publicUserSelect },
        media: true,
        comments: {
          orderBy: { createdAt: 'desc' },
          include: { author: { select: publicUserSelect } },
        },
      },
    });
    if (!post) return res.status(404).json({ error: 'post_not_found' });

    const [commentCount, likeCount, favoriteCount, shareCount] = await Promise.all([
      prisma.comment.count({ where: { postId: post.id } }),
      prisma.postLike.count({ where: { postId: post.id } }),
      prisma.postFavorite.count({ where: { postId: post.id } }),
      prisma.postShare.count({ where: { postId: post.id } }),
    ]);

    return res.json({
      post: {
        id: post.id,
        content: post.content,
        createdAt: post.createdAt,
        author: serializePublicUser(post.author),
        media: post.media.map((m) => ({ id: m.id, kind: m.kind, url: `/${m.path}` })),
        comments: post.comments.map((c) => ({
          id: c.id,
          content: c.content,
          createdAt: c.createdAt,
          author: serializePublicUser(c.author),
          layerMainId: c.layerMainId,
        })),
        counts: { comments: commentCount, likes: likeCount, favorites: favoriteCount, shares: shareCount },
      },
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'post_failed' });
  }
});

