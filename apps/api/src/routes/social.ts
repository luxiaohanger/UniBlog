import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { parseZod } from '../lib/parseRequest';
import { sendRouteError } from '../lib/routeError';
import {
  createCommentBodySchema,
  friendRequestPatchSchema,
  notificationsQuerySchema,
  sendMessageBodySchema,
} from '../validators/social';
import * as socialService from '../services/socialService';

export const socialRouter = Router();

type ReqUser = { user?: { userId: string } };

socialRouter.post('/posts/:postId/comments', requireAuth(), async (req, res) => {
  const { postId } = req.params;
  const user = (req as unknown as ReqUser).user;
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  try {
    const body = parseZod(createCommentBodySchema, req.body);
    const out = await socialService.createComment(user.userId, postId, body);
    return res.status(201).json(out);
  } catch (e) {
    return sendRouteError(res, e, 'create-comment', 'create_comment_failed');
  }
});

socialRouter.delete('/posts/:postId/comments/layer/:mainCommentId', requireAuth(), async (req, res) => {
  const { postId, mainCommentId } = req.params;
  const user = (req as unknown as ReqUser).user;
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  try {
    const out = await socialService.deleteCommentLayer(user.userId, postId, mainCommentId);
    return res.json(out);
  } catch (e) {
    return sendRouteError(res, e, 'delete-comment-layer', 'delete_comment_layer_failed');
  }
});

socialRouter.delete('/posts/:postId/comments/:commentId', requireAuth(), async (req, res) => {
  const { postId, commentId } = req.params;
  const user = (req as unknown as ReqUser).user;
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  try {
    const out = await socialService.deleteCommentAdmin(user.userId, postId, commentId);
    return res.json(out);
  } catch (e) {
    return sendRouteError(res, e, 'delete-comment', 'delete_comment_failed');
  }
});

socialRouter.post('/posts/:postId/likes', requireAuth(), async (req, res) => {
  const { postId } = req.params;
  const user = (req as unknown as ReqUser).user;
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  try {
    const out = await socialService.likePost(user.userId, postId);
    return res.json(out);
  } catch (e) {
    return sendRouteError(res, e, 'like', 'like_failed');
  }
});

socialRouter.delete('/posts/:postId/likes', requireAuth(), async (req, res) => {
  const { postId } = req.params;
  const user = (req as unknown as ReqUser).user;
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  try {
    const out = await socialService.unlikePost(user.userId, postId);
    return res.json(out);
  } catch (e) {
    return sendRouteError(res, e, 'unlike', 'unlike_failed');
  }
});

socialRouter.post('/posts/:postId/favorites', requireAuth(), async (req, res) => {
  const { postId } = req.params;
  const user = (req as unknown as ReqUser).user;
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  try {
    const out = await socialService.favoritePost(user.userId, postId);
    return res.json(out);
  } catch (e) {
    return sendRouteError(res, e, 'favorite', 'favorite_failed');
  }
});

socialRouter.delete('/posts/:postId/favorites', requireAuth(), async (req, res) => {
  const { postId } = req.params;
  const user = (req as unknown as ReqUser).user;
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  try {
    const out = await socialService.unfavoritePost(user.userId, postId);
    return res.json(out);
  } catch (e) {
    return sendRouteError(res, e, 'unfavorite', 'unfavorite_failed');
  }
});

socialRouter.get('/posts/:postId/states', requireAuth(), async (req, res) => {
  const { postId } = req.params;
  const user = (req as unknown as ReqUser).user;
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  try {
    const out = await socialService.getPostStates(user.userId, postId);
    return res.json(out);
  } catch (e) {
    return sendRouteError(res, e, 'post-states', 'reaction_states_failed');
  }
});

socialRouter.post('/posts/:postId/share', requireAuth(), async (req, res) => {
  const { postId } = req.params;
  const user = (req as unknown as ReqUser).user;
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  try {
    const out = await socialService.sharePost(user.userId, postId);
    return res.status(200).json(out);
  } catch (e) {
    return sendRouteError(res, e, 'share', 'share_failed');
  }
});

