'use client';

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';

/**
 * หัวหน้าจอย่อยของเคลียร์เงิน — ลิงก์กลับไปเมนู "บัญชี-การเงิน" หัวเรื่องหลังเดินทาง (ไม่ใช่ page.tsx จึงไม่ถูกนับเป็น route)
 */
export function SettlementBackHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-3">
      <Link
        href="/guide/finance#after"
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
