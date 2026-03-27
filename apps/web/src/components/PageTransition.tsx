'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

export default function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [phase, setPhase] = useState<'entering' | 'entered'>('entered');

  useEffect(() => {
    setPhase('entering');
    const id = window.requestAnimationFrame(() => {
      setPhase('entered');
    });
    return () => window.cancelAnimationFrame(id);
  }, [pathname]);

  return <div className={`page-transition ${phase}`}>{children}</div>;
}

