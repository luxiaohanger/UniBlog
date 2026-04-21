'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

/**
 * 叠层交叉淡出式页面切换：
 * - 新页面立刻以 opacity: 1 挂载到正常文档流，决定布局与滚动；
 * - 旧页面作为绝对定位叠层覆盖在上方，仅做 opacity 1→0 淡出；
 * - 由于新层始终完全不透明，旧层淡出过程"露出"下方已完整渲染的新层，
 *   两个页面中样式相同的元素不会出现"全透明→全不透明"的闪烁；
 * - 同一路径（仅 children 引用变化）直接透传，不触发切换动画。
 */

// 与 globals.css 中 .page-transition-leaving 动画时长保持一致，保证动画播完再卸载
const LEAVE_MS = 480;

type Layer = { key: string; node: React.ReactNode };

export default function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [current, setCurrent] = useState<Layer>({ key: pathname, node: children });
  const [leaving, setLeaving] = useState<Layer | null>(null);
  // children 通过 ref 读取最新引用，避免把 children 放入 effect 依赖时的循环触发
  const latestChildrenRef = useRef(children);
  latestChildrenRef.current = children;
  // 持有 current 的最新引用，路径切换时用它构造"离场层"
  const currentRef = useRef(current);
  currentRef.current = current;

  // 同一路径时：把最新的 children 同步进 current（不触发动画）
  useEffect(() => {
    if (pathname === currentRef.current.key) {
      setCurrent({ key: pathname, node: latestChildrenRef.current });
    }
  }, [children, pathname]);

  // 路径变化：把旧 current 推到离场层，new current 立刻挂载
  useEffect(() => {
    if (pathname === currentRef.current.key) return;
    setLeaving(currentRef.current);
    setCurrent({ key: pathname, node: latestChildrenRef.current });
    const timer = window.setTimeout(() => setLeaving(null), LEAVE_MS);
    return () => clearTimeout(timer);
  }, [pathname]);

  return (
    <div className="page-transition">
      <div key={current.key} className="page-transition-current">
        {current.node}
      </div>
      {leaving ? (
        <div key={leaving.key} className="page-transition-leaving" aria-hidden>
          {leaving.node}
        </div>
      ) : null}
    </div>
  );
}
