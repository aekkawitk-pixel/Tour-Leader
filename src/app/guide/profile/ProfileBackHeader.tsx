'use client';

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';

/**
 * หัวหน้าจอย่อยของโปรไฟล์ — ลิงก์กลับไปหน้ารายการหัวข้อเสมอ (ไม่ใช่ page.tsx จึงไม่ถูกนับเป็น route)
 * ธีม v3: หัวเรียบบนพื้นขาวอมเขียว ลิงก์กลับเขียวปุ่ม ชื่อหน้าตัวใหญ่เขียวป่า
 */
export function ProfileBackHeader({ title }: { title: string }) {
  return (
    <div className="mb-3">
      <Link href="/guide/profile" className="zego-guide-back">
        <Icon name="chevronLeft" className="h-5 w-5" />
        โปรไฟล์
      </Link>
      <h1 className="zego-guide-title">{title}</h1>
    </div>
  );
}
