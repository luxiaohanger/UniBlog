import './globals.css';
import AppShell from '../components/AppShell';
import PageTransition from '../components/PageTransition';

export const metadata = {
  title: 'UniBlog',
  description: '发帖、评论、点赞/收藏/转发',
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>
        <AppShell>
          <main style={{ maxWidth: 980, margin: '0 auto', padding: '18px 16px 48px' }}>
            <PageTransition>{children}</PageTransition>
          </main>
        </AppShell>
      </body>
    </html>
  );
}
