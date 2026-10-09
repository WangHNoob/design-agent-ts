'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** Markdown 渲染器。react-markdown + remark-gfm 体积较大且首屏（欢迎态/
 *  纯流式占位）不需要，统一经 next/dynamic 按需加载（bundle-dynamic-imports）。 */
export default function Markdown({ children }: { children: string }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>;
}
