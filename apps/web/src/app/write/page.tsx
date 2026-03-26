'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../../lib/http';
import { getTokens } from '../../lib/token';

export default function WritePage() {
  const router = useRouter();
  const [content, setContent] = useState('');
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  useEffect(() => {
    // 检查登录状态
    const tokens = getTokens();
    if (!tokens) {
      // 未登录，重定向到登录页面
      router.replace('/login');
    }
  }, [router]);

  const handleImageChange = (e) => {
    const files = Array.from(e.target.files);
    setImages([...images, ...files]);
  };

  const removeImage = (index) => {
    const newImages = [...images];
    newImages.splice(index, 1);
    setImages(newImages);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!content.trim()) {
      setError('请输入帖子内容');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('content', content);
      images.forEach((image) => {
        formData.append('media', image);
      });
      await apiFetch('/posts', {
        method: 'POST',
        body: formData
      });
      router.replace('/circles');
    } catch (err) {
      setError('发布失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      <h1 style={{ fontSize: '24px', marginBottom: '24px' }}>发布帖子</h1>
      {error && (
        <div style={{ color: 'red', marginBottom: '16px' }}>{error}</div>
      )}
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '24px' }}>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="分享你的想法..."
            style={{
              width: '100%',
              minHeight: '200px',
              padding: '16px',
              borderRadius: '8px',
              border: '1px solid #eaeaea',
              fontSize: '16px',
              resize: 'vertical'
            }}
          />
        </div>
        <div style={{ marginBottom: '24px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px' }}>添加图片</label>
          <input
            type="file"
            multiple
            accept="image/*"
            onChange={handleImageChange}
            style={{ marginBottom: '12px' }}
          />
          {images.length > 0 && (
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              {images.map((image, index) => (
                <div key={index} style={{ position: 'relative' }}>
                  <img
                    src={URL.createObjectURL(image)}
                    alt={`预览 ${index + 1}`}
                    style={{ 
                      width: '100px', 
                      height: '100px', 
                      objectFit: 'cover', 
                      borderRadius: '8px'
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(index)}
                    style={{
                      position: 'absolute',
                      top: '-8px',
                      right: '-8px',
                      background: 'red',
                      color: 'white',
                      border: 'none',
                      borderRadius: '50%',
                      width: '24px',
                      height: '24px',
                      fontSize: '16px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '16px' }}>
          <button
            type="button"
            onClick={() => router.back()}
            style={{
              padding: '12px 24px',
              background: 'white',
              color: '#333',
              borderRadius: '8px',
              border: '1px solid #eaeaea',
              fontSize: '16px',
              fontWeight: '500',
              cursor: 'pointer'
            }}
          >
            取消
          </button>
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '12px 24px',
              background: '#0070f3',
              color: 'white',
              borderRadius: '8px',
              border: 'none',
              fontSize: '16px',
              fontWeight: '500',
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? '发布中...' : '发布'}
          </button>
        </div>
      </form>
    </div>
  );
}
