'use client';

/**
 * การเงิน — /guide/finance — รวมเมนู "ค่าใช้จ่าย" + "เคลียร์เงิน" เดิมไว้ที่เดียว แบ่งตามช่วงของทริป
 *
 * - ก่อนเดินทาง: รับซองเงิน (ยืนยันที่รายละเอียดงาน)
 * - ระหว่างทาง: บันทึกใบเสร็จ · ค่าใช้จ่ายรายกรุ๊ป
 * - หลังเดินทาง: เบิกเบี้ยเลี้ยง / ค่าทิป · เคลียร์ค่าใช้จ่ายรายกรุ๊ป · นัดหมายเคลียร์เงิน
 * หน้าย่อยยังอยู่ที่ path เดิม (/guide/expenses/*, /guide/settlement/*) — ลิงก์เดิมใช้ต่อได้
 * แท็บที่เปิด: ?tab= (จากปุ่มย้อนกลับของหน้าย่อย) → มีซองรอยืนยันรับ = ก่อนเดินทาง → ไม่งั้น ระหว่างทาง
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { ownLeaderScope } from '@/lib/permissions';
import { envelopeStage } from '@/lib/logic/cashEnvelope';
import { Card, cx } from '@/components/ui/Primitives';
import { Icon, type IconName } from '@/components/ui/Icon';

type FinanceTab = 'before' | 'during' | 'after';

const TABS: { key: FinanceTab; label: string }[] = [
  { key: 'before', label: 'ก่อนเดินทาง' },
  { key: 'during', label: 'ระหว่างทาง' },
  { key: 'after', label: 'หลังเดินทาง' },
];

type Topic = { href: string; label: string; description: string; icon: IconName; badge?: number };

export default function GuideFinancePage() {
  const { currentUser, envelopes } = useDemo();
  const leaderId = ownLeaderScope(currentUser);

  // ซองที่ส่งมอบถึงหัวหน้าทัวร์คนนี้แล้ว แต่ยังไม่กดยืนยันรับ (ไม่นับซองที่เจ้าหน้าที่ส่งคืนการเงินไปแล้ว)
  const envelopesToAck = envelopes.filter(
    (e) => envelopeStage(e) === 'handed_over' && e.handover?.receiverId === leaderId && !e.staffReturn,
  ).length;

  const [tab, setTab] = useState<FinanceTab>('during');
  // อ่าน ?tab= ฝั่ง client หลัง mount (หน้านี้ถูก prerender) — ไม่มี → เลือกตามสิ่งที่ต้องทำ
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('tab');
    const next: FinanceTab = q === 'before' || q === 'during' || q === 'after' ? q : envelopesToAck > 0 ? 'before' : 'during';
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ซิงก์จาก URL ครั้งเดียวตอน mount
    setTab(next);
    // ตั้งค่าเริ่มต้นครั้งเดียว — ไม่สลับแท็บเองตามข้อมูลที่โหลดตามมาทีหลัง
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pick = (t: FinanceTab) => {
    setTab(t);
    // จำแท็บไว้ใน URL — กดย้อนกลับจากหน้าย่อยแล้วกลับมาแท็บเดิม
    window.history.replaceState(null, '', `/guide/finance?tab=${t}`);
  };

  const topics: Record<FinanceTab, Topic[]> = {
    before: [
      {
        href: '/guide/jobs',
        label: 'รับซองเงิน',
        description: envelopesToAck > 0 ? `มีซองรอคุณยืนยันรับ ${envelopesToAck} ซอง — ยืนยันที่รายละเอียดงาน` : 'ยืนยันรับซองเงินของกรุ๊ปที่รายละเอียดงาน',
        icon: 'money',
        badge: envelopesToAck,
      },
    ],
    during: [
      { href: '/guide/expenses/record', label: 'บันทึกใบเสร็จ', description: 'ถ่าย/แนบใบเสร็จ บันทึกค่าใช้จ่ายกรุ๊ปที่คอนเฟิร์มแล้ว', icon: 'camera' },
      { href: '/guide/expenses/by-group', label: 'ค่าใช้จ่ายรายกรุ๊ป', description: 'ดูค่าใช้จ่ายที่บันทึกไว้แล้ว แยกตามกรุ๊ป', icon: 'briefcase' },
    ],
    after: [
      { href: '/guide/settlement/allowance', label: 'เบิกเบี้ยเลี้ยง / ค่าทิป', description: 'ทำใบเบิกเบี้ยเลี้ยงและค่าทิปแยกต่อกรุ๊ป เมื่อจบทริปแล้ว', icon: 'receipt' },
      { href: '/guide/settlement/claim', label: 'เคลียร์ค่าใช้จ่ายรายกรุ๊ป', description: 'กรอกเบี้ยเลี้ยง/ค่าใช้จ่ายของกรุ๊ปที่เดินทางเสร็จแล้ว ส่งเข้าตรวจ', icon: 'money' },
      { href: '/guide/settlement/appointments', label: 'นัดหมายเคลียร์เงิน', description: 'ดูรายการรอเคลียร์ และจองคิวกับฝ่ายบัญชี', icon: 'clock' },
    ],
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold zego-text">การเงิน</h1>
        <p className="text-sm zego-text-tertiary">ซองเงิน ค่าใช้จ่าย และเคลียร์เงิน — แบ่งตามช่วงของทริป</p>
      </div>

      <div className="grid grid-cols-3 gap-1 rounded-xl zego-surface-soft-bg p-1" role="tablist" aria-label="ช่วงของทริป">
        {TABS.map((t) => {
          const on = tab === t.key;
          const dot = t.key === 'before' && envelopesToAck > 0;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => pick(t.key)}
              className={cx(
                'relative rounded-lg px-2 py-2 text-xs font-semibold transition-colors',
                on ? 'bg-emerald-600 text-white shadow-sm' : 'zego-text-secondary zego-hover-surface',
              )}
            >
              {t.label}
              {dot && <span aria-label="มีซองรอยืนยันรับ" className="absolute right-2 top-1.5 h-1.5 w-1.5 rounded-full bg-rose-500" />}
            </button>
          );
        })}
      </div>

      <Card padded={false}>
        <ul className="divide-y divide-[var(--zego-border-soft)]" role="tabpanel">
          {topics[tab].map((t) => (
            <li key={t.href}>
              <Link href={t.href} className="flex items-center gap-3 px-4 py-3 zego-hover-surface">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 zego-text-success">
                  <Icon name={t.icon} className="h-4.5 w-4.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold zego-text">{t.label}</span>
                  <span className="block truncate text-xs zego-text-tertiary">{t.description}</span>
                </span>
                {!!t.badge && (
                  <span className="zego-count-badge flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold">{t.badge}</span>
                )}
                <Icon name="chevronRight" className="h-4 w-4 shrink-0 zego-text-disabled" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
