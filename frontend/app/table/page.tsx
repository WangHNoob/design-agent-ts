'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** /table 已并入统一控制台 /design（一会话三模式）：保书签/nginx 路径重定向 */
export default function TablePage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/design?mode=table');
  }, [router]);
  return null;
}
