'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../../../lib/http';
import { getTokens } from '../../../lib/token';
import PostCard from '../../../components/PostCard';

export default function FavoritesPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [postStates, setPostStates] = useState({});

  useEffect(() => {
    const checkLoginStatus = () => {
      const tokens = getTokens();
      if (!tokens) {
        router.replace('/login');
        return false;
      }
      return true;
    };

    if (checkLoginStatus()) {
      const fetchUserData = async () => {
        try {
          const userData = await apiFetch<any>('/auth/me');
          setUser(userData.user);
          
          const favoritesData = await apiFetch<any>('/posts/favorites');
          setPosts(favoritesData.posts);
          
          const initialStates = {};
          favoritesData.posts.forEach(post => {
            initialStates[post.id] = { liked: false, favorited: false, shared: false };
          });
          setPostStates(initialStates);

          favoritesData.posts.forEach(post => {
            fetchPostState(post.id);
          });
        } catch (err) {
          console.error('获取用户收藏失败:', err);
          router.replace('/login');
        } finally {
          setLoading(false);
        }
      };
      fetchUserData();
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

  const handleUpdatePost = (updatedPost) => {
    setPosts(prev => prev.map(post => 
      post.id === updatedPost.id ? updatedPost : post
    ));
  };

  const handleUpdatePostState = (postId, newState) => {
    setPostStates(prev => ({
      ...prev,
      [postId]: { ...prev[postId], ...newState }
    }));
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '48px' }}>加载中...</div>;
  }

  return (
    <div style={{ display: 'flex', gap: '24px' }}>
      <div style={{ 
        width: '200px', 
        background: 'white', 
        borderRadius: '12px', 
        padding: '16px', 
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        height: 'fit-content'
      }}>
        <h2 style={{ fontSize: '18px', marginBottom: '16px' }}>个人中心</h2>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <Link 
            href="/me" 
            style={{ 
              padding: '8px 12px', 
              borderRadius: '8px', 
              textDecoration: 'none', 
              color: '#333'
            }}
          >
            我的帖子
          </Link>
          <Link 
            href="/me/favorites" 
            style={{ 
              padding: '8px 12px', 
              borderRadius: '8px', 
              textDecoration: 'none', 
              color: '#333',
              background: '#f0f0f0'
            }}
          >
            我的收藏
          </Link>
        </nav>
      </div>
      
      <div style={{ flex: 1 }}>
        {user && (
          <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <h2 style={{ fontSize: '18px', marginBottom: '12px' }}>个人信息</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div><strong>用户名:</strong> {user.username}</div>
              <div><strong>邮箱:</strong> {user.email}</div>
            </div>
          </div>
        )}
        <div>
          <h2 style={{ fontSize: '18px', marginBottom: '16px' }}>我的收藏</h2>
          {posts.length === 0 ? (
            <div style={{ background: 'white', borderRadius: '12px', padding: '48px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
              还没有收藏帖子
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {posts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  postState={postStates[post.id] || { liked: false, favorited: false, shared: false }}
                  onUpdatePost={handleUpdatePost}
                  onUpdatePostState={handleUpdatePostState}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
