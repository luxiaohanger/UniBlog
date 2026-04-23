import type { Express } from 'express';
import { prisma } from '../lib/prisma';
import { isUserAdmin } from '../lib/roles';
import {
  publicUserSelect,
  publicUserWithBioSelect,
  serializePublicUser,
  type PublicUser,
  type PublicUserInput,
} from '../lib/serializeUser';
import { ServiceError } from '../lib/serviceError';
import { unlinkStoredMediaFile } from '../lib/uploads';

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

async function countsForPost(postId: string) {
  const [commentCount, likeCount, favoriteCount, shareCount] = await Promise.all([
    prisma.comment.count({ where: { postId } }),
    prisma.postLike.count({ where: { postId } }),
    prisma.postFavorite.count({ where: { postId } }),
    prisma.postShare.count({ where: { postId } }),
  ]);
  return { comments: commentCount, likes: likeCount, favorites: favoriteCount, shares: shareCount };
}

export async function createPost(userId: string, content: string, files: Express.Multer.File[]) {
  const post = await prisma.post.create({
    data: {
      authorId: userId,
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

  return {
    post: {
      ...post,
      author: serializePublicUser(post.author),
    },
  };
}

export async function getFeed() {
  const posts = await prisma.post.findMany({
    orderBy: [{ pinnedInFeedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
    take: 30,
    include: { author: { select: publicUserSelect }, media: true },
  });

  const result = await Promise.all(
    posts.map(async (p) => serializePost(p, await countsForPost(p.id), 'feed'))
  );

  return { posts: result };
}

export async function getMine(userId: string) {
  const posts = await prisma.post.findMany({
    where: { authorId: userId },
    orderBy: [{ pinnedInProfileAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
    take: 50,
    include: { author: { select: publicUserSelect }, media: true },
  });

  const result = await Promise.all(
    posts.map(async (p) => serializePost(p, await countsForPost(p.id), 'profile'))
  );

  return { posts: result };
}

export async function getFavorites(userId: string) {
  const favorites = await prisma.postFavorite.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      post: {
        include: { author: { select: publicUserSelect }, media: true },
      },
    },
  });

  const posts = favorites.map((f) => f.post).filter(Boolean) as NonNullable<(typeof favorites)[0]['post']>[];

  const result = await Promise.all(posts.map(async (p) => serializePost(p, await countsForPost(p.id))));

  return { posts: result };
}

export async function getAuthorPosts(authorId: string) {
  const author = await prisma.user.findUnique({
    where: { id: authorId },
    select: publicUserWithBioSelect,
  });
  if (!author) throw new ServiceError(404, 'user_not_found');

  const posts = await prisma.post.findMany({
    where: { authorId },
    orderBy: [{ pinnedInProfileAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
    take: 50,
    include: { author: { select: publicUserSelect }, media: true },
  });

  const result = await Promise.all(
    posts.map(async (p) => serializePost(p, await countsForPost(p.id), 'profile'))
  );

  return { user: serializePublicUser(author), posts: result };
}

export async function pinPost(userId: string, postId: string, scope: PinScope, pinned: boolean) {
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) throw new ServiceError(404, 'post_not_found');

  if (scope === 'profile') {
    if (post.authorId !== userId) throw new ServiceError(403, 'forbidden_not_author');
    if (pinned && !post.pinnedInProfileAt) {
      const pinnedCount = await prisma.post.count({
        where: { authorId: userId, pinnedInProfileAt: { not: null } },
      });
      if (pinnedCount >= 3) throw new ServiceError(400, 'pin_limit_reached');
    }
    const updated = await prisma.post.update({
      where: { id: postId },
      data: { pinnedInProfileAt: pinned ? new Date() : null },
      select: { id: true, pinnedInProfileAt: true },
    });
    return { ok: true as const, isPinned: !!updated.pinnedInProfileAt };
  }

  const admin = await isUserAdmin(userId);
  if (!admin) throw new ServiceError(403, 'forbidden_admin_only');
  if (pinned && !post.pinnedInFeedAt) {
    const pinnedCount = await prisma.post.count({
      where: { pinnedInFeedAt: { not: null } },
    });
    if (pinnedCount >= 3) throw new ServiceError(400, 'pin_limit_reached');
  }
  const updated = await prisma.post.update({
    where: { id: postId },
    data: { pinnedInFeedAt: pinned ? new Date() : null },
    select: { id: true, pinnedInFeedAt: true },
  });
  return { ok: true as const, isPinned: !!updated.pinnedInFeedAt };
}

const POST_EDIT_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

export async function updatePost(userId: string, postId: string, content: string) {
  const existing = await prisma.post.findUnique({
    where: { id: postId },
    select: { id: true, authorId: true, createdAt: true },
  });
  if (!existing) throw new ServiceError(404, 'post_not_found');
  if (existing.authorId !== userId) throw new ServiceError(403, 'forbidden_not_author');

  const elapsed = Date.now() - existing.createdAt.getTime();
  if (elapsed > POST_EDIT_WINDOW_MS) throw new ServiceError(403, 'edit_window_expired');

  const updated = await prisma.post.update({
    where: { id: postId },
    data: { content },
    include: {
      author: { select: publicUserSelect },
      media: true,
    },
  });

  const counts = await countsForPost(postId);
  return { post: serializePost(updated, counts) };
}

export async function deletePost(userId: string, postId: string) {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: { media: true },
  });
  if (!post) throw new ServiceError(404, 'post_not_found');
  const admin = await isUserAdmin(userId);
  if (post.authorId !== userId && !admin) throw new ServiceError(403, 'forbidden_not_author');

  const mediaPaths = post.media.map((m) => m.path);
  const postPreview = String(post.content || '').split('\n')[0]?.trim() || '';

  await prisma.post.delete({ where: { id: postId } });

  if (admin && post.authorId !== userId) {
    await prisma.systemNotification.deleteMany({ where: { postId } });
    await prisma.systemNotification.create({
      data: {
        recipientId: post.authorId,
        actorId: userId,
        kind: 'post_deleted_by_admin',
        content: postPreview,
        postId,
      },
    });
  }
  for (const p of mediaPaths) unlinkStoredMediaFile(p);

  return { ok: true as const };
}

export async function getPostById(postId: string) {
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
  if (!post) throw new ServiceError(404, 'post_not_found');

  const [commentCount, likeCount, favoriteCount, shareCount] = await Promise.all([
    prisma.comment.count({ where: { postId: post.id } }),
    prisma.postLike.count({ where: { postId: post.id } }),
    prisma.postFavorite.count({ where: { postId: post.id } }),
    prisma.postShare.count({ where: { postId: post.id } }),
  ]);

  return {
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
  };
}
