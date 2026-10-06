'use client';

/**
 * การเงิน — /guide/finance — รวมเมนู "ค่าใช้จ่าย" + "เคลียร์เงิน" เดิมไว้ที่เดียว
 *
 * หน้าเดียว ไม่มีแท็บ — หัวเรื่องเรียงตามลำดับงานจริง จึงเห็นเรื่องค้างของทุกช่วงพร้อมกัน
 * (เดิมเป็นแท็บ: ต้องกดแท็บก่อนแล้วค่อยกดหัวข้อ และเรื่องค้างในแท็บอื่นถูกซ่อน)
 * - จัดการซองเงิน: การจัดการซองเงิน → /guide/finance/envelopes (ยืนยันรับ · แนบรูป · ส่งต่อ · ยอดคงเหลือ · ส่งเงินให้แลนด์ · แจ้งยอดไม่ตรง)
 *   ไม่ผูกกับช่วง "ก่อนเดินทาง" — ซองอาจมาถึงช้า (ฝากคนนำมาส่งระหว่างทาง) ยืนยันรับได้ทุกเมื่อ
 * - ระหว่างทาง: กรุ๊ปที่กำลังเดินทาง (แตะแล้วบันทึกใบเสร็จทันที) + บันทึกใบเสร็จ
 *   ใบเสร็จหักจากยอดในซองอัตโนมัติ · เรื่องซองอื่น ๆ (ยอดคงเหลือ · ส่งเงินให้แลนด์ · แจ้งยอดไม่ตรง) อยู่ที่หน้าการจัดการซองเงิน
 * - หลังเดินทาง: การ์ดรายกรุ๊ปที่ยังเคลียร์ไม่จบ (ใบเสร็จ · เบี้ยเลี้ยง · นัดเคลียร์ + ปุ่มขั้นต่อไป — afterTripProgress)
 *   แล้วตามด้วยหัวข้อ: บันทึกใบเสร็จย้อนหลัง · เบิกเบี้ยเลี้ยง · ตรวจสอบก่อนนัดเคลียร์เงิน · นัดหมายเคลียร์เงิน
 * หน้าย่อยกดย้อนกลับมาที่หัวเรื่องนั้น (#envelopes / #during / #after)
 */

import Link from 'next/link';
import { useDemo } from '@/store/DemoStore';
import { ownLeaderScope } from '@/lib/permissions';
import { getTourPeriods } from '@/services/tourPeriodMaster';
import { loadActiveGuideAssignments } from '@/services/guideAssignmentStore';
import { leaderEnvelopeState } from '@/lib/logic/cashEnvelope';
import { getTourPeriodById } from '@/services/tourPeriodMaster';
import { formatDate, formatDateRange, toISODate } from '@/lib/format';
import { Card, cx } from '@/components/ui/Primitives';
import { Icon, type IconName } from '@/components/ui/Icon';
import { tripEnded, tripOngoing } from '@/lib/logic/tripPhase';
import { activeLeaderClaim } from '@/lib/logic/leaderClaims';
import { afterTripProgress, type StepState } from '@/lib/logic/afterTripProgress';
import { receiptsBlockedReason } from '@/lib/logic/clearReadiness';
import { loadGroupClears } from '@/services/groupClearStore';
import type { Appointment } from '@/types';

type Phase = 'envelopes' | 'during' | 'after';

const PHASE_LABEL: Record<Phase, string> = {
  envelopes: 'จัดการซองเงิน',
  during: 'ระหว่างทาง',
  after: 'หลังเดินทาง',
};

/** จุดสถานะของแต่ละขั้นในการ์ดหลังเดินทาง */
const STEP_DOT: Record<StepState, string> = {
  done: 'bg-emerald-600 text-white',
  action: 'bg-amber-400',
  waiting: 'bg-sky-200',
  todo: 'border border-slate-300',
};

type Topic = { href: string; label: string; description: string; icon: IconName; badge?: number };

