'use client';
import React from 'react';
import { usePathname } from 'next/navigation';
import Header from './Header';
import { getTokens } from '../lib/token';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const tokens = getTokens();
  const isLoggedIn = !!tokens;

  // 登录后在所有页面显示导航栏
  // 未登录时不显示导航栏
  const showHeader = isLoggedIn;

  return (
    <>
      {showHeader ? <Header /> : null}
      {children}
    </>
  );
}