socialRouter.delete('/posts/:postId/share', requireAuth(), async (req, res) => {
  const { postId } = req.params;
  const user = (req as unknown as ReqUser).user;
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  try {
    const out = await socialService.unsharePost(user.userId, postId);
    return res.json(out);
  } catch (e) {
    return sendRouteError(res, e, 'unshare', 'unshare_failed');
  }
});

socialRouter.get('/friends/relationship/:userId', requireAuth(), async (req, res) => {
  const targetUserId = String(req.params.userId || '').trim();
  const user = (req as unknown as ReqUser).user;
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  try {
    const out = await socialService.getFriendRelationship(user.userId, targetUserId);
    return res.json(out);
  } catch (e) {
    return sendRouteError(res, e, 'friend-relationship', 'friend_relationship_failed');
  }
});

socialRouter.post('/friends/request/:userId', requireAuth(), async (req, res) => {
  const receiverId = String(req.params.userId || '').trim();
  const user = (req as unknown as ReqUser).user;
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  try {
    const out = await socialService.sendFriendRequest(user.userId, receiverId);
    return res.status(201).json(out);
  } catch (e) {
    return sendRouteError(res, e, 'friend-request', 'friend_request_failed');
  }
});

socialRouter.get('/friends/requests/pending', requireAuth(), async (req, res) => {
  const user = (req as unknown as ReqUser).user;
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  try {
    const out = await socialService.getPendingFriendRequests(user.userId);
    return res.json(out);
  } catch (e) {
    return sendRouteError(res, e, 'pending-requests', 'pending_requests_failed');
  }
});

socialRouter.patch('/friends/request/:requestId', requireAuth(), async (req, res) => {
  const requestId = String(req.params.requestId || '').trim();
  const user = (req as unknown as ReqUser).user;
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  try {
    const { status } = parseZod(friendRequestPatchSchema, req.body);
    const out = await socialService.patchFriendRequest(
      user.userId,
      requestId,
      status as 'ACCEPTED' | 'DECLINED'
    );
    return res.json(out);
  } catch (e) {
    return sendRouteError(res, e, 'patch-friend-request', 'update_request_failed');
  }
});

socialRouter.get('/friends/list', requireAuth(), async (req, res) => {
  const user = (req as unknown as ReqUser).user;
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  try {
    const out = await socialService.getFriendList(user.userId);
    return res.json(out);
  } catch (e) {
    return sendRouteError(res, e, 'friend-list', 'friend_list_failed');
  }
});

socialRouter.delete('/friends/:friendId', requireAuth(), async (req, res) => {
  const friendId = String(req.params.friendId || '').trim();
  const user = (req as unknown as ReqUser).user;
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  try {
    const out = await socialService.deleteFriend(user.userId, friendId);
    return res.json(out);
  } catch (e) {
    return sendRouteError(res, e, 'delete-friend', 'delete_friend_failed');
  }
});

socialRouter.get('/messages/:friendId', requireAuth(), async (req, res) => {
  const friendId = String(req.params.friendId || '').trim();
  const user = (req as unknown as ReqUser).user;
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  try {
    const out = await socialService.getMessages(user.userId, friendId);
    return res.json(out);
  } catch (e) {
    return sendRouteError(res, e, 'get-messages', 'messages_failed');
  }
});

socialRouter.post('/messages/:friendId', requireAuth(), async (req, res) => {
  const friendId = String(req.params.friendId || '').trim();
  const user = (req as unknown as ReqUser).user;
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  try {
    const { content } = parseZod(sendMessageBodySchema, req.body);
    const out = await socialService.sendMessage(user.userId, friendId, content);
    return res.status(201).json(out);
  } catch (e) {
    return sendRouteError(res, e, 'send-message', 'send_message_failed');
  }
});

socialRouter.get('/notifications', requireAuth(), async (req, res) => {
  const user = (req as unknown as ReqUser).user;
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  try {
    const q = parseZod(notificationsQuerySchema, req.query);
    const out = await socialService.getNotifications(user.userId, q.take);
    return res.json(out);
  } catch (e) {
    return sendRouteError(res, e, 'notifications', 'notifications_failed');
  }
});
