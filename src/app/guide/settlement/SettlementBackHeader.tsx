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
        className="mb-2 inline-flex items-center gap-1 text-sm font-medium zego-text-success"
      >
        <Icon name="chevronLeft" className="h-4 w-4" />
        บัญชี-การเงิน
      </Link>
      <h1 className="text-lg font-bold zego-text">{title}</h1>
      {description && <p className="text-sm zego-text-tertiary">{description}</p>}
    </div>
  );
}
