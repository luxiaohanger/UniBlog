'use client';

import { useState, useLayoutEffect, type KeyboardEvent as ReactKeyboardEvent } from 'react';
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
  if (target?.layerMainId) return target.layerMainId as string;
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
}

export default function PostCard({
  post,
  postState,
  onUpdatePost,
  onUpdatePostState,
  onDeletePost,
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
  const canDeletePost = isOwnPost || isAdmin;

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
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

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
      style={{
        background: 'white',
        borderRadius: '12px',
        padding: '16px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '12px',
        }}
      >
        <div>
          <UserProfileLink userId={post.author.id} username={post.author.username} />
          <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>
            {new Date(post.createdAt).toLocaleString()}
          </div>
        </div>
        {canDeletePost && (
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            style={{
              fontSize: '13px',
              color: '#999',
              background: 'none',
              border: '1px solid #e0e0e0',
              borderRadius: '6px',
              padding: '4px 10px',
            }}
          >
            {isAdmin && !isOwnPost ? '删除（管理）' : '删除'}
          </button>
        )}
      </div>

      <p
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

      {post.media.length > 0 && (
        <div style={{ marginBottom: '12px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            {post.media.slice(0, 3).map((media) => (
              <img
                key={media.id}
                src={`http://localhost:4000${media.url}`}
                alt="Media"
                title="双击查看大图"
                style={{
                  width: 'calc((100% - 16px) / 3)',
                  height: '110px',
                  objectFit: 'cover',
                  borderRadius: '8px',
                  cursor: 'zoom-in',
                }}
                onDoubleClick={() =>
                  setPreviewImageUrl(`http://localhost:4000${media.url}`)
                }
              />
            ))}
          </div>
        </div>
      )}

      <div
        style={{
          display: 'flex',
          gap: '24px',
          fontSize: '14px',
          color: '#666',
          marginBottom: '16px',
        }}
      >
        <span style={{ cursor: 'pointer' }} onClick={handleOpenComments}>
          💬 {post.counts.comments}
        </span>
        <span
          role="button"
          tabIndex={0}
          className={likeAnim ? 'post-action-hit' : undefined}
          onAnimationEnd={() => setLikeAnim(false)}
          style={{
            cursor: 'pointer',
            color: postState.liked ? '#ff4757' : '#666',
          }}
          onClick={handleLike}
          onKeyDown={(e) => e.key === 'Enter' && handleLike()}
        >
          👍 {post.counts.likes}
        </span>
        <span
          role="button"
          tabIndex={0}
          className={favAnim ? 'post-action-hit' : undefined}
          onAnimationEnd={() => setFavAnim(false)}
          style={{
            cursor: 'pointer',
            color: postState.favorited ? '#ffa502' : '#666',
          }}
          onClick={handleFavorite}
          onKeyDown={(e) => e.key === 'Enter' && handleFavorite()}
        >
          ⭐ {post.counts.favorites}
        </span>
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
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
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
                        style={{
                          display: 'flex',
                          gap: '12px',
                          fontSize: '12px',
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
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'flex-start',
                                  }}
                                >
                                  <div
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '8px',
                                      flexWrap: 'wrap',
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
                                          style={{
                                            fontSize: 12,
                                            color: '#c0c0c0',
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
                                  style={{
                                    display: 'flex',
                                    gap: '12px',
                                    fontSize: '12px',
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
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
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
            style={{
              background: 'white',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: 360,
              width: '100%',
              boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p style={{ fontSize: '16px', marginBottom: '8px', fontWeight: 600 }}>
              删除帖子？
            </p>
            <p style={{ fontSize: '14px', color: '#666', marginBottom: '20px' }}>
              删除后无法恢复，确定要删除这条帖子吗？
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                disabled={deleting}
                onClick={() => setShowDeleteConfirm(false)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: '1px solid #ddd',
                  background: 'white',
                  cursor: deleting ? 'not-allowed' : 'pointer',
                }}
              >
                取消
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleConfirmDelete}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  background: '#e74c3c',
                  color: 'white',
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
