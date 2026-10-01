'use client';

/**
 * ค่าใช้จ่าย — /guide/expenses — เมนูหัวข้อ (แทนที่หน้าเดียวรวมทุกอย่างเดิม)
 *
 * แยกเป็น 2 หน้าย่อยของตัวเอง — อิงรูปแบบเดียวกับเมนู "โปรไฟล์" (/guide/profile):
 * - บันทึกใบเสร็จ (/guide/expenses/record) — เลือกกรุ๊ป แล้วสแกน/กรอกค่าใช้จ่ายใหม่
 * - ค่าใช้จ่ายรายกรุ๊ป (/guide/expenses/by-group) — ดูค่าใช้จ่ายที่บันทึกไว้แล้ว แยกเป็นก้อนตามกรุ๊ป
 */

import Link from 'next/link';
import { Card } from '@/components/ui/Primitives';
import { Icon, type IconName } from '@/components/ui/Icon';

const TOPICS: { href: string; label: string; description: string; icon: IconName }[] = [
  { href: '/guide/expenses/record', label: 'บันทึกใบเสร็จ', description: 'ถ่าย/แนบใบเสร็จ บันทึกค่าใช้จ่ายกรุ๊ปที่คอนเฟิร์มแล้ว', icon: 'camera' },
  { href: '/guide/expenses/by-group', label: 'ค่าใช้จ่ายรายกรุ๊ป', description: 'ดูค่าใช้จ่ายที่บันทึกไว้แล้ว แยกตามกรุ๊ป', icon: 'briefcase' },
];

export default function GuideExpensesMenuPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold zego-text">ค่าใช้จ่าย</h1>
        <p className="text-sm zego-text-tertiary">บันทึกไว ส่งเข้าคิวตรวจของบัญชีทันที</p>
      </div>

      <Card padded={false}>
        <ul className="divide-y divide-[var(--zego-border-soft)]">
          {TOPICS.map((t) => (
            <li key={t.href}>
              <Link
                href={t.href}
                className="flex items-center gap-3 px-4 py-3 zego-hover-surface"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 zego-text-success">
                  <Icon name={t.icon} className="h-4.5 w-4.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold zego-text">{t.label}</span>
                  <span className="block truncate text-xs zego-text-tertiary">{t.description}</span>
                </span>
                <Icon name="chevronRight" className="h-4 w-4 shrink-0 zego-text-disabled" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
