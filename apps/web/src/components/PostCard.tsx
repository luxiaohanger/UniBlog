'use client';
import { useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '../lib/http';

interface Author {
  id: string;
  username: string;
}

interface Media {
  id: string;
  url: string;
}

interface Comment {
  id: string;
  content: string;
  createdAt: string;
  author: Author;
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
  comments?: Comment[];
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

export default function PostCard({ post, postState, onUpdatePost, onUpdatePostState }: PostCardProps) {
  const [expandedComments, setExpandedComments] = useState(false);
  const [commentInput, setCommentInput] = useState('');
  const [replyInput, setReplyInput] = useState('');
  const [replyingTo, setReplyingTo] = useState<{ commentId: string; username: string } | null>(null);
  const [localComments, setLocalComments] = useState<Comment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);

  const fetchComments = async () => {
    if (localComments.length > 0) return; // 已经加载过评论
    
    setLoadingComments(true);
    try {
      const data = await apiFetch<any>(`/posts/${post.id}`);
      setLocalComments(data.post.comments || []);
    } catch (err) {
      console.error('获取评论失败:', err);
    } finally {
      setLoadingComments(false);
    }
  };

  const handleToggleComments = () => {
    if (!expandedComments) {
      fetchComments();
    }
    setExpandedComments(!expandedComments);
  };

  const handleLike = async () => {
    try {
      if (postState.liked) {
        await apiFetch(`/social/posts/${post.id}/likes`, { method: 'DELETE' });
        onUpdatePostState(post.id, { liked: false });
        onUpdatePost({
          ...post,
          counts: { ...post.counts, likes: Math.max(0, post.counts.likes - 1) }
        });
      } else {
        await apiFetch(`/social/posts/${post.id}/likes`, { method: 'POST' });
        onUpdatePostState(post.id, { liked: true });
        onUpdatePost({
          ...post,
          counts: { ...post.counts, likes: post.counts.likes + 1 }
        });
      }
    } catch (err) {
      console.error('点赞操作失败:', err);
    }
  };

  const handleFavorite = async () => {
    try {
      if (postState.favorited) {
        await apiFetch(`/social/posts/${post.id}/favorites`, { method: 'DELETE' });
        onUpdatePostState(post.id, { favorited: false });
        onUpdatePost({
          ...post,
          counts: { ...post.counts, favorites: Math.max(0, post.counts.favorites - 1) }
        });
      } else {
        await apiFetch(`/social/posts/${post.id}/favorites`, { method: 'POST' });
        onUpdatePostState(post.id, { favorited: true });
        onUpdatePost({
          ...post,
          counts: { ...post.counts, favorites: post.counts.favorites + 1 }
        });
      }
    } catch (err) {
      console.error('收藏操作失败:', err);
    }
  };

  const handleCommentSubmit = async () => {
    if (!commentInput.trim()) return;

    try {
      const data = await apiFetch<any>(`/social/posts/${post.id}/comments`, {
        method: 'POST',
        body: { content: commentInput }
      });
      
      setLocalComments([...localComments, data.comment]);
      onUpdatePost({
        ...post,
        counts: { ...post.counts, comments: post.counts.comments + 1 }
      });
      setCommentInput('');
    } catch (err) {
      console.error('发布评论失败:', err);
      alert('发布评论失败，请重试');
    }
  };

  const handleReplySubmit = async () => {
    if (!replyInput.trim() || !replyingTo) return;

    try {
      const content = `@${replyingTo.username} ${replyInput}`;
      const data = await apiFetch<any>(`/social/posts/${post.id}/comments`, {
        method: 'POST',
        body: { content }
      });
      
      setLocalComments([...localComments, data.comment]);
      onUpdatePost({
        ...post,
        counts: { ...post.counts, comments: post.counts.comments + 1 }
      });
      setReplyInput('');
      setReplyingTo(null);
    } catch (err) {
      console.error('回复评论失败:', err);
      alert('回复评论失败，请重试');
    }
  };

  // 分离主评论和回复评论
  const mainComments = localComments.filter(c => !c.content.includes('@'));
  const replyComments = localComments.filter(c => c.content.includes('@'));

  return (
    <div style={{
      background: 'white',
      borderRadius: '12px',
      padding: '16px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
    }}>
      {/* 作者信息 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
        <div>
          <Link href={`/me`} style={{ fontWeight: '500', color: '#333', textDecoration: 'none' }}>
            {post.author.username}
          </Link>
          <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>
            {new Date(post.createdAt).toLocaleString()}
          </div>
        </div>
      </div>

      {/* 帖子内容 */}
      <p style={{ marginBottom: '12px' }}>{post.content}</p>

      {/* 媒体文件 */}
      {post.media.length > 0 && (
        <div style={{ marginBottom: '12px' }}>
          {post.media.map((media) => (
            <img
              key={media.id}
              src={`http://localhost:4000${media.url}`}
              alt="Media"
              style={{
                maxWidth: '100%',
                maxHeight: '200px',
                objectFit: 'cover',
                borderRadius: '8px',
                marginTop: '8px',
                cursor: 'pointer'
              }}
              onClick={() => window.open(`http://localhost:4000${media.url}`, '_blank')}
            />
          ))}
        </div>
      )}

      {/* 操作按钮 */}
      <div style={{ display: 'flex', gap: '24px', fontSize: '14px', color: '#666', marginBottom: '16px' }}>
        <span
          style={{ cursor: 'pointer' }}
          onClick={handleToggleComments}
        >
          💬 {post.counts.comments} {expandedComments ? '(收起)' : ''}
        </span>
        <span
          style={{ cursor: 'pointer', color: postState.liked ? '#ff4757' : '#666' }}
          onClick={handleLike}
        >
          👍 {post.counts.likes}
        </span>
        <span
          style={{ cursor: 'pointer', color: postState.favorited ? '#ffa502' : '#666' }}
          onClick={handleFavorite}
        >
          ⭐ {post.counts.favorites}
        </span>
        <span>🔄 {post.counts.shares}</span>
      </div>

      {/* 评论区 */}
      {expandedComments && (
        <div style={{ paddingTop: '12px', borderTop: '1px solid #f0f0f0' }}>
          {loadingComments ? (
            <div style={{ textAlign: 'center', padding: '16px' }}>加载评论中...</div>
          ) : (
            <>
              {/* 评论列表 */}
              {mainComments.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  {mainComments.map((comment, index) => (
                    <div key={comment.id} style={{ marginBottom: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <Link href={`/me`} style={{ fontWeight: '500', color: '#333', textDecoration: 'none' }}>
                              {comment.author.username}
                            </Link>
                            <span style={{ fontSize: '12px', color: '#999' }}>
                              {new Date(comment.createdAt).toLocaleString()}
                            </span>
                            <span style={{ fontSize: '12px', color: '#0070f3', fontWeight: '500' }}>
                              层主 {index + 1}
                            </span>
                          </div>
                          <div style={{ marginTop: '8px' }}>{comment.content}</div>
                        </div>
                        <button
                          style={{
                            background: 'none',
                            border: '1px solid #ddd',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '12px',
                            cursor: 'pointer'
                          }}
                          onClick={() => setReplyingTo({ commentId: comment.id, username: comment.author.username })}
                        >
                          回复
                        </button>
                      </div>

                      {/* 回复评论 */}
                      {replyComments.filter(r => r.content.includes(`@${comment.author.username}`)).length > 0 && (
                        <div style={{ marginLeft: '24px', marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          {replyComments
                            .filter(r => r.content.includes(`@${comment.author.username}`))
                            .map((reply) => (
                              <div key={reply.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div style={{ flex: 1 }}>
                                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <Link href={`/me`} style={{ fontWeight: '500', color: '#333', textDecoration: 'none' }}>
                                      {reply.author.username}
                                    </Link>
                                    <span style={{ fontSize: '12px', color: '#999' }}>
                                      {new Date(reply.createdAt).toLocaleString()}
                                    </span>
                                  </div>
                                  <div style={{ marginTop: '4px' }}>{reply.content}</div>
                                </div>
                                <button
                                  style={{
                                    background: 'none',
                                    border: '1px solid #ddd',
                                    padding: '4px 8px',
                                    borderRadius: '4px',
                                    fontSize: '12px',
                                    cursor: 'pointer'
                                  }}
                                  onClick={() => setReplyingTo({ commentId: reply.id, username: reply.author.username })}
                                >
                                  回复
                                </button>
                              </div>
                            ))}
                        </div>
                      )}

                      {/* 回复输入框 */}
                      {replyingTo?.commentId === comment.id && (
                        <div style={{ marginLeft: '24px', marginTop: '12px' }}>
                          <textarea
                            value={replyInput}
                            onChange={(e) => setReplyInput(e.target.value)}
                            placeholder={`回复 ${comment.author.username}...`}
                            style={{
                              width: '100%',
                              padding: '8px',
                              border: '1px solid #ddd',
                              borderRadius: '4px',
                              resize: 'vertical',
                              minHeight: '60px'
                            }}
                          />
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                            <button
                              style={{
                                background: 'none',
                                border: '1px solid #ddd',
                                padding: '4px 12px',
                                borderRadius: '4px',
                                cursor: 'pointer'
                              }}
                              onClick={() => {
                                setReplyingTo(null);
                                setReplyInput('');
                              }}
                            >
                              取消
                            </button>
                            <button
                              style={{
                                background: '#0070f3',
                                color: 'white',
                                border: 'none',
                                padding: '4px 12px',
                                borderRadius: '4px',
                                cursor: 'pointer'
                              }}
                              onClick={handleReplySubmit}
                            >
                              回复
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* 评论输入框 */}
              <div>
                <textarea
                  value={commentInput}
                  onChange={(e) => setCommentInput(e.target.value)}
                  placeholder="写下你的评论..."
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    resize: 'vertical',
                    minHeight: '60px'
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                  <button
                    style={{
                      background: 'none',
                      border: '1px solid #ddd',
                      padding: '4px 12px',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                    onClick={() => setCommentInput('')}
                  >
                    取消
                  </button>
                  <button
                    style={{
                      background: '#0070f3',
                      color: 'white',
                      border: 'none',
                      padding: '4px 12px',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                    onClick={handleCommentSubmit}
                  >
                    评论
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
