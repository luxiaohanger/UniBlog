'use client';

import { useEffect, useState, useLayoutEffect, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import useSWR from 'swr';
import { apiFetch } from '../lib/http';
import { getTokens } from '../lib/token';
import { buildCommentTree } from '../lib/commentTree';
import { parseReplyDisplay } from '../lib/replyDisplay';
import { UserProfileLink, AtUserLink } from './UserProfileLink';

type CommentBlock = {
  mainComments: any[];
  replyComments: any[];
  layers: Record<string, number>;
};

/** 回复目标为主评论或其层内回复时，找到对应层主评论 id（优先用接口返回的 layerMainId） */
function findMainIdForComment(cb: CommentBlock, targetCommentId: string): string | null {
  const all = [...cb.mainComments, ...cb.replyComments];
  const target = all.find((m: any) => m.id === targetCommentId);
  // 权威关系：先用 layerMainId，但必须确认它指向当前视图中的一个真实层主，避免悬空 id
  if (target?.layerMainId) {
    const mainId = String(target.layerMainId);
    if (cb.mainComments.some((m: any) => m.id === mainId)) return mainId;
  }
  if (cb.mainComments.some((m: any) => m.id === targetCommentId)) return targetCommentId;
  const layer = cb.layers[targetCommentId];
  if (layer == null) return null;
  const main = cb.mainComments.find((m: any) => cb.layers[m.id] === layer);
  return main?.id ?? null;
}

interface Author {
  id: string;
  username: string;
}

interface Media {
  id: string;
  url: string;
}

interface PostCounts {
  comments: number;
  likes: number;
  favorites: number;
  shares: number;
}

interface Post {
  id: string;
  content: string;
  createdAt: string;
  author: Author;
  media: Media[];
  isPinned?: boolean;
  counts: PostCounts;
}

interface PostState {
  liked: boolean;
  favorited: boolean;
}

const PREVIEW_LINES = 3;
const MAX_COMMENT_LINES = 10;

function lineCount(text: string) {
  return text.split('\n').length;
}

function clampLines(text: string, maxLines: number) {
  return text.split('\n').slice(0, maxLines).join('\n');
}

interface PostCardProps {
  post: Post;
  postState: PostState;
  onUpdatePost: (updatedPost: Post) => void;
  onUpdatePostState: (postId: string, newState: Partial<PostState>) => void;
  /** 删除成功后从列表移除（圈子/个人/收藏等） */
  onDeletePost?: (postId: string) => void;
  /** 置顶作用域：profile=我的帖子，feed=圈子 */
  pinScope?: 'profile' | 'feed';
  /** 管理员删除权限是否生效（某些页面需禁用） */
  allowAdminDelete?: boolean;
  /** 从外部指定需要定位/高亮的评论 id（用于系统通知跳转） */
  focusCommentId?: string | null;
}

export default function PostCard({
  post,
  postState,
  onUpdatePost,
  onUpdatePostState,
  onDeletePost,
  pinScope,
  allowAdminDelete = true,
  focusCommentId = null,
}: PostCardProps) {
  const isSubmitShortcut = (
    e: ReactKeyboardEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const native = e.nativeEvent as KeyboardEvent;
    if (native.isComposing || native.keyCode === 229) return false;
    return e.key === 'Enter' && (e.ctrlKey || e.metaKey);
  };

  const accessToken = getTokens()?.accessToken ?? null;
  const { data: meData } = useSWR<{ user: { id: string; role?: string } }>(
    accessToken ? '/auth/me' : null,
    () => apiFetch<{ user: { id: string; role?: string } }>('/auth/me')
  );
  const isOwnPost = meData?.user?.id === post.author.id;
  const isAdmin = meData?.user?.role === 'admin';
  const canAdminDeleteHere = isAdmin && allowAdminDelete;
  const canDeletePost = isOwnPost || canAdminDeleteHere;
  const canPin =
    (pinScope === 'profile' && isOwnPost) || (pinScope === 'feed' && isAdmin);

  const [expandedComments, setExpandedComments] = useState(false);
  const [commentBlock, setCommentBlock] = useState<CommentBlock | null>(null);
  const [expandedLayers, setExpandedLayers] = useState<Record<string, boolean>>({});
  const [visibleLayerComments, setVisibleLayerComments] = useState<Record<string, number>>({});
  const [visibleMainComments, setVisibleMainComments] = useState(3);
  const [commentInput, setCommentInput] = useState('');
  const [replyInputs, setReplyInputs] = useState<Record<string, string>>({});
  const [expandedTextMap, setExpandedTextMap] = useState<Record<string, boolean>>({});
  const [expandedPostText, setExpandedPostText] = useState(false);
  const [replyingTo, setReplyingTo] = useState<{ commentId: string } | null>(null);
  const [loadingComments, setLoadingComments] = useState(false);
  const [highlightCommentId, setHighlightCommentId] = useState<string | null>(null);
  const [likeAnim, setLikeAnim] = useState(false);
  const [favAnim, setFavAnim] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [pinning, setPinning] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!focusCommentId) return;
    let cancelled = false;
    const run = async () => {
      const tree = await reloadCommentTreeFromServer();
      if (cancelled || !tree) return;
      setExpandedComments(true);
      setVisibleMainComments(Math.max(50, tree.mainComments.length));
      const mainId = findMainIdForComment(tree, focusCommentId);
      if (mainId) {
        setExpandedLayers((p) => ({ ...p, [mainId]: true }));
        const layerNum = tree.layers[focusCommentId];
        if (layerNum != null) {
          const sameLayer = tree.replyComments.filter((r: any) => tree.layers[r.id] === layerNum).length;
          setVisibleLayerComments((p) => ({ ...p, [mainId]: Math.max(p[mainId] || 5, sameLayer) }));
        } else {
          setVisibleLayerComments((p) => ({ ...p, [mainId]: Math.max(p[mainId] || 5, 10) }));
        }
      }
      setHighlightCommentId(focusCommentId);
    };
    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusCommentId, post.id]);

  useLayoutEffect(() => {
    if (!highlightCommentId) return;
    const id = highlightCommentId;
    requestAnimationFrame(() => {
      document.getElementById(`postcard-cmt-${id}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });
    const t = window.setTimeout(() => setHighlightCommentId(null), 1400);
    return () => clearTimeout(t);
  }, [highlightCommentId, commentBlock]);

  /** 每次展开从接口拉取，与圈子数据一致 */
  const fetchPostDetails = async () => {
    setLoadingComments(true);
    try {
      const data = await apiFetch<any>(`/posts/${post.id}`);
      const tree = buildCommentTree(data.post.comments || []);
      setCommentBlock(tree);

      const el: Record<string, boolean> = {};
      const vlc: Record<string, number> = {};
      tree.mainComments.forEach((c: any) => {
        el[c.id] = false;
        vlc[c.id] = 0;
      });
      setExpandedLayers(el);
      setVisibleLayerComments(vlc);
      setVisibleMainComments(3);
      setExpandedComments(true);
    } catch (err) {
      console.error('获取帖子详情失败:', err);
    } finally {
      setLoadingComments(false);
    }
  };

  /** 与圈子一致：用接口评论列表 + buildCommentTree 重建层数与主/回复划分 */
  const reloadCommentTreeFromServer = async (): Promise<CommentBlock | null> => {
    try {
      const data = await apiFetch<any>(`/posts/${post.id}`);
      const tree = buildCommentTree(data.post.comments || []);
      setCommentBlock(tree);

      setExpandedLayers((prevEl) => {
        const next: Record<string, boolean> = {};
        tree.mainComments.forEach((c: any) => {
          next[c.id] = prevEl[c.id] ?? false;
        });
        return next;
      });
      setVisibleLayerComments((prevV) => {
        const next: Record<string, number> = {};
        tree.mainComments.forEach((c: any) => {
          next[c.id] = prevV[c.id] ?? 0;
        });
        return next;
      });
      setVisibleMainComments((prev) =>
        Math.max(prev, tree.mainComments.length)
      );

      if (data.post?.counts) {
        onUpdatePost({ ...post, counts: data.post.counts });
      }
      return tree;
    } catch (err) {
      console.error('同步评论失败:', err);
      return null;
    }
  };

  /** 评论图标仅负责展开；收起用底部「收起所有评论」 */
  const handleOpenComments = () => {
    if (!expandedComments) {
      fetchPostDetails();
    }
  };

  const handleCommentSubmit = async () => {
    const content = commentInput;
    if (!content?.trim()) return;

    try {
      const data = await apiFetch<any>(`/social/posts/${post.id}/comments`, {
        method: 'POST',
        body: { content },
      });

      setExpandedComments(true);
      await reloadCommentTreeFromServer();
      setCommentInput('');
      setHighlightCommentId(data.comment.id);
    } catch (err) {
      console.error('发布评论失败:', err);
      alert('发布评论失败，请重试');
    }
  };

  const handleReply = async (commentId: string) => {
    const content = replyInputs[commentId];
    if (!content?.trim()) return;

    const prev = commentBlock;
    const targetComment =
      prev?.mainComments?.find((c: any) => c.id === commentId) ||
      prev?.replyComments?.find((c: any) => c.id === commentId);
    if (!targetComment) return;

    const layerMainId = findMainIdForComment(prev, commentId);
    if (!layerMainId) return;

    try {
      const data = await apiFetch<any>(`/social/posts/${post.id}/comments`, {
        method: 'POST',
        body: {
          content: `@${targetComment.author.username} ${content}`,
          layerMainId,
        },
      });

      setExpandedComments(true);
      const tree = await reloadCommentTreeFromServer();

      if (tree) {
        const mainId = findMainIdForComment(tree, commentId);
        if (mainId) {
          setExpandedLayers((p) => ({ ...p, [mainId]: true }));
          const layerNum = tree.layers[data.comment.id];
          const sameLayer = tree.replyComments.filter(
            (r: any) => tree.layers[r.id] === layerNum
          ).length;
          setVisibleLayerComments((p) => ({
            ...p,
            [mainId]: Math.max(p[mainId] || 5, sameLayer),
          }));
        }
      }

      setReplyInputs((p) => ({ ...p, [commentId]: '' }));
      setReplyingTo(null);
      setHighlightCommentId(data.comment.id);
    } catch (err) {
      console.error('回复评论失败:', err);
    }
  };

  const handleLike = async () => {
    try {
      if (postState.liked) {
        await apiFetch(`/social/posts/${post.id}/likes`, { method: 'DELETE' });
        onUpdatePostState(post.id, { liked: false });
        onUpdatePost({
          ...post,
          counts: {
            ...post.counts,
            likes: Math.max(0, post.counts.likes - 1),
          },
        });
      } else {
        await apiFetch(`/social/posts/${post.id}/likes`, { method: 'POST' });
        onUpdatePostState(post.id, { liked: true });
        onUpdatePost({
          ...post,
          counts: { ...post.counts, likes: post.counts.likes + 1 },
        });
      }
      setLikeAnim(true);
    } catch (err) {
      console.error('点赞操作失败:', err);
    }
  };

  const handleFavorite = async () => {
    try {
      if (postState.favorited) {
        await apiFetch(`/social/posts/${post.id}/favorites`, {
          method: 'DELETE',
        });
        onUpdatePostState(post.id, { favorited: false });
        onUpdatePost({
          ...post,
          counts: {
            ...post.counts,
            favorites: Math.max(0, post.counts.favorites - 1),
          },
        });
      } else {
        await apiFetch(`/social/posts/${post.id}/favorites`, {
          method: 'POST',
        });
        onUpdatePostState(post.id, { favorited: true });
        onUpdatePost({
          ...post,
          counts: { ...post.counts, favorites: post.counts.favorites + 1 },
        });
      }
      setFavAnim(true);
    } catch (err) {
      console.error('收藏操作失败:', err);
    }
  };

  const handleConfirmDelete = async () => {
    setDeleting(true);
    try {
      await apiFetch(`/posts/${post.id}`, { method: 'DELETE' });
      setShowDeleteConfirm(false);
      onDeletePost?.(post.id);
    } catch (err) {
      console.error('删除帖子失败:', err);
      alert('删除失败，请重试');
    } finally {
      setDeleting(false);
    }
  };

  const handleTogglePin = async () => {
    if (!pinScope) return;
    setPinning(true);
    try {
      const nextPinned = !post.isPinned;
      await apiFetch(`/posts/${post.id}/pin`, {
        method: 'PATCH',
        body: { scope: pinScope, pinned: nextPinned },
      });
      onUpdatePost({ ...post, isPinned: nextPinned });
      setShowActionMenu(false);
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (msg.includes('pin_limit_reached')) {
        alert('最多只能置顶 3 篇帖子');
      } else {
        alert('置顶操作失败，请重试');
      }
    } finally {
      setPinning(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    const cb = commentBlock;
    const isLayerRoot =
      !!cb && cb.mainComments.some((c: { id: string }) => c.id === commentId);

    if (isLayerRoot && cb) {
      const layer = cb.layers[commentId];
      const sameLayerReplies = cb.replyComments.filter(
        (r: { id: string }) => cb.layers[r.id] === layer
      );
      const n = sameLayerReplies.length;
      const msg =
        n > 0
          ? `删除层主会先移除本层 ${n} 条回复，再删除层主（共 ${n + 1} 条）。确定？`
          : '确定删除这条层主评论？';
      if (!window.confirm(msg)) return;
      try {
        await apiFetch(
          `/social/posts/${post.id}/comments/layer/${commentId}`,
          { method: 'DELETE' }
        );
        await reloadCommentTreeFromServer();
      } catch (err) {
        console.error('删除层评论失败:', err);
        alert('删除失败，请重试');
        await reloadCommentTreeFromServer();
      }
      return;
    }

    if (!window.confirm('确定删除这条评论？（仅删除该条）')) return;
    try {
      await apiFetch(`/social/posts/${post.id}/comments/${commentId}`, {
        method: 'DELETE',
      });
      await reloadCommentTreeFromServer();
    } catch (err) {
      console.error('删除评论失败:', err);
      alert('删除评论失败，请重试');
    }
  };

  const hasCommentList =
    commentBlock &&
    (commentBlock.mainComments?.length > 0 ||
      commentBlock.replyComments?.length > 0);

  return (
    <div
      id={`postcard-${post.id}`}
      className="card card-hover"
      style={{
        padding: '20px',
        borderRadius: 'var(--radius-lg)',
      }}
    >
      <div
        className="flex-wrap-sm"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '12px',
          gap: 8,
        }}
      >
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <UserProfileLink userId={post.author.id} username={post.author.username} />
            {post.isPinned && (
              <span
                style={{
                  fontSize: 11,
                  color: '#b45309',
                  background: 'rgba(217, 119, 6, 0.12)',
                  padding: '2px 8px',
                  borderRadius: 999,
                  fontWeight: 500,
                  letterSpacing: '0.02em',
                  lineHeight: 1.4,
                }}
              >
                📌 置顶
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--fg-subtle)' }}>
            {new Date(post.createdAt).toLocaleString()}
          </div>
        </div>
        {canPin ? (
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              aria-label="更多操作"
              onClick={() => setShowActionMenu((v) => !v)}
              className="btn-ghost"
              style={{
                fontSize: '20px',
                color: 'var(--fg-muted)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-pill)',
                width: '36px',
                height: '36px',
                lineHeight: 1,
                padding: 0,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              ⋮
            </button>
            {showActionMenu && (
              <div
                className="modal-content glass"
                style={{
                  position: 'absolute',
                  right: 0,
                  top: '40px',
                  borderRadius: 'var(--radius-sm)',
                  minWidth: '160px',
                  zIndex: 30,
                  overflow: 'hidden',
                  padding: 4,
                }}
              >
                <button
                  type="button"
                  disabled={pinning}
                  onClick={handleTogglePin}
                  className="btn-ghost"
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-xs)',
                    border: 'none',
                    fontSize: '14px',
                    cursor: pinning ? 'not-allowed' : 'pointer',
                  }}
                >
                  {post.isPinned ? '取消置顶' : '置顶'}
                </button>
                {canDeletePost && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowActionMenu(false);
                      setShowDeleteConfirm(true);
                    }}
                    className="btn-ghost"
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '10px 12px',
                      borderRadius: 'var(--radius-xs)',
                      border: 'none',
                      color: 'var(--danger)',
                      fontSize: '14px',
                    }}
                  >
                    {isAdmin && !isOwnPost ? '删除（管理）' : '删除'}
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          canDeletePost && (
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="btn-ghost"
              style={{
                fontSize: '13px',
                color: 'var(--fg-muted)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-pill)',
                padding: '4px 12px',
              }}
            >
              {isAdmin && !isOwnPost ? '删除（管理）' : '删除'}
            </button>
          )
        )}
      </div>

      <p
        className="text-line-fit"
        style={{
          marginBottom: '8px',
          whiteSpace: 'pre-wrap',
          overflow: lineCount(post.content) > PREVIEW_LINES && !expandedPostText ? 'hidden' : 'visible',
          display:
            lineCount(post.content) > PREVIEW_LINES && !expandedPostText ? '-webkit-box' : 'block',
          WebkitLineClamp:
            lineCount(post.content) > PREVIEW_LINES && !expandedPostText ? PREVIEW_LINES : 'unset',
          WebkitBoxOrient:
            lineCount(post.content) > PREVIEW_LINES && !expandedPostText ? 'vertical' : 'unset',
        }}
      >
        {post.content}
      </p>
      {lineCount(post.content) > PREVIEW_LINES && (
        <div style={{ marginBottom: '12px' }}>
          <button
            type="button"
            onClick={() => setExpandedPostText((v) => !v)}
            style={{
              background: 'none',
              border: 'none',
              color: '#0070f3',
              cursor: 'pointer',
              padding: 0,
              fontSize: '13px',
            }}
          >
            {expandedPostText ? '收起此帖子' : '展开此帖子'}
          </button>
        </div>
      )}

      {post.media.length > 0 && (() => {
        const mediaList = post.media.slice(0, 3);
        const count = mediaList.length;
        // 根据图片数量自适应：1 张宽幅、2 张半分、3 张三分；统一用 aspect-ratio 跟随宽度缩放
        const gridTemplateColumns =
          count === 1 ? '1fr' : count === 2 ? '1fr 1fr' : '1fr 1fr 1fr';
        const aspectRatio =
          count === 1 ? '16 / 10' : count === 2 ? '4 / 3' : '1 / 1';
        return (
          <div style={{ marginBottom: '12px' }}>
            <div
              style={{
                display: 'grid',
                gap: '8px',
                gridTemplateColumns,
              }}
            >
              {mediaList.map((media) => (
                <div
                  key={media.id}
                  className="img-hover"
                  title="双击查看大图"
                  style={{
                    aspectRatio,
                    maxHeight: count === 1 ? 420 : undefined,
                    cursor: 'zoom-in',
                    borderRadius: '8px',
                  }}
                  onDoubleClick={() =>
                    setPreviewImageUrl(`http://localhost:4000${media.url}`)
                  }
                >
                  <img src={`http://localhost:4000${media.url}`} alt="Media" />
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      <div
        className="flex-wrap-sm"
        style={{
          display: 'flex',
          gap: '8px',
          fontSize: '14px',
          marginBottom: '16px',
          rowGap: 8,
          alignItems: 'center',
        }}
      >
        <button type="button" className="icon-btn" onClick={handleOpenComments} aria-label="评论">
          <span style={{ fontSize: 16, lineHeight: 1 }}>💬</span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{post.counts.comments}</span>
        </button>
        <button
          type="button"
          className={`icon-btn${postState.liked ? ' active-like' : ''}`}
          onClick={handleLike}
          aria-label="点赞"
          aria-pressed={postState.liked}
        >
          <span
            className={likeAnim ? 'post-action-hit' : undefined}
            onAnimationEnd={() => setLikeAnim(false)}
            style={{ fontSize: 16, lineHeight: 1 }}
          >
            {postState.liked ? '❤️' : '🤍'}
          </span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{post.counts.likes}</span>
        </button>
        <button
          type="button"
          className={`icon-btn${postState.favorited ? ' active-fav' : ''}`}
          onClick={handleFavorite}
          aria-label="收藏"
          aria-pressed={postState.favorited}
        >
          <span
            className={favAnim ? 'post-action-hit' : undefined}
            onAnimationEnd={() => setFavAnim(false)}
            style={{ fontSize: 16, lineHeight: 1 }}
          >
            {postState.favorited ? '⭐' : '☆'}
          </span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{post.counts.favorites}</span>
        </button>
      </div>

      {expandedComments && loadingComments && (
        <div style={{ textAlign: 'center', padding: '16px' }}>加载评论中...</div>
      )}

      {expandedComments &&
        !loadingComments &&
        commentBlock &&
        hasCommentList && (
          <div
            style={{
              marginBottom: '16px',
              paddingTop: '12px',
              borderTop: '1px solid #f0f0f0',
            }}
          >
            {commentBlock.mainComments
              ?.slice(0, visibleMainComments)
              .map((mainComment: any) => {
                const layer = commentBlock.layers[mainComment.id];
                const layerReplies = (
                  commentBlock.replyComments?.filter(
                    (reply: any) =>
                      commentBlock.layers[reply.id] ===
                      commentBlock.layers[mainComment.id]
                  ) || []
                ).sort(
                  (a: any, b: any) =>
                    new Date(a.createdAt).getTime() -
                    new Date(b.createdAt).getTime()
                );

                return (
                  <div
                    key={mainComment.id}
                    id={`postcard-cmt-${mainComment.id}`}
                    className={
                      highlightCommentId === mainComment.id
                        ? 'postcard-cmt--highlight'
                        : undefined
                    }
                    style={{ marginBottom: '16px' }}
                  >
                    <div
                      style={{
                        marginBottom: '8px',
                        padding: '8px',
                        background: '#f9f9f9',
                        borderRadius: '8px',
                      }}
                    >
                      <div
                        className="flex-wrap-sm"
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          gap: 6,
                          rowGap: 2,
                        }}
                      >
                        <div
                          className="flex-wrap-sm"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            minWidth: 0,
                          }}
                        >
                          <UserProfileLink
                            userId={mainComment.author.id}
                            username={mainComment.author.username}
                            style={{ fontSize: '14px' }}
                          />
                          <span style={{ fontSize: '12px', color: '#999' }}>
                            {layer}层
                          </span>
                        </div>
                        <div style={{ fontSize: '12px', color: '#999' }}>
                          {new Date(mainComment.createdAt).toLocaleString()}
                        </div>
                      </div>
                      {(() => {
                        const isExpanded = !!expandedTextMap[mainComment.id];
                        const isLong = lineCount(mainComment.content) > PREVIEW_LINES;
                        return (
                          <p
                        className="text-line-fit"
                        style={{
                          fontSize: '14px',
                          marginTop: '4px',
                          marginBottom: '8px',
                          whiteSpace: 'pre-wrap',
                          overflow: isLong && !isExpanded ? 'hidden' : 'visible',
                          display: isLong && !isExpanded ? '-webkit-box' : 'block',
                          WebkitLineClamp: isLong && !isExpanded ? PREVIEW_LINES : 'unset',
                          WebkitBoxOrient: isLong && !isExpanded ? 'vertical' : 'unset',
                        }}
                      >
                        {mainComment.content}
                      </p>
                        );
                      })()}
                      <div
                        className="flex-wrap-sm"
                        style={{
                          display: 'flex',
                          gap: '12px',
                          fontSize: '12px',
                          rowGap: 4,
                        }}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setReplyingTo({ commentId: mainComment.id })
                          }
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#0070f3',
                            cursor: 'pointer',
                            padding: '0',
                          }}
                        >
                          回复
                        </button>
                        {lineCount(mainComment.content) > PREVIEW_LINES && (
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedTextMap((prev) => ({
                                ...prev,
                                [mainComment.id]: !prev[mainComment.id],
                              }))
                            }
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#0070f3',
                              cursor: 'pointer',
                              padding: '0',
                            }}
                          >
                            {expandedTextMap[mainComment.id] ? '收起此评论' : '展开此评论'}
                          </button>
                        )}
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => handleDeleteComment(mainComment.id)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#c0392b',
                              cursor: 'pointer',
                              padding: '0',
                            }}
                          >
                            删除
                          </button>
                        )}
                        {layerReplies.length > 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedLayers((prev) => ({
                                ...prev,
                                [mainComment.id]: !prev[mainComment.id],
                              }))
                            }
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#0070f3',
                              cursor: 'pointer',
                              padding: '0',
                            }}
                          >
                            {expandedLayers[mainComment.id]
                              ? '收起本层评论'
                              : '显示本层评论'}
                          </button>
                        )}
                      </div>
                      {replyingTo?.commentId === mainComment.id && (
                        <div
                          style={{
                            marginTop: '8px',
                            display: 'flex',
                            gap: '8px',
                          }}
                        >
                          <textarea
                            className="text-line-fit"
                            rows={Math.min(
                              MAX_COMMENT_LINES,
                              Math.max(1, lineCount(replyInputs[mainComment.id] || ''))
                            )}
                            value={replyInputs[mainComment.id] || ''}
                            onChange={(e) =>
                              setReplyInputs((prev) => ({
                                ...prev,
                                [mainComment.id]: clampLines(e.target.value, MAX_COMMENT_LINES),
                              }))
                            }
                            placeholder={`回复 @${mainComment.author.username}...`}
                            style={{
                              flex: 1,
                              padding: '6px 10px',
                              borderRadius: '8px',
                              border: '1px solid #eaeaea',
                              fontSize: '14px',
                              minHeight: '36px',
                              resize: 'vertical',
                            }}
                            onKeyDown={(e) => {
                              if (isSubmitShortcut(e)) {
                                e.preventDefault();
                                handleReply(mainComment.id);
                              }
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => handleReply(mainComment.id)}
                            style={{
                              padding: '6px 12px',
                              background: '#0070f3',
                              color: 'white',
                              borderRadius: '12px',
                              border: 'none',
                              fontSize: '12px',
                              cursor: 'pointer',
                            }}
                          >
                            发送
                          </button>
                        </div>
                      )}
                    </div>

                    {expandedLayers[mainComment.id] && layerReplies.length > 0 && (
                      <div style={{ marginLeft: '30px', marginTop: '8px' }}>
                        {layerReplies
                          .slice(
                            0,
                            visibleLayerComments[mainComment.id] || 5
                          )
                          .map((replyComment: any) => {
                            const participants = [
                              mainComment.author,
                              ...layerReplies.map((r: any) => r.author),
                            ];
                            const nameToId = new Map(
                              participants.map((a: { id: string; username: string }) => [
                                a.username,
                                a.id,
                              ])
                            );
                            const { mention, text } = parseReplyDisplay(
                              replyComment.content
                            );

                            return (
                              <div
                                key={replyComment.id}
                                id={`postcard-cmt-${replyComment.id}`}
                                className={
                                  highlightCommentId === replyComment.id
                                    ? 'postcard-cmt--highlight'
                                    : undefined
                                }
                                style={{
                                  marginBottom: '8px',
                                  padding: '8px',
                                  background: '#f0f0f0',
                                  borderRadius: '8px',
                                }}
                              >
                                <div
                                  className="flex-wrap-sm"
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'flex-start',
                                    gap: 6,
                                    rowGap: 2,
                                  }}
                                >
                                  <div
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '8px',
                                      flexWrap: 'wrap',
                                      minWidth: 0,
                                    }}
                                  >
                                    <UserProfileLink
                                      userId={replyComment.author.id}
                                      username={replyComment.author.username}
                                      style={{ fontSize: '14px' }}
                                    />
                                    {mention &&
                                      (nameToId.has(mention) ? (
                                        <AtUserLink
                                          userId={nameToId.get(mention)!}
                                          mentionUsername={mention}
                                        />
                                      ) : (
                                        <span
                                          className="text-line-fit"
                                          style={{
                                            display: 'inline-block',
                                            fontSize: 12,
                                            color: '#c0c0c0',
                                            verticalAlign: 'bottom',
                                          }}
                                        >
                                          @{mention}
                                        </span>
                                      ))}
                                  </div>
                                  <div
                                    style={{ fontSize: '12px', color: '#999' }}
                                  >
                                    {new Date(
                                      replyComment.createdAt
                                    ).toLocaleString()}
                                  </div>
                                </div>
                                {(() => {
                                  const isExpanded = !!expandedTextMap[replyComment.id];
                                  const isLong = lineCount(text) > PREVIEW_LINES;
                                  return (
                                    <p
                                  className="text-line-fit"
                                  style={{
                                    fontSize: '14px',
                                    marginTop: '4px',
                                    marginBottom: '8px',
                                    whiteSpace: 'pre-wrap',
                                    overflow: isLong && !isExpanded ? 'hidden' : 'visible',
                                    display: isLong && !isExpanded ? '-webkit-box' : 'block',
                                    WebkitLineClamp:
                                      isLong && !isExpanded ? PREVIEW_LINES : 'unset',
                                    WebkitBoxOrient:
                                      isLong && !isExpanded ? 'vertical' : 'unset',
                                  }}
                                >
                                  {text}
                                </p>
                                  );
                                })()}
                                <div
                                  className="flex-wrap-sm"
                                  style={{
                                    display: 'flex',
                                    gap: '12px',
                                    fontSize: '12px',
                                    rowGap: 4,
                                  }}
                                >
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setReplyingTo({
                                        commentId: replyComment.id,
                                      })
                                    }
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      color: '#0070f3',
                                      cursor: 'pointer',
                                      padding: '0',
                                    }}
                                  >
                                    回复
                                  </button>
                                  {lineCount(text) > PREVIEW_LINES && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setExpandedTextMap((prev) => ({
                                          ...prev,
                                          [replyComment.id]: !prev[replyComment.id],
                                        }))
                                      }
                                      style={{
                                        background: 'none',
                                        border: 'none',
                                        color: '#0070f3',
                                        cursor: 'pointer',
                                        padding: '0',
                                      }}
                                    >
                                      {expandedTextMap[replyComment.id]
                                        ? '收起此评论'
                                        : '展开此评论'}
                                    </button>
                                  )}
                                  {isAdmin && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleDeleteComment(replyComment.id)
                                      }
                                      style={{
                                        background: 'none',
                                        border: 'none',
                                        color: '#c0392b',
                                        cursor: 'pointer',
                                        padding: '0',
                                      }}
                                    >
                                      删除
                                    </button>
                                  )}
                                </div>
                                {replyingTo?.commentId === replyComment.id && (
                                  <div
                                    style={{
                                      marginTop: '8px',
                                      display: 'flex',
                                      gap: '8px',
                                    }}
                                  >
                                    <textarea
                                      className="text-line-fit"
                                      rows={Math.min(
                                        MAX_COMMENT_LINES,
                                        Math.max(
                                          1,
                                          lineCount(replyInputs[replyComment.id] || '')
                                        )
                                      )}
                                      value={
                                        replyInputs[replyComment.id] || ''
                                      }
                                      onChange={(e) =>
                                        setReplyInputs((prev) => ({
                                          ...prev,
                                          [replyComment.id]: clampLines(
                                            e.target.value,
                                            MAX_COMMENT_LINES
                                          ),
                                        }))
                                      }
                                      placeholder={`回复 @${replyComment.author.username}...`}
                                      style={{
                                        flex: 1,
                                        padding: '6px 10px',
                                        borderRadius: '8px',
                                        border: '1px solid #eaeaea',
                                        fontSize: '14px',
                                        minHeight: '36px',
                                        resize: 'vertical',
                                      }}
                                      onKeyDown={(e) => {
                                        if (isSubmitShortcut(e)) {
                                          e.preventDefault();
                                          handleReply(replyComment.id);
                                        }
                                      }}
                                    />
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleReply(replyComment.id)
                                      }
                                      style={{
                                        padding: '6px 12px',
                                        background: '#0070f3',
                                        color: 'white',
                                        borderRadius: '12px',
                                        border: 'none',
                                        fontSize: '12px',
                                        cursor: 'pointer',
                                      }}
                                    >
                                      发送
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}

                        {layerReplies.length > 5 && (
                          <button
                            type="button"
                            onClick={() =>
                              setVisibleLayerComments((prev) => ({
                                ...prev,
                                [mainComment.id]:
                                  (prev[mainComment.id] || 5) + 5,
                              }))
                            }
                            style={{
                              marginTop: '8px',
                              padding: '4px 8px',
                              background: 'none',
                              border: '1px solid #0070f3',
                              color: '#0070f3',
                              borderRadius: '4px',
                              fontSize: '12px',
                              cursor: 'pointer',
                              marginRight: '8px',
                            }}
                          >
                            更多评论
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() =>
                            setExpandedLayers((prev) => ({
                              ...prev,
                              [mainComment.id]: false,
                            }))
                          }
                          style={{
                            marginTop: '8px',
                            padding: '4px 8px',
                            background: 'none',
                            border: '1px solid #999',
                            color: '#666',
                            borderRadius: '4px',
                            fontSize: '12px',
                            cursor: 'pointer',
                          }}
                        >
                          收起本层评论
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

            {commentBlock.mainComments?.length > visibleMainComments && (
              <button
                type="button"
                onClick={() =>
                  setVisibleMainComments((n) => n + 5)
                }
                style={{
                  marginTop: '12px',
                  padding: '8px 16px',
                  background: 'none',
                  border: '1px solid #0070f3',
                  color: '#0070f3',
                  borderRadius: '8px',
                  fontSize: '14px',
                  cursor: 'pointer',
                  width: '100%',
                  marginBottom: '8px',
                }}
              >
                更多评论
              </button>
            )}

            <button
              type="button"
              onClick={() => setExpandedComments(false)}
              style={{
                marginTop: '8px',
                padding: '8px 16px',
                background: 'none',
                border: '1px solid #999',
                color: '#666',
                borderRadius: '8px',
                fontSize: '14px',
                cursor: 'pointer',
                width: '100%',
              }}
            >
              收起所有评论
            </button>
          </div>
        )}

      <div style={{ display: 'flex', gap: '8px' }}>
        <textarea
          className="text-line-fit"
          rows={Math.min(MAX_COMMENT_LINES, Math.max(1, lineCount(commentInput)))}
          value={commentInput}
          onChange={(e) => setCommentInput(clampLines(e.target.value, MAX_COMMENT_LINES))}
          placeholder="写下你的评论..."
          style={{
            flex: 1,
            padding: '8px 12px',
            borderRadius: '10px',
            border: '1px solid #eaeaea',
            fontSize: '14px',
            minHeight: '36px',
            resize: 'vertical',
          }}
          onKeyDown={(e) => {
            if (isSubmitShortcut(e)) {
              e.preventDefault();
              handleCommentSubmit();
            }
          }}
        />
        <button
          type="button"
          onClick={handleCommentSubmit}
          className="btn-primary"
          style={{
            padding: '8px 16px',
            background: '#0070f3',
            color: 'white',
            borderRadius: '16px',
            border: 'none',
            fontSize: '14px',
            cursor: 'pointer',
          }}
        >
          发送
        </button>
      </div>

      {showDeleteConfirm && (
        <div
          className="modal-backdrop"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.5)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            zIndex: 200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
          role="presentation"
          onClick={() => !deleting && setShowDeleteConfirm(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="modal-content"
            style={{
              background: 'white',
              borderRadius: 'var(--radius-lg)',
              padding: '28px',
              maxWidth: 380,
              width: '100%',
              boxShadow: 'var(--shadow-xl)',
              border: '1px solid var(--border)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p style={{ fontSize: 17, marginBottom: 8, fontWeight: 600, color: 'var(--fg)' }}>
              删除帖子？
            </p>
            <p style={{ fontSize: 14, color: 'var(--fg-muted)', marginBottom: 24, lineHeight: 1.6 }}>
              删除后无法恢复，确定要删除这条帖子吗？
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                type="button"
                disabled={deleting}
                onClick={() => setShowDeleteConfirm(false)}
                className="btn-secondary"
                style={{
                  padding: '9px 18px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                  background: 'white',
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: deleting ? 'not-allowed' : 'pointer',
                }}
              >
                取消
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleConfirmDelete}
                className="btn-danger"
                style={{
                  padding: '9px 18px',
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  background: 'var(--danger)',
                  color: 'white',
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: deleting ? 'not-allowed' : 'pointer',
                }}
              >
                {deleting ? '删除中…' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}
      {previewImageUrl && (
        <div
          role="presentation"
          onClick={() => setPreviewImageUrl(null)}
          className="modal-backdrop"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.72)',
            zIndex: 260,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
        >
          <img
            src={previewImageUrl}
            alt="预览图"
            className="modal-content"
            style={{
              maxWidth: '92vw',
              maxHeight: '92vh',
              objectFit: 'contain',
              borderRadius: '10px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
            }}
          />
        </div>
      )}
    </div>
  );
}