export default function GuideFinancePage() {
  const { currentUser, envelopes, expenses, appointments } = useDemo();
  const leaderId = ownLeaderScope(currentUser);

  // ซองที่ส่งมอบถึงหัวหน้าทัวร์คนนี้แล้ว แต่ยังไม่กดยืนยันรับ (ไม่นับซองที่เจ้าหน้าที่ส่งคืนการเงินไปแล้ว)
  const envelopesToAck = envelopes.filter(
    // รอกดรับ — รวมซองระหว่างทาง (หัวหน้าทัวร์กดรับได้เสมอ)
    (e) => leaderEnvelopeState(e, leaderId) === 'to_ack' || leaderEnvelopeState(e, leaderId) === 'in_transit',
  ).length;
  const today = toISODate(new Date());
  // กรุ๊ปที่กำลังเดินทางวันนี้ (คอนเฟิร์มแล้ว) — แตะเพื่อบันทึกใบเสร็จของกรุ๊ปนั้นทันที
  const ongoing = (leaderId ? loadActiveGuideAssignments().filter((a) => a.tourLeaderId === leaderId && a.assignmentStatus === 'CONFIRMED') : [])
    .map((a) => getTourPeriods().find((p) => p.internalId === a.periodId))
    .filter((p): p is NonNullable<typeof p> => Boolean(p) && tripOngoing(p!, today))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  /* ---------------- หลังเดินทาง: ความคืบหน้ารายกรุ๊ป ---------------- */
  const myApts = appointments.filter((a) => a.leaderId === leaderId && a.status !== 'cancelled');
  const pendingClearApts = myApts.filter((a) => a.kind === 'clear' && a.status === 'pending').length;
  const clears = loadGroupClears();
  const whenOf = (a: Appointment) => `${formatDate(a.date)} ${a.time} น.`;
  // กรุ๊ปที่จบทริปแล้วและการเงินยังไม่ปิดเคลียร์ — ล่าสุดก่อน
  const afterGroups = (leaderId ? loadActiveGuideAssignments().filter((a) => a.tourLeaderId === leaderId && a.assignmentStatus === 'CONFIRMED') : [])
    .map((a) => getTourPeriodById(a.periodId))
    .filter((p): p is NonNullable<typeof p> => Boolean(p) && tripEnded(p!, today) && !clears[p!.internalId]?.closedAt)
    .sort((a, b) => b.endDate.localeCompare(a.endDate))
    .map((period) => {
      const receipts = expenses.filter((e) => e.jobId === period.internalId && e.category === 'actual' && e.requesterId === leaderId && e.status !== 'cancelled');
      const clearApt = myApts
        .filter((a) => a.kind === 'clear' && a.jobId === period.internalId)
        .sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`))[0] ?? null;
      return {
        period,
        progress: afterTripProgress({
          periodId: period.internalId,
          receipts,
          perDiem: leaderId ? activeLeaderClaim(expenses, period.internalId, leaderId, 'per_diem') : null,
          clearAppointment: clearApt,
          formatWhen: whenOf,
        }),
      };
    });

  const topics: Record<Phase, Topic[]> = {
    envelopes: [
      // รับซอง (ยืนยันรับ / แนบรูป / ส่งต่อ) — ตัวเลข = ซองที่รอคุณยืนยันรับ · ซองที่มาถึงช้าระหว่างทางก็ยืนยันที่นี่
      { href: '/guide/finance/envelopes', label: 'การจัดการซองเงิน', description: 'รับซอง ส่งต่อซอง ยอดคงเหลือ ส่งเงินให้แลนด์ และแจ้งยอดไม่ตรง', icon: 'money', badge: envelopesToAck },
    ],
    during: [
      // ใบเสร็จหักจากยอดในซองอัตโนมัติ — เรื่องซองอื่น ๆ (คงเหลือ / ส่งแลนด์ / ยอดไม่ตรง) อยู่ที่หัวข้อการจัดการซองเงิน
      { href: '/guide/expenses/record', label: 'บันทึกใบเสร็จ', description: 'บันทึกค่าใช้จ่าย ระบบหักจากยอดในซองให้อัตโนมัติ', icon: 'camera' },
    ],
    after: [
      { href: '/guide/expenses/record?filter=after', label: 'บันทึกใบเสร็จย้อนหลัง', description: 'บันทึกค่าใช้จ่ายของกรุ๊ปที่กลับมาแล้ว', icon: 'camera' },
      // ลำดับตามขั้นตอนหลังจบทริป: บันทึกใบเสร็จ → เบิกเบี้ยเลี้ยง → ตรวจสอบรายการก่อนนัดเคลียร์เงิน → นัดหมาย
      { href: '/guide/settlement/allowance', label: 'เบิกเบี้ยเลี้ยง', description: 'ทำเอกสารค่าใช้จ่ายหัวหน้าทัวร์ (เบี้ยเลี้ยง) แยกต่อกรุ๊ป เมื่อจบทริปแล้ว', icon: 'receipt' },
      { href: '/guide/settlement/claim', label: 'ตรวจสอบก่อนนัดเคลียร์เงิน', description: 'ดูรายการและสถานะของแต่ละกรุ๊ป ครบแล้วนัดหมายเข้ามาเคลียร์เงิน', icon: 'money' },
      // ขั้นสุดท้าย — การเงินนัดหลังตรวจเอกสารครบ หัวหน้าทัวร์ยืนยัน/ขอเลื่อนที่นี่ (หน้าเดียวกับเมนู "นัดหมาย" แถบล่าง)
      { href: '/guide/settlement/appointments', label: 'นัดหมายเคลียร์เงิน', description: 'ดูและยืนยันนัดที่การเงินนัดไว้', icon: 'calendar', badge: pendingClearApts },
    ],
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold zego-text">บัญชี-การเงิน</h1>
        <p className="text-sm zego-text-tertiary">ซองเงิน ค่าใช้จ่าย และเคลียร์เงิน — เรียงตามช่วงของทริป</p>
      </div>

      <PhaseSection phase="envelopes">
        <TopicList topics={topics.envelopes} />
      </PhaseSection>

      <PhaseSection phase="during">
        {/* กรุ๊ปที่กำลังเดินทาง — แตะแล้วบันทึกใบเสร็จของกรุ๊ปนั้นทันที (ไม่มีกรุ๊ป = ไม่แสดงกล่องนี้) */}
        {ongoing.length > 0 && (
          <Card padded={false}>
            <p className="zego-divider-bottom px-4 py-2 text-xs font-semibold zego-text-secondary">กำลังเดินทาง — แตะเพื่อบันทึกใบเสร็จ</p>
            <ul className="divide-y divide-[var(--zego-border-soft)]">
              {ongoing.map((p) => (
                <li key={p.internalId}>
                  <Link
                    href={`/guide/expenses/record?period=${encodeURIComponent(p.internalId)}`}
                    className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left zego-hover-surface"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium zego-text">{p.groupCode}</span>
                      <span className="block text-xs zego-text-tertiary">{p.countryName} · {formatDateRange(p.startDate, p.endDate)}</span>
                    </span>
                    <Icon name="camera" className="h-4 w-4 shrink-0 zego-text-success" />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
        <TopicList topics={topics.during} />
      </PhaseSection>

      <PhaseSection phase="after">
        {/* กรุ๊ปที่ยังเคลียร์ไม่จบ — แต่ละกรุ๊ปบอกว่าค้างขั้นไหน และขั้นต่อไปคืออะไร (ไม่มี = ไม่แสดง) */}
        {afterGroups.map(({ period, progress }) => (
          <Card key={period.internalId} className="space-y-2.5">
            <div>
              <p className="text-sm font-semibold zego-text">{period.groupCode}</p>
              <p className="text-xs zego-text-tertiary">กลับ {formatDate(period.endDate)}</p>
            </div>
            <ol className="space-y-1">
              {progress.steps.map((st) => (
                <li key={st.label} className="flex items-center gap-2 text-xs">
                  <span className={cx('flex h-4 w-4 shrink-0 items-center justify-center rounded-full', STEP_DOT[st.state])}>
                    {st.state === 'done' && <Icon name="check" className="h-2.5 w-2.5" />}
                  </span>
                  <span className="w-16 shrink-0 zego-text-secondary">{st.label}</span>
                  <span className={cx('min-w-0', st.state === 'action' ? 'font-semibold text-amber-800' : 'zego-text')}>{st.value}</span>
                </li>
              ))}
            </ol>
            <div className="flex items-center justify-between gap-2 zego-divider-top pt-2">
              {receiptsBlockedReason(envelopes.filter((e) => e.periodId === period.internalId && e.sealed))
                ? <span className="text-xs zego-text-disabled">บันทึกใบเสร็จ · รับซองก่อน</span>
                : <Link href={progress.recordHref} className="text-xs font-medium zego-text-info hover:underline">บันทึกใบเสร็จ</Link>}
              {progress.next.href ? (
                <Link href={progress.next.href} className="inline-flex items-center gap-0.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">
                  {progress.next.label}
                  <Icon name="chevronRight" className="h-3.5 w-3.5" />
                </Link>
              ) : (
                <span className="text-xs zego-text-tertiary">{progress.next.label}</span>
              )}
            </div>
          </Card>
        ))}
        <TopicList topics={topics.after} />
      </PhaseSection>
    </div>
  );
}

/** หัวเรื่องของหน้า — id = ชื่อหัวเรื่อง ให้หน้าย่อยกดย้อนกลับมาตรงหัวเรื่องนี้ได้ (/guide/finance#after) */
function PhaseSection({ phase, children }: { phase: Phase; children: React.ReactNode }) {
  return (
    <section id={phase} aria-labelledby={`${phase}-title`} className="scroll-mt-4 space-y-2">
      <h2 id={`${phase}-title`} className="px-1 text-xs font-semibold tracking-wide zego-text-tertiary">{PHASE_LABEL[phase]}</h2>
      {children}
    </section>
  );
}

function TopicList({ topics }: { topics: Topic[] }) {
  return (
    <Card padded={false}>
      <ul className="divide-y divide-[var(--zego-border-soft)]">
        {topics.map((t) => (
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
  );
}
