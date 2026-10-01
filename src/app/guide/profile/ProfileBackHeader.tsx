'use client';

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';

/** หัวหน้าจอย่อยของโปรไฟล์ — ลิงก์กลับไปหน้ารายการหัวข้อเสมอ (ไม่ใช่ page.tsx จึงไม่ถูกนับเป็น route) */
export function ProfileBackHeader({ title }: { title: string }) {
  return (
    <div className="mb-3">
      <Link
        href="/guide/profile"
        className="mb-2 inline-flex items-center gap-1 text-sm font-medium zego-text-success"
      >
        <Icon name="chevronLeft" className="h-4 w-4" />
        โปรไฟล์
      </Link>
      <h1 className="text-lg font-bold zego-text">{title}</h1>
    </div>
  );
}
