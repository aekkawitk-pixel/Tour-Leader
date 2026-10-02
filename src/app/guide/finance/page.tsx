'use client';

/**
 * การเงิน — /guide/finance — รวมเมนู "ค่าใช้จ่าย" + "เคลียร์เงิน" เดิมไว้ที่เดียว แบ่งตามช่วงของทริป
 *
 * - ก่อนเดินทาง: ซองเงินของกรุ๊ปที่ส่งมอบถึงคุณ — ยืนยันรับได้ในหน้านี้เลย (การ์ดเดียวกับรายละเอียดงาน)
 * - ระหว่างทาง: รายชื่อกรุ๊ปที่กำลังเดินทาง แตะแล้วบันทึกใบเสร็จของกรุ๊ปนั้นทันที (สรุปค่าใช้จ่ายดูที่รายละเอียดงาน)
 * - หลังเดินทาง: บันทึกใบเสร็จย้อนหลัง · เคลียร์ค่าใช้จ่ายรายกรุ๊ป · เบิกเบี้ยเลี้ยง
 * หน้าย่อยยังอยู่ที่ path เดิม (/guide/expenses/*, /guide/settlement/*) — ลิงก์เดิมใช้ต่อได้
 * แท็บที่เปิด: ?tab= (จากปุ่มย้อนกลับของหน้าย่อย) → มีซองรอยืนยันรับ = ก่อนเดินทาง → ไม่งั้น ระหว่างทาง
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { ownLeaderScope } from '@/lib/permissions';
import { getTourPeriods } from '@/services/tourPeriodMaster';
import { loadActiveGuideAssignments } from '@/services/guideAssignmentStore';
import { envelopeStage, leaderEnvelopeState } from '@/lib/logic/cashEnvelope';
import { getTourPeriodById } from '@/services/tourPeriodMaster';
import { formatDateRange, toISODate } from '@/lib/format';
import { GuideEnvelopeCard } from '../expenses/GuideEnvelopeCard';
import { CarrierLeaderSection } from '../CarrierLeaderSection';
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
    // รอกดรับ — รวมซองระหว่างทาง (หัวหน้าทัวร์กดรับได้เสมอ)
    (e) => leaderEnvelopeState(e, leaderId) === 'to_ack' || leaderEnvelopeState(e, leaderId) === 'in_transit',
  ).length;
  /*
    กรุ๊ปที่มีซองส่งมอบถึงคุณ (รอยืนยันรับ หรือรับแล้วยังไม่จบทริป) — แสดงการ์ดซองให้กดยืนยันรับ/ส่งต่อได้ในหน้านี้
    กรุ๊ปที่ยังมีซองรอยืนยันขึ้นก่อน แล้วเรียงตามวันเดินทาง
  */
  const today = toISODate(new Date());
  // กรุ๊ปที่กำลังเดินทางวันนี้ (คอนเฟิร์มแล้ว) — แตะเพื่อบันทึกใบเสร็จของกรุ๊ปนั้นทันที
  const ongoing = (leaderId ? loadActiveGuideAssignments().filter((a) => a.tourLeaderId === leaderId && a.assignmentStatus === 'CONFIRMED') : [])
    .map((a) => getTourPeriods().find((p) => p.internalId === a.periodId))
    .filter((p): p is NonNullable<typeof p> => Boolean(p) && p!.startDate <= today && p!.endDate >= today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const envelopeGroups = [...new Set(envelopes.filter((e) => e.handover?.receiverId === leaderId).map((e) => e.periodId))]
    .map((periodId) => {
      const period = getTourPeriodById(periodId);
      const waiting = envelopes.some((e) => e.periodId === periodId && envelopeStage(e) === 'handed_over' && e.handover?.receiverId === leaderId && !e.staffReturn);
      return { periodId, period, waiting };
    })
    .filter((g) => g.waiting || (g.period?.endDate ?? '') >= today)
    .sort((a, b) => Number(b.waiting) - Number(a.waiting) || (a.period?.startDate ?? '').localeCompare(b.period?.startDate ?? ''));

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
    // ก่อนเดินทาง — แสดงการ์ดซองตรง ๆ ด้านล่าง (ไม่ใช่ลิงก์)
    before: [],
    // ระหว่างทาง — แสดงรายชื่อกรุ๊ปที่กำลังเดินทางให้เลือกตรง ๆ ด้านล่าง (ไม่ใช่ลิงก์)
    during: [],
    after: [
      { href: '/guide/expenses/record?filter=after', label: 'บันทึกใบเสร็จย้อนหลัง', description: 'บันทึกค่าใช้จ่ายของกรุ๊ปที่กลับมาแล้ว', icon: 'camera' },
      // ลำดับตามขั้นตอนหลังจบทริป: เคลียร์ค่าใช้จ่าย → เบิกเบี้ยเลี้ยง (นัดหมายเคลียร์เงินอยู่เมนู "นัดหมาย" ที่แถบล่าง)
      { href: '/guide/settlement/claim', label: 'เคลียร์ค่าใช้จ่ายรายกรุ๊ป', description: 'กรอกเบี้ยเลี้ยง/ค่าใช้จ่ายของกรุ๊ปที่เดินทางเสร็จแล้ว ส่งเข้าตรวจ', icon: 'money' },
      { href: '/guide/settlement/allowance', label: 'เบิกเบี้ยเลี้ยง', description: 'ทำใบเบิกเบี้ยเลี้ยงและค่าทิปแยกต่อกรุ๊ป เมื่อจบทริปแล้ว', icon: 'receipt' },
    ],
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold zego-text">บัญชี-การเงิน</h1>
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

      {tab === 'before' && (
        <div className="space-y-3" role="tabpanel">
          {/* ซองของกรุ๊ปอื่นที่ฝากคุณนำส่ง (ถ้ามี) */}
          <CarrierLeaderSection />
          {envelopeGroups.length === 0 ? (
            <Card>
              <p className="py-4 text-center text-sm zego-text-tertiary">ยังไม่มีซองเงินที่ส่งมอบถึงคุณ</p>
            </Card>
          ) : (
            envelopeGroups.map((g) => (
              <GuideEnvelopeCard
                key={g.periodId}
                periodId={g.periodId}
                mode="receive"
                groupLabel={{
                  code: g.period?.groupCode ?? g.periodId,
                  detail: g.period ? `${g.period.displayName} · ${formatDateRange(g.period.startDate, g.period.endDate)}` : undefined,
                }}
              />
            ))
          )}
        </div>
      )}

      {tab === 'during' && (
        <Card className="space-y-3">
          <p className="text-sm font-semibold zego-text">เลือกกรุ๊ปที่ต้องการบันทึกค่าใช้จ่าย</p>
          {ongoing.length === 0 ? (
            <p className="rounded-lg border border-dashed zego-border-color px-4 py-6 text-center text-sm zego-text-tertiary">ไม่มีกรุ๊ปที่กำลังเดินทางอยู่</p>
          ) : (
            <ul className="space-y-2">
              {ongoing.map((p) => (
                <li key={p.internalId}>
                  <Link
                    href={`/guide/expenses/record?period=${encodeURIComponent(p.internalId)}`}
                    className="flex w-full items-center justify-between gap-2 rounded-lg border zego-border-color px-3 py-2.5 text-left hover:border-emerald-300 hover:bg-emerald-50/40"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium zego-text">{p.groupCode} · {p.displayName}</span>
                      <span className="block text-xs zego-text-tertiary">{p.countryName} · {formatDateRange(p.startDate, p.endDate)}</span>
                    </span>
                    <Icon name="camera" className="h-4 w-4 shrink-0 zego-text-success" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {topics[tab].length > 0 && (
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
      )}
    </div>
  );
}
