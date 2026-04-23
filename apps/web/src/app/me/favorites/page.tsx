'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/features/client/http';
import { getTokens } from '@/features/client/token';
import PostCard from '../../../components/PostCard';

export default function FavoritesPage() {
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
        const favoritesData = await apiFetch<any>('/posts/favorites');
        setPosts(favoritesData.posts);

        // 本页均为已收藏帖，先标星直到 /states 返回
        const initialStates: Record<string, any> = {};
        favoritesData.posts.forEach((post: any) => {
          initialStates[post.id] = {
            liked: false,
            favorited: true,
          };
        });
        setPostStates(initialStates);

        favoritesData.posts.forEach((post: any) => {
          fetchPostState(post.id);
        });
      } catch (err) {
        console.error('获取用户收藏失败:', err);
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
      <h2 style={{ fontSize: '18px', marginBottom: '16px' }}>我的收藏</h2>
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
          加载收藏列表…
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
          还没有收藏帖子
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {posts.map((post: any) => (
            <PostCard
              key={post.id}
              post={post}
              postState={
                postStates[post.id] || {
                  liked: false,
                  favorited: true,
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
