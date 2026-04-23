import fs from 'node:fs';
import path from 'node:path';

export const uploadsDir = path.resolve(__dirname, '../../uploads');

export function ensureUploadsDir() {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

/** 按 PostMedia.path 删除 uploads 内文件；含 .. 或越界路径则跳过 */
export function unlinkStoredMediaFile(storedPath: string) {
  const rel = storedPath.replace(/^uploads\/?/, '');
  if (!rel || rel.includes('..') || path.isAbsolute(rel)) return;
  const abs = path.resolve(uploadsDir, rel);
  const relFromRoot = path.relative(uploadsDir, abs);
  if (relFromRoot.startsWith('..') || path.isAbsolute(relFromRoot)) return;
  fs.unlink(abs, (err) => {
    const code = err && (err as NodeJS.ErrnoException).code;
    if (err && code !== 'ENOENT') console.error('unlink media failed', err);
  });
}
