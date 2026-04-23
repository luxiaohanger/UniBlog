'use client';
import { useState, useEffect, useRef, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/features/client/http';
import { getTokens } from '@/features/client/token';

const MAX_POST_LINES = 20;
const MAX_IMAGES = 3;

function clampLines(text: string, maxLines: number) {
  return text.split('\n').slice(0, maxLines).join('\n');
}

export default function WritePage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [content, setContent] = useState('');
  const [images, setImages] = useState<File[]>([]);
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

  const handleImageChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const merged = [...images, ...files].slice(0, MAX_IMAGES);
    setImages(merged);
    if (files.length + images.length > MAX_IMAGES) {
      setError(`一次最多上传 ${MAX_IMAGES} 张图片`);
    } else {
      setError('');
    }
    e.target.value = '';
  };

  const removeImage = (index: number) => {
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
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <header style={{ marginBottom: 24 }}>
        <h1 className="responsive-h1" style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 4 }}>
          发布帖子
        </h1>
        <p style={{ fontSize: 14, color: 'var(--fg-muted)' }}>分享你的想法和见闻</p>
      </header>

      {error && (
        <div
          className="text-line-fit fade-in"
          style={{
            color: 'var(--danger-600)',
            marginBottom: 16,
            background: 'rgba(239, 68, 68, 0.08)',
            padding: '10px 14px',
            borderRadius: 'var(--radius-sm)',
            fontSize: 13,
            border: '1px solid rgba(239, 68, 68, 0.18)',
          }}
        >
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="card slide-up-enter" style={{ padding: 20, borderRadius: 'var(--radius-lg)' }}>
        <div style={{ marginBottom: 20 }}>
          <textarea
            className="text-line-fit"
            value={content}
            onChange={(e) => setContent(clampLines(e.target.value, MAX_POST_LINES))}
            placeholder="分享你的想法..."
            style={{
              width: '100%',
              minHeight: 200,
              padding: 16,
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              background: 'var(--surface-muted)',
              fontSize: 15,
              lineHeight: 1.7,
              resize: 'vertical'
            }}
          />
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--fg-subtle)' }}>
            最多 {MAX_POST_LINES} 行 · 当前 {content.split('\n').length} 行
          </div>
        </div>
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', marginBottom: 8, fontSize: 13, color: 'var(--fg-secondary)', fontWeight: 500 }}>
            添加图片
          </label>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            onChange={handleImageChange}
            disabled={images.length >= MAX_IMAGES}
            style={{ display: 'none' }}
          />
          <button
            type="button"
            disabled={images.length >= MAX_IMAGES}
            onClick={() => fileInputRef.current?.click()}
            className="btn-secondary"
            style={{
              marginBottom: 10,
              padding: '9px 16px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              background: images.length >= MAX_IMAGES ? 'var(--surface-sunken)' : 'var(--surface)',
              color: images.length >= MAX_IMAGES ? 'var(--fg-subtle)' : 'var(--fg)',
              fontSize: 14,
              fontWeight: 500,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              cursor: images.length >= MAX_IMAGES ? 'not-allowed' : 'pointer',
            }}
          >
            <span aria-hidden>🖼️</span>
            <span>选择图片</span>
          </button>
          <div style={{ marginBottom: 10, fontSize: 12, color: 'var(--fg-subtle)' }}>
            一次最多 {MAX_IMAGES} 张 · 已选 {images.length}
          </div>
          {images.length > 0 && (
            <div
              className="stagger-list"
              style={{
                display: 'grid',
                gap: 12,
                gridTemplateColumns:
                  images.length === 1
                    ? '1fr'
                    : images.length === 2
                    ? '1fr 1fr'
                    : '1fr 1fr 1fr',
              }}
            >
              {images.map((image, index) => (
                <div
                  key={index}
                  className="img-hover"
                  style={
                    {
                      position: 'relative',
                      aspectRatio:
                        images.length === 1
                          ? '16 / 10'
                          : images.length === 2
                          ? '4 / 3'
                          : '1 / 1',
                      maxHeight: images.length === 1 ? 420 : undefined,
                      borderRadius: 'var(--radius-sm)',
                      boxShadow: 'var(--shadow-xs)',
                      ['--stagger-index' as any]: index,
                    } as React.CSSProperties
                  }
                >
                  <img src={URL.createObjectURL(image)} alt={`预览 ${index + 1}`} />
                  <button
                    type="button"
                    aria-label="移除图片"
                    onClick={() => removeImage(index)}
                    style={{
                      position: 'absolute',
                      top: 6,
                      right: 6,
                      background: 'rgba(15,23,42,0.72)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '50%',
                      width: 24,
                      height: 24,
                      fontSize: 14,
                      backdropFilter: 'blur(4px)',
                      WebkitBackdropFilter: 'blur(4px)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex-wrap-sm" style={{ display: 'flex', gap: 12, rowGap: 12, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={() => router.back()}
            className="btn-secondary"
            style={{
              padding: '11px 22px',
              background: 'white',
              color: 'var(--fg)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              fontSize: 15,
              fontWeight: 500,
            }}
          >
            取消
          </button>
          <button
            type="submit"
            disabled={loading}
            className="btn-primary"
            style={{
              padding: '11px 28px',
              background: 'var(--brand-500)',
              color: 'white',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              fontSize: 15,
              fontWeight: 500,
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: 'var(--shadow-brand)',
            }}
          >
            {loading ? '发布中…' : '发布'}
          </button>
        </div>
      </form>
    </div>
  );
}
