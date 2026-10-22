'use client';

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';

/**
 * หัวหน้าจอย่อยของโปรไฟล์ — ลิงก์กลับไปหน้ารายการหัวข้อ (ไม่ใช่ page.tsx จึงไม่ถูกนับเป็น route)
 * หน้าย่อยชั้นที่สอง (เช่น ขอลา) กลับไปหน้าแม่ของตัวเองแทน — ส่ง backHref/backLabel (ต้นแบบ: "‹ สถานะ/การลา")
 * ธีม v3: หัวเรียบบนพื้นขาวอมเขียว ลิงก์กลับเขียวปุ่ม ชื่อหน้าตัวใหญ่เขียวป่า
 */
export function ProfileBackHeader({
  title,
  backHref = '/guide/profile',
  backLabel = 'โปรไฟล์',
}: {
  title: string;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="mb-3">
      <Link href={backHref} className="zego-guide-back">
        <Icon name="chevronLeft" className="h-5 w-5" />
        {backLabel}
      </Link>
      <h1 className="zego-guide-title">{title}</h1>
    </div>
  );
}
