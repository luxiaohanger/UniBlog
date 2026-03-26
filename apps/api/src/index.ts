import dotenv from 'dotenv';
import path from 'node:path';
import { createApp } from './app';

// 显式加载 apps/api/.env，避免在 monorepo 工作目录下找不到环境变量
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const port = Number(process.env.PORT || 4000);

const app = createApp();

app.listen(port, () => {
  console.log(`API server running on http://localhost:${port}`);
});

