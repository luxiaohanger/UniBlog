import './globals.css';
import AppShell from '../components/AppShell';
import PageTransition from '../components/PageTransition';

export const metadata = {
  title: 'UniBlog',
  description: '发帖、评论、点赞/收藏/转发',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>
        <AppShell>
          <main style={{ maxWidth: 1024, margin: '0 auto', padding: '28px 20px 64px' }}>
            <PageTransition>{children}</PageTransition>
          </main>
        </AppShell>
      </body>
    </html>
  );
}
