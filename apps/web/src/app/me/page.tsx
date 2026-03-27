'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../../lib/http';
import { getTokens } from '../../lib/token';
import PostCard from '../../components/PostCard';

export default function MePage() {
  const router = useRouter();
  const [posts, setPosts] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [postStates, setPostStates] = useState({});

  useEffect(() => {
    if (!getTokens()) {
      router.replace('/login');
      return;
    }

    const load = async () => {
      setListLoading(true);
      try {
        const postsData = await apiFetch<any>('/posts/mine');
        setPosts(postsData.posts);

        const initialStates = {};
        postsData.posts.forEach((post: any) => {
          initialStates[post.id] = {
            liked: false,
            favorited: false,
          };
        });
        setPostStates(initialStates);

        postsData.posts.forEach((post: any) => {
          fetchPostState(post.id);
        });
      } catch (err) {
        console.error('获取用户数据失败:', err);
        if (!getTokens()) router.replace('/login');
      } finally {
        setListLoading(false);
      }
    };
    load();
  }, [router]);

  const fetchPostState = async (postId: string) => {
    try {
      const data = await apiFetch<any>(`/social/posts/${postId}/states`);
      setPostStates((prev) => ({
        ...prev,
        [postId]: data,
      }));
    } catch (err) {
      console.error('获取帖子状态失败:', err);
    }
  };

  const handleUpdatePost = (updatedPost: any) => {
    setPosts((prev) => prev.map((post: any) => (post.id === updatedPost.id ? updatedPost : post)));
  };

  const handleUpdatePostState = (postId: string, newState: any) => {
    setPostStates((prev) => ({
      ...prev,
      [postId]: { ...prev[postId], ...newState },
    }));
  };

  return (
    <div>
      <h2 style={{ fontSize: '18px', marginBottom: '16px' }}>我的帖子</h2>
      {listLoading ? (
        <div
          style={{
            background: 'white',
            borderRadius: '12px',
            padding: '48px',
            textAlign: 'center',
            color: '#999',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}
        >
          加载帖子列表…
        </div>
      ) : posts.length === 0 ? (
        <div
          style={{
            background: 'white',
            borderRadius: '12px',
            padding: '48px',
            textAlign: 'center',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}
        >
          还没有发布帖子，<a href="/write" style={{ color: '#0070f3' }}>去发布</a>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {posts.map((post: any) => (
            <PostCard
              key={post.id}
              post={post}
              pinScope="profile"
              postState={
                postStates[post.id] || {
                  liked: false,
                  favorited: false,
                }
              }
              onUpdatePost={handleUpdatePost}
              onUpdatePostState={handleUpdatePostState}
              onDeletePost={(postId) =>
                setPosts((prev) => prev.filter((p: any) => p.id !== postId))
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
