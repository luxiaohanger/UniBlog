'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../../lib/http';
import { getTokens } from '../../lib/token';
import PostCard from '../../components/PostCard';

export default function CirclesPage() {
  const router = useRouter();
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [postStates, setPostStates] = useState<Record<string, any>>({});

  useEffect(() => {
    const tokens = getTokens();
    if (!tokens) {
      router.replace('/login');
      return;
    }

    const fetchPosts = async () => {
      try {
        const data = await apiFetch<any>('/posts/feed');
        setPosts(data.posts);
        const initialStates: Record<string, any> = {};
        data.posts.forEach((post: any) => {
          initialStates[post.id] = {
            liked: false,
            favorited: false,
          };
        });
        setPostStates(initialStates);
        data.posts.forEach((post: any) => {
          fetchPostState(post.id);
        });
      } catch (err) {
        console.error('获取帖子失败:', err);
        router.replace('/login');
      } finally {
        setLoading(false);
      }
    };
    fetchPosts();
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

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '48px' }}>加载中...</div>;
  }

  return (
    <div>
      <h1 style={{ fontSize: '24px', marginBottom: '24px' }}>校园动态</h1>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            postState={
              postStates[post.id] || {
                liked: false,
                favorited: false,
              }
            }
            onUpdatePost={(updated) =>
              setPosts((prev) =>
                prev.map((p) => (p.id === updated.id ? updated : p))
              )
            }
            onUpdatePostState={(postId, partial) =>
              setPostStates((prev) => ({
                ...prev,
                [postId]: { ...prev[postId], ...partial },
              }))
            }
            onDeletePost={(postId) =>
              setPosts((prev) => prev.filter((p) => p.id !== postId))
            }
          />
        ))}
      </div>
    </div>
  );
}
