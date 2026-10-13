'use client';

/**
 * การเงิน — /guide/finance — จัดตามกรุ๊ป (หัวหน้าทัวร์คิดงานเป็นกรุ๊ปอยู่แล้ว)
 *
 * 1) ปุ่มด่วน 2 ปุ่ม — งานที่ทำบ่อยและไม่ผูกกรุ๊ปเดียว
 *    - บันทึกใบเสร็จ → /guide/expenses/record (เลือกกรุ๊ปในหน้านั้น · ใบเสร็จหักจากยอดในซองอัตโนมัติ)
 *    - ซองเงิน → /guide/finance/envelopes (ยืนยันรับ · ส่งต่อ · ยอดคงเหลือ · ส่งเงินให้แลนด์ · แจ้งยอดไม่ตรง) ตัวเลข = ซองรอรับ
 *      ซองอาจมาถึงช้า (ฝากคนนำมาส่งระหว่างทาง) จึงไม่ผูกกับช่วงก่อนเดินทาง
 * 2) ยอดค้างติดตามหลังเคลียร์ (มีเมื่อการเงินปิดเคลียร์แบบมีค้าง)
 * 3) กรุ๊ปของฉัน — กรุ๊ปที่กำลังเดินทาง + กรุ๊ปที่จบทริปแล้วแต่การเงินยังไม่ปิดเคลียร์
 *    การ์ดละกรุ๊ป บอกขั้นที่ค้าง (afterTripProgress) + ปุ่มหลักปุ่มเดียว · แตะชื่อกรุ๊ป = ส่วนบัญชี-การเงินในหน้ารายละเอียดงาน
 * เบิกเบี้ยเลี้ยง / ตรวจสอบก่อนนัด / ทำนัดเคลียร์เงิน อยู่ในหน้ากรุ๊ปแล้ว · ดู/ยืนยันนัดอยู่ที่เมนู "นัดหมาย" แถบล่าง
 * หน้าย่อยกดย้อนกลับมาที่ #envelopes / #during / #after (id คงไว้ตามลิงก์เดิม)
 */

import Link from 'next/link';
import { useDemo } from '@/store/DemoStore';
import { ownLeaderScope } from '@/lib/permissions';
import { loadActiveGuideAssignments } from '@/services/guideAssignmentStore';
import { leaderEnvelopeState } from '@/lib/logic/cashEnvelope';
import { getTourPeriodById } from '@/services/tourPeriodMaster';
import { addDays, diffDays, formatCurrency, formatDate, formatDateRange, toISODate } from '@/lib/format';
import { Card, cx } from '@/components/ui/Primitives';
import { Icon, type IconName } from '@/components/ui/Icon';
import { tripEnded, tripOngoing } from '@/lib/logic/tripPhase';
import { activeLeaderClaim } from '@/lib/logic/leaderClaims';
import { afterTripProgress, type StepState } from '@/lib/logic/afterTripProgress';
import { receiptsBlockedReason } from '@/lib/logic/clearReadiness';
import { CLEAR_DUE_DAYS, followUpOpen, followUpRemaining } from '@/lib/logic/groupClear';
import { FOLLOW_UP_REASON, loadGroupClears } from '@/services/groupClearStore';
import type { Appointment } from '@/types';

/** จุดสถานะของแต่ละขั้นในการ์ดกรุ๊ป */
const STEP_DOT: Record<StepState, string> = {
  done: 'bg-emerald-600 text-white',
  action: 'bg-amber-400',
  waiting: 'bg-sky-200',
  todo: 'border border-slate-300',
};

