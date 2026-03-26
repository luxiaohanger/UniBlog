'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../../lib/http';
import { getTokens } from '../../lib/token';

export default function CirclesPage() {
  const router = useRouter();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [comments, setComments] = useState({});
  const [commentInputs, setCommentInputs] = useState({});
  const [replyInputs, setReplyInputs] = useState({});
  const [replyingTo, setReplyingTo] = useState(null);
  const [postStates, setPostStates] = useState({});
  const [expandedComments, setExpandedComments] = useState({});
  const [expandedLayers, setExpandedLayers] = useState({});
  const [visibleLayerComments, setVisibleLayerComments] = useState({});
  const [visibleMainComments, setVisibleMainComments] = useState({});
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    // 检查登录状态
    const checkLoginStatus = () => {
      const tokens = getTokens();
      if (!tokens) {
        // 未登录，重定向到登录页面
        router.replace('/login');
        return false;
      }
      setIsLoggedIn(true);
      return true;
    };

    // 只有登录后才获取帖子数据
    if (checkLoginStatus()) {
      const fetchPosts = async () => {
        try {
          const data = await apiFetch<any>('/posts/feed');
          setPosts(data.posts);
          // 初始化评论输入框和评论数据
          const initialInputs = {};
          const initialComments = {};
          const initialReplyInputs = {};
          const initialStates = {};
          const initialExpandedComments = {};
          const initialExpandedLayers = {};
          const initialVisibleLayerComments = {};
          const initialVisibleMainComments = {};
          data.posts.forEach(post => {
            initialInputs[post.id] = '';
            initialComments[post.id] = [];
            initialReplyInputs[post.id] = {};
            initialStates[post.id] = { liked: false, favorited: false, shared: false };
            initialExpandedComments[post.id] = false;
            initialExpandedLayers[post.id] = {};
            initialVisibleLayerComments[post.id] = {};
            initialVisibleMainComments[post.id] = 3; // 默认显示前3个主评论
          });
          setCommentInputs(initialInputs);
          setComments(initialComments);
          setReplyInputs(initialReplyInputs);
          setPostStates(initialStates);
          setExpandedComments(initialExpandedComments);
          setExpandedLayers(initialExpandedLayers);
          setVisibleLayerComments(initialVisibleLayerComments);
          setVisibleMainComments(initialVisibleMainComments);

          // 获取每个帖子的状态
          data.posts.forEach(post => {
            fetchPostState(post.id);
          });
        } catch (err) {
          console.error('获取帖子失败:', err);
          // 如果获取失败，可能是token过期，重定向到登录页面
          router.replace('/login');
        } finally {
          setLoading(false);
        }
      };
      fetchPosts();
    } else {
      setLoading(false);
    }
  }, [router]);

  const fetchPostState = async (postId) => {
    try {
      const data = await apiFetch<any>(`/social/posts/${postId}/states`);
      setPostStates(prev => ({
        ...prev,
        [postId]: data
      }));
    } catch (err) {
      console.error('获取帖子状态失败:', err);
    }
  };

  const fetchPostDetails = async (postId) => {
    try {
      const data = await apiFetch<any>(`/posts/${postId}`);
      // 对评论进行分层处理
      const postComments = data.post.comments;

      // 初始化层状态
      const layers = {};
      const expandedLayers = {};
      const visibleLayerComments = {};

      // 按时间排序评论
      const sortedComments = postComments.sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );

      // 分离主评论和回复评论
      // 主评论：直接回复帖子的评论，不包含@符号或者虽然包含@但不是回复特定用户的评论
      // 回复评论：包含@符号的评论，是对其他评论的回复
      const mainComments = [];
      const replyComments = [];

      sortedComments.forEach(comment => {
        if (comment.content.includes('@') && comment.content.match(/@\w+/)) {
          replyComments.push(comment);
        } else {
          mainComments.push(comment);
        }
      });

      // 为主评论分配层号，按时间顺序从1开始递增
      mainComments.forEach((comment, index) => {
        layers[comment.id] = index + 1; // 从1开始递增
        expandedLayers[comment.id] = false;
        visibleLayerComments[comment.id] = 0; // 默认不显示层内评论
      });

      // 为回复评论分配层号，使用对应的主评论的层号
      // 这里我们需要建立一个映射，将每个评论ID映射到对应的主评论ID
      // 然后根据主评论的层号来设置回复评论的层号
      const commentMap = {};
      mainComments.forEach(comment => {
        commentMap[comment.id] = comment;
      });
      replyComments.forEach(comment => {
        commentMap[comment.id] = comment;
      });

      // 为回复评论分配层号
      replyComments.forEach(reply => {
        // 尝试找到回复的目标评论
        // 这里简化处理，我们假设回复的目标评论是主评论
        // 实际应用中可能需要更复杂的逻辑来确定回复的目标

        // 首先尝试通过@用户名找到对应的主评论
        const match = reply.content.match(/@(\w+)/);
        if (match) {
          const targetUsername = match[1];
          // 找到时间上最近的、用户名匹配的主评论
          const targetMainComment = mainComments
            .filter(c => c.author.username === targetUsername)
            .reverse()
            .find(c => new Date(c.createdAt) < new Date(reply.createdAt));

          if (targetMainComment) {
            layers[reply.id] = layers[targetMainComment.id];
          } else {
            // 如果找不到对应的主评论，默认为第一层
            layers[reply.id] = 1;
          }
        } else {
          // 如果没有@用户名，默认为第一层
          layers[reply.id] = 1;
        }
      });

      setComments(prev => ({
        ...prev,
        [postId]: { mainComments, replyComments, layers }
      }));

      // 展开评论区
      setExpandedComments(prev => ({
        ...prev,
        [postId]: true
      }));

      // 设置层状态
      setExpandedLayers(prev => ({
        ...prev,
        [postId]: expandedLayers
      }));

      setVisibleLayerComments(prev => ({
        ...prev,
        [postId]: visibleLayerComments
      }));
    } catch (err) {
      console.error('获取帖子详情失败:', err);
    }
  };

  const handleCommentSubmit = async (postId) => {
    const content = commentInputs[postId];
    if (!content || !content.trim()) return;

    try {
      console.log('提交评论:', { postId, content });
      const data = await apiFetch<any>(`/social/posts/${postId}/comments`, {
        method: 'POST',
        body: { content }
      });
      console.log('评论提交成功:', data);

      // 更新评论列表
      setComments(prev => {
        const currentComments = prev[postId];
        if (currentComments) {
          // 如果已经有评论数据，更新分层结构
          const newMainComments = [data.comment, ...(currentComments.mainComments || [])];
          // 按时间顺序排序主评论
          newMainComments.sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
          // 更新层号
          const newLayers = { ...(currentComments.layers || {}) };
          newMainComments.forEach((comment, index) => {
            newLayers[comment.id] = index + 1;
          });
          return {
            ...prev,
            [postId]: {
              ...currentComments,
              mainComments: newMainComments,
              layers: newLayers
            }
          };
        } else {
          // 如果没有评论数据，创建新的分层结构
          return {
            ...prev,
            [postId]: {
              mainComments: [data.comment],
              replyComments: [],
              layers: { [data.comment.id]: 1 }
            }
          };
        }
      });

      // 清空输入框
      setCommentInputs(prev => ({
        ...prev,
        [postId]: ''
      }));

      // 更新帖子的评论计数
      setPosts(prev => prev.map(post =>
        post.id === postId
          ? { ...post, counts: { ...(post.counts || {}), comments: (post.counts?.comments || 0) + 1 } }
          : post
      ));
    } catch (err) {
      console.error('发布评论失败:', err);
      alert('发布评论失败，请重试');
    }
  };

  const handleLike = async (postId) => {
    try {
      const currentState = postStates[postId]?.liked || false;
      if (currentState) {
        // 取消点赞
        await apiFetch(`/social/posts/${postId}/likes`, {
          method: 'DELETE'
        });
        // 更新状态和计数
        setPostStates(prev => ({
          ...prev,
          [postId]: { ...prev[postId], liked: false }
        }));
        setPosts(prev => prev.map(post =>
          post.id === postId
            ? { ...post, counts: { ...post.counts, likes: Math.max(0, post.counts.likes - 1) } }
            : post
        ));

      } else {
        // 点赞
        await apiFetch(`/social/posts/${postId}/likes`, {
          method: 'POST'
        });
        // 更新状态和计数
        setPostStates(prev => ({
          ...prev,
          [postId]: { ...prev[postId], liked: true }
        }));
        setPosts(prev => prev.map(post =>
          post.id === postId
            ? { ...post, counts: { ...post.counts, likes: post.counts.likes + 1 } }
            : post
        ));
      }
    } catch (err) {
      console.error('点赞操作失败:', err);
    }
  };

  const handleFavorite = async (postId) => {
    try {
      const currentState = postStates[postId]?.favorited || false;
      if (currentState) {
        // 取消收藏
        await apiFetch(`/social/posts/${postId}/favorites`, {
          method: 'DELETE'
        });
        // 更新状态和计数
        setPostStates(prev => ({
          ...prev,
          [postId]: { ...prev[postId], favorited: false }
        }));
        setPosts(prev => prev.map(post =>
          post.id === postId
            ? { ...post, counts: { ...post.counts, favorites: Math.max(0, post.counts.favorites - 1) } }
            : post
        ));

      } else {
        // 收藏
        await apiFetch(`/social/posts/${postId}/favorites`, {
          method: 'POST'
        });
        // 更新状态和计数
        setPostStates(prev => ({
          ...prev,
          [postId]: { ...prev[postId], favorited: true }
        }));
        setPosts(prev => prev.map(post =>
          post.id === postId
            ? { ...post, counts: { ...post.counts, favorites: post.counts.favorites + 1 } }
            : post
        ));
      }
    } catch (err) {
      console.error('收藏操作失败:', err);
    }
  };

  const handleReply = async (postId, commentId) => {
    const content = replyInputs[postId]?.[commentId];
    if (!content || !content.trim()) return;

    try {
      // 这里简化处理，实际应该调用API的回复端点
      // 由于API没有回复端点，我们暂时将回复作为新评论添加
      const targetComment = comments[postId]?.mainComments?.find(c => c.id === commentId) || comments[postId]?.replyComments?.find(c => c.id === commentId);
      if (!targetComment) return;

      const data = await apiFetch<any>(`/social/posts/${postId}/comments`, {
        method: 'POST',
        body: { content: `@${targetComment.author.username} ${content}` }
      });

      // 更新评论列表
      setComments(prev => {
        const currentComments = prev[postId];
        if (currentComments) {
          // 为新回复评论分配层号
          const newLayers = { ...(currentComments.layers || {}) };
          // 使用目标评论的层号
          newLayers[data.comment.id] = currentComments.layers?.[commentId] || 1;

          // 更新回复评论列表
          const newReplyComments = [data.comment, ...(currentComments.replyComments || [])];
          // 按时间顺序排序回复评论
          newReplyComments.sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );

          return {
            ...prev,
            [postId]: {
              ...currentComments,
              replyComments: newReplyComments,
              layers: newLayers
            }
          };
        } else {
          // 如果没有评论数据，创建新的分层结构
          return {
            ...prev,
            [postId]: {
              mainComments: [],
              replyComments: [data.comment],
              layers: { [data.comment.id]: 1 }
            }
          };
        }
      });

      // 清空回复输入框
      setReplyInputs(prev => ({
        ...prev,
        [postId]: {
          ...(prev[postId] || {}),
          [commentId]: ''
        }
      }));

      // 取消回复状态
      setReplyingTo(null);

      // 更新帖子的评论计数
      setPosts(prev => prev.map(post =>
        post.id === postId
          ? { ...post, counts: { ...(post.counts || {}), comments: (post.counts?.comments || 0) + 1 } }
          : post
      ));
    } catch (err) {
      console.error('回复评论失败:', err);
    }
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '48px' }}>加载中...</div>;
  }

  return (
    <div>
      <h1 style={{ fontSize: '24px', marginBottom: '24px' }}>校园动态</h1>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {posts.map((post) => (
          <div key={post.id} style={{
            background: 'white',
            borderRadius: '12px',
            padding: '16px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
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
                      cursor: 'pointer'
                    }}
                    onClick={() => window.open(`http://localhost:4000${media.url}`, '_blank')}
                  />
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: '24px', fontSize: '14px', color: '#666', marginBottom: '16px' }}>
              <span
                style={{ cursor: 'pointer' }}
                onClick={() => {
                  if (expandedComments[post.id]) {
                    // 折叠评论区
                    setExpandedComments(prev => ({
                      ...prev,
                      [post.id]: false
                    }));
                  } else {
                    // 展开评论区并获取评论
                    fetchPostDetails(post.id);
                  }
                }}
              >
                💬 {post.counts.comments} {expandedComments[post.id] ? '(收起)' : ''}
              </span>
              <span
                style={{ cursor: 'pointer', color: postStates[post.id]?.liked ? '#ff4757' : '#666' }}
                onClick={() => handleLike(post.id)}
              >
                👍 {post.counts.likes}
              </span>
              <span
                style={{ cursor: 'pointer', color: postStates[post.id]?.favorited ? '#ffa502' : '#666' }}
                onClick={() => handleFavorite(post.id)}
              >
                ⭐ {post.counts.favorites}
              </span>
              <span>🔄 {post.counts.shares}</span>
            </div>

            {/* 评论列表 */}
            {expandedComments[post.id] && comments[post.id] && (comments[post.id].mainComments?.length > 0 || comments[post.id].replyComments?.length > 0) && (
              <div style={{ marginBottom: '16px', paddingTop: '12px', borderTop: '1px solid #f0f0f0' }}>
                {/* 主评论（层主） */}
                {comments[post.id].mainComments?.slice(0, visibleMainComments[post.id]).map((mainComment) => {
                  const layer = comments[post.id].layers[mainComment.id];

                  // 获取该层的回复评论
                  const layerReplies = (comments[post.id].replyComments?.filter(reply => {
                    // 使用层号匹配逻辑，确保回复评论显示在对应的层下
                    return comments[post.id].layers[reply.id] === comments[post.id].layers[mainComment.id];
                  }) || []).sort(
                    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
                  );

                  return (
                    <div key={mainComment.id} style={{ marginBottom: '16px' }}>
                      {/* 层主评论 */}
                      <div style={{
                        marginBottom: '8px',
                        padding: '8px',
                        background: '#f9f9f9',
                        borderRadius: '8px'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Link href={`/me`} style={{ fontWeight: '500', color: '#333', textDecoration: 'none', fontSize: '14px' }}>
                              {mainComment.author.username}
                            </Link>
                            <span style={{ fontSize: '12px', color: '#999' }}>{layer}层</span>
                          </div>
                          <div style={{ fontSize: '12px', color: '#999' }}>
                            {new Date(mainComment.createdAt).toLocaleString()}
                          </div>
                        </div>
                        <p style={{ fontSize: '14px', marginTop: '4px', marginBottom: '8px' }}>{mainComment.content}</p>
                        <div style={{ display: 'flex', gap: '12px', fontSize: '12px' }}>
                          <button
                            onClick={() => setReplyingTo({ postId: post.id, commentId: mainComment.id })}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#0070f3',
                              cursor: 'pointer',
                              padding: '0'
                            }}
                          >
                            回复
                          </button>
                          {/* 显示/隐藏本层评论按钮 */}
                          {layerReplies.length > 0 && (
                            <button
                              onClick={() => setExpandedLayers(prev => ({
                                ...prev,
                                [post.id]: {
                                  ...prev[post.id],
                                  [mainComment.id]: !prev[post.id]?.[mainComment.id]
                                }
                              }))}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: '#0070f3',
                                cursor: 'pointer',
                                padding: '0'
                              }}
                            >
                              {expandedLayers[post.id]?.[mainComment.id] ? '收起本层评论' : '显示本层评论'}
                            </button>
                          )}
                        </div>
                        {/* 回复输入框 */}
                        {replyingTo?.postId === post.id && replyingTo?.commentId === mainComment.id && (
                          <div style={{ marginTop: '8px', display: 'flex', gap: '8px' }}>
                            <input
                              type="text"
                              value={replyInputs[post.id]?.[mainComment.id] || ''}
                              onChange={(e) => setReplyInputs(prev => ({
                                ...prev,
                                [post.id]: {
                                  ...prev[post.id],
                                  [mainComment.id]: e.target.value
                                }
                              }))}
                              placeholder={`回复 @${mainComment.author.username}...`}
                              style={{
                                flex: 1,
                                padding: '6px 10px',
                                borderRadius: '12px',
                                border: '1px solid #eaeaea',
                                fontSize: '14px'
                              }}
                              onKeyPress={(e) => e.key === 'Enter' && handleReply(post.id, mainComment.id)}
                            />
                            <button
                              onClick={() => handleReply(post.id, mainComment.id)}
                              style={{
                                padding: '6px 12px',
                                background: '#0070f3',
                                color: 'white',
                                borderRadius: '12px',
                                border: 'none',
                                fontSize: '12px',
                                cursor: 'pointer'
                              }}
                            >
                              发送
                            </button>
                          </div>
                        )}
                      </div>

                      {/* 层内评论 */}
                      {expandedLayers[post.id]?.[mainComment.id] && layerReplies.length > 0 && (
                        <div style={{ marginLeft: '30px', marginTop: '8px' }}>
                          {layerReplies.slice(0, visibleLayerComments[post.id]?.[mainComment.id] || 5).map((replyComment) => {
                            // 提取回复的用户名
                            let replyTo = '';
                            const match = replyComment.content.match(/@(\w+)/);
                            if (match) {
                              replyTo = match[1];
                            }

                            return (
                              <div key={replyComment.id} style={{
                                marginBottom: '8px',
                                padding: '8px',
                                background: '#f0f0f0',
                                borderRadius: '8px'
                              }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Link href={`/me`} style={{ fontWeight: '500', color: '#333', textDecoration: 'none', fontSize: '14px' }}>
                                      {replyComment.author.username}
                                    </Link>
                                    {replyTo && (
                                      <span style={{ fontSize: '12px', color: '#999' }}>@ {replyTo}</span>
                                    )}
                                  </div>
                                  <div style={{ fontSize: '12px', color: '#999' }}>
                                    {new Date(replyComment.createdAt).toLocaleString()}
                                  </div>
                                </div>
                                <p style={{ fontSize: '14px', marginTop: '4px', marginBottom: '8px' }}>{replyComment.content}</p>
                                <div style={{ display: 'flex', gap: '12px', fontSize: '12px' }}>
                                  <button
                                    onClick={() => setReplyingTo({ postId: post.id, commentId: replyComment.id })}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      color: '#0070f3',
                                      cursor: 'pointer',
                                      padding: '0'
                                    }}
                                  >
                                    回复
                                  </button>
                                </div>
                                {/* 回复输入框 */}
                                {replyingTo?.postId === post.id && replyingTo?.commentId === replyComment.id && (
                                  <div style={{ marginTop: '8px', display: 'flex', gap: '8px' }}>
                                    <input
                                      type="text"
                                      value={replyInputs[post.id]?.[replyComment.id] || ''}
                                      onChange={(e) => setReplyInputs(prev => ({
                                        ...prev,
                                        [post.id]: {
                                          ...prev[post.id],
                                          [replyComment.id]: e.target.value
                                        }
                                      }))}
                                      placeholder={`回复 @${replyComment.author.username}...`}
                                      style={{
                                        flex: 1,
                                        padding: '6px 10px',
                                        borderRadius: '12px',
                                        border: '1px solid #eaeaea',
                                        fontSize: '14px'
                                      }}
                                      onKeyPress={(e) => e.key === 'Enter' && handleReply(post.id, replyComment.id)}
                                    />
                                    <button
                                      onClick={() => handleReply(post.id, replyComment.id)}
                                      style={{
                                        padding: '6px 12px',
                                        background: '#0070f3',
                                        color: 'white',
                                        borderRadius: '12px',
                                        border: 'none',
                                        fontSize: '12px',
                                        cursor: 'pointer'
                                      }}
                                    >
                                      发送
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}

                          {/* 层内评论的更多/收起按钮 */}
                          {layerReplies.length > 5 && (
                            <button
                              onClick={() => setVisibleLayerComments(prev => ({
                                ...prev,
                                [post.id]: {
                                  ...prev[post.id],
                                  [mainComment.id]: (prev[post.id]?.[mainComment.id] || 5) + 5
                                }
                              }))}
                              style={{
                                marginTop: '8px',
                                padding: '4px 8px',
                                background: 'none',
                                border: '1px solid #0070f3',
                                color: '#0070f3',
                                borderRadius: '4px',
                                fontSize: '12px',
                                cursor: 'pointer',
                                marginRight: '8px'
                              }}
                            >
                              更多评论
                            </button>
                          )}

                          {/* 收起本层评论按钮 */}
                          <button
                            onClick={() => setExpandedLayers(prev => ({
                              ...prev,
                              [post.id]: {
                                ...prev[post.id],
                                [mainComment.id]: false
                              }
                            }))}
                            style={{
                              marginTop: '8px',
                              padding: '4px 8px',
                              background: 'none',
                              border: '1px solid #999',
                              color: '#666',
                              borderRadius: '4px',
                              fontSize: '12px',
                              cursor: 'pointer'
                            }}
                          >
                            收起本层评论
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* 更多主评论按钮 */}
                {comments[post.id].mainComments?.length > visibleMainComments[post.id] && (
                  <button
                    onClick={() => setVisibleMainComments(prev => ({
                      ...prev,
                      [post.id]: prev[post.id] + 5
                    }))}
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
                      marginBottom: '8px'
                    }}
                  >
                    更多评论
                  </button>
                )}

                {/* 总评论收起按钮 */}
                <button
                  onClick={() => setExpandedComments(prev => ({
                    ...prev,
                    [post.id]: false
                  }))}
                  style={{
                    marginTop: '8px',
                    padding: '8px 16px',
                    background: 'none',
                    border: '1px solid #999',
                    color: '#666',
                    borderRadius: '8px',
                    fontSize: '14px',
                    cursor: 'pointer',
                    width: '100%'
                  }}
                >
                  收起所有评论
                </button>
              </div>
            )}

            {/* 评论输入框 */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={commentInputs[post.id] || ''}
                onChange={(e) => setCommentInputs(prev => ({
                  ...prev,
                  [post.id]: e.target.value
                }))}
                placeholder="写下你的评论..."
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: '16px',
                  border: '1px solid #eaeaea',
                  fontSize: '14px'
                }}
                onKeyPress={(e) => e.key === 'Enter' && handleCommentSubmit(post.id)}
              />
              <button
                onClick={() => handleCommentSubmit(post.id)}
                style={{
                  padding: '8px 16px',
                  background: '#0070f3',
                  color: 'white',
                  borderRadius: '16px',
                  border: 'none',
                  fontSize: '14px',
                  cursor: 'pointer'
                }}
              >
                发送
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
