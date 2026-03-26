/**
 * 回复评论存储格式为 `@被回复用户名 正文`，展示时拆出浅色 @ 与正文
 */
export function parseReplyDisplay(content: string): {
  mention: string | null;
  text: string;
} {
  const s = content.trimStart();
  const m = s.match(/^@([^\s@]+)\s+([\s\S]*)$/);
  if (m) {
    return { mention: m[1], text: m[2].trimStart() };
  }
  return { mention: null, text: content };
}