export default function GuideFinancePage() {
  const { currentUser, envelopes, expenses, appointments } = useDemo();
  const leaderId = ownLeaderScope(currentUser);
  const today = toISODate(new Date());

  // ซองที่ส่งมอบถึงหัวหน้าทัวร์คนนี้แล้ว แต่ยังไม่กดยืนยันรับ (รวมซองระหว่างทาง — กดรับได้เสมอ)
  const envelopesToAck = envelopes.filter(
    (e) => leaderEnvelopeState(e, leaderId) === 'to_ack' || leaderEnvelopeState(e, leaderId) === 'in_transit',
  ).length;

  const myApts = appointments.filter((a) => a.leaderId === leaderId && a.status !== 'cancelled');
  const clears = loadGroupClears();
  const whenOf = (a: Appointment) => `${formatDate(a.date)} ${a.time} น.`;
  const myPeriods = (leaderId ? loadActiveGuideAssignments().filter((a) => a.tourLeaderId === leaderId && a.assignmentStatus === 'CONFIRMED') : [])
    .map((a) => getTourPeriodById(a.periodId))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  // กำลังเดินทาง — เร็วสุดก่อน
  const ongoing = myPeriods.filter((p) => tripOngoing(p, today)).sort((a, b) => a.startDate.localeCompare(b.startDate));
  /*
    จบทริปแล้ว การเงินยังไม่ปิดเคลียร์ — เรียงตามความเร่งด่วน: วันที่ต้องทำให้ทันเร็วสุดก่อน
      มีนัดเคลียร์ (ยังไม่เข้าพบ) = วันนัด · ยังไม่มีนัด = วันกลับ (+ กำหนดเคลียร์ของบริษัท ถ้าตั้งไว้)
    กรุ๊ปที่กลับมานานแล้วและยังไม่นัดจึงขึ้นบนสุด
  */
  const afterGroups = myPeriods
    .filter((p) => tripEnded(p, today) && !clears[p.internalId]?.closedAt)
    .map((period) => {
      const receipts = expenses.filter((e) => e.jobId === period.internalId && e.category === 'actual' && e.requesterId === leaderId && e.status !== 'cancelled');
      const clearApt = myApts
        .filter((a) => a.kind === 'clear' && a.jobId === period.internalId)
        .sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`))[0] ?? null;
      const upcomingApt = clearApt && clearApt.status !== 'attended' ? clearApt : null;
      const dueBy = upcomingApt ? `${upcomingApt.date} ${upcomingApt.time}` : CLEAR_DUE_DAYS === null ? period.endDate : addDays(period.endDate, CLEAR_DUE_DAYS);
      return {
        period,
        upcomingApt,
        dueBy,
        // กลับมาแล้วกี่วัน · เกินกำหนดเคลียร์ของบริษัท (มีเมื่อบริษัทตั้ง CLEAR_DUE_DAYS แล้วเท่านั้น)
        daysSinceReturn: diffDays(period.endDate, today),
        overdue: !upcomingApt && CLEAR_DUE_DAYS !== null && diffDays(period.endDate, today) > CLEAR_DUE_DAYS,
        progress: afterTripProgress({
          periodId: period.internalId,
          receipts,
          perDiem: leaderId ? activeLeaderClaim(expenses, period.internalId, leaderId, 'per_diem') : null,
          clearAppointment: clearApt,
          formatWhen: whenOf,
        }),
      };
    })
    .sort((a, b) => a.dueBy.localeCompare(b.dueBy));

  // ยอดค้างติดตาม — หลังการเงินปิดเคลียร์แบบมีค้าง
  const followUps = myPeriods.flatMap((period) => (clears[period.internalId]?.followUps ?? []).filter(followUpOpen).map((f) => ({ f, period })));
  const groupHref = (periodId: string) => `/guide/jobs/${encodeURIComponent(periodId)}#finance`;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold zego-text">บัญชี-การเงิน</h1>
        <p className="text-sm zego-text-tertiary">ซองเงิน ใบเสร็จ และเคลียร์เงิน — แยกตามกรุ๊ป</p>
      </div>

      {/* ปุ่มด่วน — id คงไว้ให้ลิงก์ย้อนกลับเดิม (#during / #envelopes) */}
      <section id="during" className="scroll-mt-4 grid grid-cols-2 gap-2.5">
        <QuickAction href="/guide/expenses/record" icon="camera" label="บันทึกใบเสร็จ" description="หักจากยอดในซองให้อัตโนมัติ" />
        <span id="envelopes" className="contents">
          <QuickAction href="/guide/finance/envelopes" icon="money" label="ซองเงิน" description="รับซอง ยอดคงเหลือ ส่งแลนด์" badge={envelopesToAck} />
        </span>
      </section>

      {followUps.length > 0 && (
        <Card>
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold zego-text">
            <Icon name="warning" className="h-4 w-4 text-rose-600" />ยอดค้างติดตามหลังเคลียร์เงิน
          </h2>
          <ul className="divide-y divide-[var(--zego-border-soft)] text-sm">
            {followUps.map(({ f, period }) => (
              <li key={f.id} className="flex items-start justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block font-medium zego-text">{period.groupCode}</span>
                  <span className="block text-xs zego-text-tertiary">{FOLLOW_UP_REASON[f.reason]}{f.note ? ` · ${f.note}` : ''}</span>
                </span>
                <span className={cx('shrink-0 text-right text-xs font-semibold tabular-nums', f.direction === 'leader_owes' ? 'zego-text-danger' : 'text-violet-700')}>
                  {f.direction === 'leader_owes' ? 'ต้องคืนบริษัท' : 'บริษัทค้างจ่ายคุณ'}
                  <span className="block text-sm">{formatCurrency(followUpRemaining(f), f.currency)}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs zego-text-tertiary">ชำระเป็นเงินสดหรือโอนที่ฝ่ายการเงิน · ยอดสกุลต่างประเทศชำระเป็นบาทได้ตามอัตราแลกเปลี่ยนวันที่ชำระ · ไม่หักจากเบี้ยเลี้ยง</p>
        </Card>
      )}

      <section id="after" aria-labelledby="after-title" className="scroll-mt-4 space-y-2">
        <h2 id="after-title" className="px-1 text-xs font-semibold tracking-wide zego-text-tertiary">กรุ๊ปของฉัน</h2>

        {ongoing.length === 0 && afterGroups.length === 0 && (
          <Card>
            <p className="py-2 text-center text-sm zego-text-tertiary">ไม่มีกรุ๊ปที่กำลังเดินทางหรือรอเคลียร์เงิน</p>
          </Card>
        )}

        {/* กำลังเดินทาง — ปุ่มหลัก = บันทึกใบเสร็จของกรุ๊ปนั้น */}
        {ongoing.map((p) => (
          <Card key={p.internalId} className="space-y-2">
            <GroupHeader href={groupHref(p.internalId)} code={p.groupCode} sub={`${p.countryName} · ${formatDateRange(p.startDate, p.endDate)}`} tag="กำลังเดินทาง" />
            <div className="flex justify-end zego-divider-top pt-2">
              <NextButton href={`/guide/expenses/record?period=${encodeURIComponent(p.internalId)}`} label="บันทึกใบเสร็จ" />
            </div>
          </Card>
        ))}

        {/* จบทริปแล้ว — บอกว่าค้างขั้นไหน และขั้นต่อไปคืออะไร */}
        {afterGroups.map(({ period, progress, upcomingApt, daysSinceReturn, overdue }) => (
          <Card key={period.internalId} className="space-y-2.5">
            <GroupHeader
              href={groupHref(period.internalId)}
              code={period.groupCode}
              sub={`กลับ ${formatDate(period.endDate)}`}
              // ยังไม่มีนัด — บอกว่ากลับมานานแค่ไหนแล้ว (แดง = เกินกำหนดเคลียร์ของบริษัท · มีนัดแล้วไม่ต้องเตือน)
              tag={!upcomingApt && daysSinceReturn > 0 ? `ค้างเคลียร์ ${daysSinceReturn} วัน` : undefined}
              tagTone={overdue ? 'red' : 'amber'}
            />
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
                <span className="flex flex-col items-end gap-0.5">
                  <NextButton href={progress.next.href} label={progress.next.label} />
                  {/* นัดแล้วแต่ยังมีงานค้าง — ต้องทำให้ทันก่อนวันนัด (ยกเว้นขั้นที่เป็นการยืนยันนัดเอง) */}
                  {upcomingApt && progress.next.href !== '/guide/settlement/appointments' && (
                    <span className="text-[11px] font-medium text-amber-800">ทำก่อนวันนัด {formatDate(upcomingApt.date)}</span>
                  )}
                </span>
              ) : (
                <span className="text-xs zego-text-tertiary">{progress.next.label}</span>
              )}
            </div>
          </Card>
        ))}
      </section>
    </div>
  );
}

function QuickAction({ href, icon, label, description, badge }: { href: string; icon: IconName; label: string; description: string; badge?: number }) {
  return (
    <Link href={href} className="relative flex flex-col gap-2 rounded-xl border zego-border-color zego-surface-bg p-3 zego-hover-surface">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 zego-text-success">
        <Icon name={icon} className="h-4.5 w-4.5" />
      </span>
      <span>
        <span className="block text-sm font-semibold zego-text">{label}</span>
        <span className="block text-[11px] leading-tight zego-text-tertiary">{description}</span>
      </span>
      {!!badge && (
        <span className="zego-count-badge absolute right-2.5 top-2.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold">{badge}</span>
      )}
    </Link>
  );
}

/** หัวการ์ดกรุ๊ป — แตะ = ส่วนบัญชี-การเงินในหน้ารายละเอียดงาน */
const TAG_TONE = {
  sky: 'bg-sky-50 text-sky-700',
  amber: 'bg-amber-100 text-amber-800',
  red: 'bg-rose-100 text-rose-700',
} as const;

function GroupHeader({ href, code, sub, tag, tagTone = 'sky' }: { href: string; code: string; sub: string; tag?: string; tagTone?: keyof typeof TAG_TONE }) {
  return (
    <Link href={href} className="-m-1 flex items-center justify-between gap-2 rounded-lg p-1 zego-hover-surface">
      <span className="min-w-0">
        <span className="flex items-center gap-1.5">
          <span className="text-sm font-semibold zego-text">{code}</span>
          {tag && <span className={cx('rounded-full px-1.5 py-0.5 text-[10px] font-medium', TAG_TONE[tagTone])}>{tag}</span>}
        </span>
        <span className="block truncate text-xs zego-text-tertiary">{sub}</span>
      </span>
      <Icon name="chevronRight" className="h-4 w-4 shrink-0 zego-text-disabled" />
    </Link>
  );
}

function NextButton({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-0.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">
      {label}
      <Icon name="chevronRight" className="h-3.5 w-3.5" />
    </Link>
  );
}
