'use client';

import { useState } from 'react';
import { apiFetch } from '../lib/http';
import { buildCommentTree } from '../lib/commentTree';
import { parseReplyDisplay } from '../lib/replyDisplay';
import { UserProfileLink, AtUserLink } from './UserProfileLink';

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
  shared: boolean;
}

interface PostCardProps {
  post: Post;
  postState: PostState;
  onUpdatePost: (updatedPost: Post) => void;
  onUpdatePostState: (postId: string, newState: Partial<PostState>) => void;
}

type CommentBlock = {
  mainComments: any[];
  replyComments: any[];
  layers: Record<string, number>;
};

export default function PostCard({
  post,
  postState,
  onUpdatePost,
  onUpdatePostState,
}: PostCardProps) {
  const [expandedComments, setExpandedComments] = useState(false);
  const [commentBlock, setCommentBlock] = useState<CommentBlock | null>(null);
  const [expandedLayers, setExpandedLayers] = useState<Record<string, boolean>>({});
  const [visibleLayerComments, setVisibleLayerComments] = useState<Record<string, number>>({});
  const [visibleMainComments, setVisibleMainComments] = useState(3);
  const [commentInput, setCommentInput] = useState('');
  const [replyInputs, setReplyInputs] = useState<Record<string, string>>({});
  const [replyingTo, setReplyingTo] = useState<{ commentId: string } | null>(null);
  const [loadingComments, setLoadingComments] = useState(false);

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

  const handleToggleComments = () => {
    if (expandedComments) {
      setExpandedComments(false);
    } else {
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

      setCommentBlock((prev) => {
        if (prev) {
          const newMainComments = [data.comment, ...(prev.mainComments || [])];
          newMainComments.sort(
            (a, b) =>
              new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
          const newLayers = { ...prev.layers };
          newMainComments.forEach((comment: any, index: number) => {
            newLayers[comment.id] = index + 1;
          });
          return {
            ...prev,
            mainComments: newMainComments,
            layers: newLayers,
          };
        }
        return {
          mainComments: [data.comment],
          replyComments: [],
          layers: { [data.comment.id]: 1 },
        };
      });

      setExpandedLayers((prev) => ({
        ...prev,
        [data.comment.id]: false,
      }));
      setVisibleLayerComments((prev) => ({
        ...prev,
        [data.comment.id]: 0,
      }));

      onUpdatePost({
        ...post,
        counts: {
          ...post.counts,
          comments: (post.counts?.comments || 0) + 1,
        },
      });
      setCommentInput('');
    } catch (err) {
      console.error('发布评论失败:', err);
      alert('发布评论失败，请重试');
    }
  };

  const handleReply = async (commentId: string) => {
    const content = replyInputs[commentId];
    if (!content?.trim()) return;

    const targetComment =
      commentBlock?.mainComments?.find((c: any) => c.id === commentId) ||
      commentBlock?.replyComments?.find((c: any) => c.id === commentId);
    if (!targetComment) return;

    try {
      const data = await apiFetch<any>(`/social/posts/${post.id}/comments`, {
        method: 'POST',
        body: { content: `@${targetComment.author.username} ${content}` },
      });

      setCommentBlock((prev) => {
        if (!prev) {
          return {
            mainComments: [],
            replyComments: [data.comment],
            layers: { [data.comment.id]: 1 },
          };
        }
        const newLayers = { ...prev.layers };
        newLayers[data.comment.id] = prev.layers?.[commentId] || 1;
        const newReplyComments = [data.comment, ...(prev.replyComments || [])];
        newReplyComments.sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        return {
          ...prev,
          replyComments: newReplyComments,
          layers: newLayers,
        };
      });

      setReplyInputs((prev) => ({ ...prev, [commentId]: '' }));
      setReplyingTo(null);

      onUpdatePost({
        ...post,
        counts: {
          ...post.counts,
          comments: (post.counts?.comments || 0) + 1,
        },
      });
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
    } catch (err) {
      console.error('收藏操作失败:', err);
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
      </div>

      <p style={{ marginBottom: '12px' }}>{post.content}</p>

      {post.media.length > 0 && (
        <div style={{ marginBottom: '12px' }}>
          {post.media.map((media) => (
            <img
              key={media.id}
              src={`http://localhost:4000${media.url}`}
              alt="Media"
              style={{
                maxWidth: '100%',
                maxHeight: '300px',
                objectFit: 'cover',
                borderRadius: '8px',
                marginTop: '8px',
                cursor: 'pointer',
              }}
              onClick={() =>
                window.open(`http://localhost:4000${media.url}`, '_blank')
              }
            />
          ))}
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
        <span style={{ cursor: 'pointer' }} onClick={handleToggleComments}>
          💬 {post.counts.comments}{' '}
          {expandedComments ? '(收起)' : ''}
        </span>
        <span
          style={{
            cursor: 'pointer',
            color: postState.liked ? '#ff4757' : '#666',
          }}
          onClick={handleLike}
        >
          👍 {post.counts.likes}
        </span>
        <span
          style={{
            cursor: 'pointer',
            color: postState.favorited ? '#ffa502' : '#666',
          }}
          onClick={handleFavorite}
        >
          ⭐ {post.counts.favorites}
        </span>
        <span>🔄 {post.counts.shares}</span>
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
                  <div key={mainComment.id} style={{ marginBottom: '16px' }}>
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
                      <p
                        style={{
                          fontSize: '14px',
                          marginTop: '4px',
                          marginBottom: '8px',
                        }}
                      >
                        {mainComment.content}
                      </p>
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
                          <input
                            type="text"
                            value={replyInputs[mainComment.id] || ''}
                            onChange={(e) =>
                              setReplyInputs((prev) => ({
                                ...prev,
                                [mainComment.id]: e.target.value,
                              }))
                            }
                            placeholder={`回复 @${mainComment.author.username}...`}
                            style={{
                              flex: 1,
                              padding: '6px 10px',
                              borderRadius: '12px',
                              border: '1px solid #eaeaea',
                              fontSize: '14px',
                            }}
                            onKeyDown={(e) =>
                              e.key === 'Enter' && handleReply(mainComment.id)
                            }
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
                                <p
                                  style={{
                                    fontSize: '14px',
                                    marginTop: '4px',
                                    marginBottom: '8px',
                                  }}
                                >
                                  {text}
                                </p>
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
                                </div>
                                {replyingTo?.commentId === replyComment.id && (
                                  <div
                                    style={{
                                      marginTop: '8px',
                                      display: 'flex',
                                      gap: '8px',
                                    }}
                                  >
                                    <input
                                      type="text"
                                      value={
                                        replyInputs[replyComment.id] || ''
                                      }
                                      onChange={(e) =>
                                        setReplyInputs((prev) => ({
                                          ...prev,
                                          [replyComment.id]: e.target.value,
                                        }))
                                      }
                                      placeholder={`回复 @${replyComment.author.username}...`}
                                      style={{
                                        flex: 1,
                                        padding: '6px 10px',
                                        borderRadius: '12px',
                                        border: '1px solid #eaeaea',
                                        fontSize: '14px',
                                      }}
                                      onKeyDown={(e) =>
                                        e.key === 'Enter' &&
                                        handleReply(replyComment.id)
                                      }
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
        <input
          type="text"
          value={commentInput}
          onChange={(e) => setCommentInput(e.target.value)}
          placeholder="写下你的评论..."
          style={{
            flex: 1,
            padding: '8px 12px',
            borderRadius: '16px',
            border: '1px solid #eaeaea',
            fontSize: '14px',
          }}
          onKeyDown={(e) => e.key === 'Enter' && handleCommentSubmit()}
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
    </div>
  );
}
