'use client';

/**
 * เคลียร์เงิน — /guide/settlement — เมนูหัวข้อ (แทนที่หน้าเดียวรวมทุกอย่างเดิม)
 *
 * แยกเป็น 2 หน้าย่อยของตัวเอง — อิงรูปแบบเดียวกับเมนู "ค่าใช้จ่าย" (/guide/expenses):
 * - เคลียร์ค่าใช้จ่ายรายกรุ๊ป (/guide/settlement/claim) — กรอกแบบฟอร์มเบิกเบี้ยเลี้ยง/ค่าใช้จ่ายส่งเข้าตรวจ
 * - นัดหมายเคลียร์เงิน (/guide/settlement/appointments) — ของเดิมที่มีอยู่แล้ว (ดูรายการรอเคลียร์ + จองคิว Finance)
 */

import Link from 'next/link';
import { Card } from '@/components/ui/Primitives';
import { Icon, type IconName } from '@/components/ui/Icon';

const TOPICS: { href: string; label: string; description: string; icon: IconName }[] = [
  { href: '/guide/settlement/allowance', label: 'เบิกเบี้ยเลี้ยง / ค่าทิป', description: 'ทำใบเบิกเบี้ยเลี้ยงและค่าทิปแยกต่อกรุ๊ป พร้อมดูสถานะค่าใช้จ่ายของกรุ๊ป', icon: 'receipt' },
  { href: '/guide/settlement/claim', label: 'เคลียร์ค่าใช้จ่ายรายกรุ๊ป', description: 'กรอกเบี้ยเลี้ยง/ค่าใช้จ่ายของกรุ๊ปที่เดินทางเสร็จแล้ว ส่งเข้าตรวจ', icon: 'money' },
  { href: '/guide/settlement/appointments', label: 'นัดหมายเคลียร์เงิน', description: 'ดูรายการรอเคลียร์ และจองคิวกับฝ่ายบัญชี', icon: 'clock' },
];

export default function GuideSettlementMenuPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold zego-text">เคลียร์เงิน</h1>
        <p className="text-sm zego-text-tertiary">เคลียร์ค่าใช้จ่ายและนัดหมายกับฝ่ายบัญชี</p>
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
