import { redirect } from 'next/navigation';

/** 设置已合并为单页 Tab；旧路由重定向保住书签 */
export default function Page() {
  redirect('/settings?tab=skills');
}
