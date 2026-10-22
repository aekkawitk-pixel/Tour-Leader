'use client';

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';

/** หัวหน้าจอย่อยของค่าใช้จ่าย — ลิงก์กลับไปเมนู "บัญชี-การเงิน" ตรงหัวเรื่องช่วงที่ระบุ (ค่าเริ่มต้น ระหว่างทาง) (ไม่ใช่ page.tsx จึงไม่ถูกนับเป็น route) */
export function ExpensesBackHeader({ title, description, backTab = 'during' }: { title: string; description?: string; backTab?: 'envelopes' | 'during' | 'after' }) {
  return (
    <div className="mb-3">
      <Link
        href={`/guide/finance#${backTab}`}
        className="zego-guide-back"
      >
        <Icon name="chevronLeft" className="h-5 w-5" />
        บัญชี-การเงิน
      </Link>
      <h1 className="zego-guide-title">{title}</h1>
      {description && <p className="mt-0.5 text-sm zego-text-secondary">{description}</p>}
    </div>
  );
}
