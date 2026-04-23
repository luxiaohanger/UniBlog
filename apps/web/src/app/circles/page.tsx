'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '@/features/client/http';
import { getTokens } from '@/features/client/token';
import PostCard from '../../components/PostCard';

export default function CirclesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [postStates, setPostStates] = useState<Record<string, any>>({});
  const focusPostId = searchParams.get('postId');
  const focusCommentId = searchParams.get('commentId');

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

  useEffect(() => {
    if (!focusPostId) return;
    if (!posts.length) return;
    requestAnimationFrame(() => {
      document.getElementById(`postcard-${focusPostId}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  }, [focusPostId, posts.length]);

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
    return (
      <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div className="skeleton" style={{ width: '38%', height: 32, borderRadius: 8 }} />
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="card"
            style={{
              padding: 20,
              borderRadius: 'var(--radius-lg)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className="skeleton" style={{ width: 44, height: 44, borderRadius: '50%' }} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="skeleton" style={{ width: '28%', height: 14 }} />
                <div className="skeleton" style={{ width: '18%', height: 10 }} />
              </div>
            </div>
            <div className="skeleton" style={{ width: '94%', height: 14 }} />
            <div className="skeleton" style={{ width: '76%', height: 14 }} />
            <div className="skeleton" style={{ width: '44%', height: 14 }} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h1
          className="responsive-h1"
          style={{
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            marginBottom: 4,
          }}
        >
          校园动态
        </h1>
        <p style={{ fontSize: 14, color: 'var(--fg-muted)' }}>
          看看同学们今天在分享什么
        </p>
      </header>
      <div className="stagger-list" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {posts.map((post, i) => (
          <div key={post.id} style={{ ['--stagger-index' as any]: i }}>
            <PostCard
              post={post}
              pinScope="feed"
              postState={
                postStates[post.id] || {
                  liked: false,
                  favorited: false,
                }
              }
              focusCommentId={focusPostId === post.id ? focusCommentId : null}
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
          </div>
        ))}
        {posts.length === 0 && (
          <div
            className="card"
            style={{
              padding: 48,
              textAlign: 'center',
              borderRadius: 'var(--radius-lg)',
              color: 'var(--fg-muted)',
            }}
          >
            <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.5 }}>📭</div>
            <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--fg)' }}>暂无动态</div>
            <div style={{ fontSize: 13, marginTop: 6 }}>当有新帖子发布时，会显示在这里</div>
          </div>
        )}
      </div>
    </div>
  );
}
