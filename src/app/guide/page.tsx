'use client';

/**
 * หน้าหลัก (Personal Workspace) ของพอร์ทัลหัวหน้าทัวร์ — /guide
 *
 * หน้าสรุป ไม่ใช่ทางลัดเมนู (เมนูอยู่แถบล่างแล้ว):
 *   1) จำนวนงาน — เดือนนี้ · เดือนหน้า (เลื่อนดูเดือนย้อนหลังได้)
 *   2) กรุ๊ปงานถัดไป — กรุ๊ปที่จะออกเดินทางใกล้สุด (นับถอยหลังวันออกเดินทาง)
 *   3) มีซองเงินค้าง (รอรับ / กำลังมา / แจ้งไม่ได้รับ) → การ์ดเตือนกรุ๊ปละบรรทัด แตะไปยืนยันที่แท็บ "ก่อนเดินทาง"
 *      (ยืนยันรับซองทำที่เดียว — การ์ดซองเงินชุดเดียวกับหน้ารายละเอียดงาน ไม่มีหน้าตาที่สองที่หน้าหลัก)
 *   4) สรุปการเงิน (ซองเงินที่ถืออยู่ · สถานะใบเสร็จที่บันทึก)
 * ไม่มี checklist/attendance/customer-care ที่เพิ่มภาระรายวัน (ตัดออกแล้วตามที่คุยกัน)
 */

import Link from 'next/link';
import { CarrierLeaderSection } from './CarrierLeaderSection';
import { useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { ownLeaderScope } from '@/lib/permissions';
import { getTourPeriods } from '@/services/tourPeriodMaster';
import { loadActiveGuideAssignments } from '@/services/guideAssignmentStore';
import { boardStatusMeta } from '@/lib/logic/guideBoard';
import { useLeaderDocumentsView } from '@/lib/useLeaderDocuments';
import { listDocumentExpiryAlerts } from '@/lib/logic/documentExpiryAlerts';
import { formatCurrency, formatDate, formatDateRange, toISODate } from '@/lib/format';
import { leaderEnvelopeState, sumAmounts } from '@/lib/logic/cashEnvelope';
import { Card, Callout, StatusBadge, cx } from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icon';

export default function GuideHomePage() {
  const { currentUser, leaders, today, envelopes, expenses } = useDemo();

  // GuideShell กันบัญชีที่ไม่ใช่บทบาทหัวหน้าทัวร์ไว้แล้วที่ชั้นบนสุด — หน้านี้เข้าถึงได้แปลว่าเป็นหัวหน้าทัวร์แน่นอน
  const leaderId = ownLeaderScope(currentUser);
  const leader = leaders.find((l) => l.id === leaderId);

  // เอกสารต้องตาม (หมดอายุแล้ว/ใกล้หมดอายุ) — ดูของตัวเองได้เสมอ ไม่ต้องเช็คสิทธิ์เพิ่ม
  const documents = useLeaderDocumentsView(leader, true);
  const docAlerts = listDocumentExpiryAlerts(documents, today);
  const expiredDocs = docAlerts.filter((a) => a.severity === 'expired');
  const soonDocs = docAlerts.filter((a) => a.severity === 'soon');

  /*
    ช่วงเดินทาง/นัดหมาย เทียบกับวันที่จริงของเครื่อง — ให้ตรงกับหน้างานของฉัน/บัญชี-การเงิน/บันทึกใบเสร็จ
    (เดิมใช้ DEMO_TODAY = 2026-07-13 ทำให้กรุ๊ปที่กำลังเดินทางจริงถูกนับเป็น "กำลังจะถึง")
  */
  const realToday = toISODate(new Date());

  // ดึงจาก Tour Period Master + guideAssignmentStore — แหล่งเดียวกับที่หน้า "การจัดสเก็ต" ฝั่งผู้จัดใช้จริง
  const periodById = new Map(getTourPeriods().map((p) => [p.internalId, p]));
  const myJobs = (leaderId ? loadActiveGuideAssignments().filter((a) => a.tourLeaderId === leaderId) : [])
    .map((assignment) => ({ assignment, period: periodById.get(assignment.periodId) }))
    .filter((x): x is { assignment: typeof x.assignment; period: NonNullable<typeof x.period> } => Boolean(x.period))
    .filter((x) => x.assignment.assignmentStatus !== 'DECLINED' && x.period.endDate >= realToday)
    .sort((a, b) => a.period.startDate.localeCompare(b.period.startDate));
  // จำนวนงานรายเดือน — นับตามเดือนที่ออกเดินทาง (แบบเดียวกับหน้างานของฉัน) · รวมงานที่จบแล้ว เพื่อดูย้อนหลังได้ · ไม่นับงานที่ปฏิเสธ
  const allMyJobs = (leaderId ? loadActiveGuideAssignments().filter((a) => a.tourLeaderId === leaderId && a.assignmentStatus !== 'DECLINED') : [])
    .map((a) => periodById.get(a.periodId))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));
  const thisMonth = realToday.slice(0, 7);
  const [monthCursor, setMonthCursor] = useState(thisMonth);
  const shiftMonth = (ym: string, delta: number) => {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };
  const jobsInMonth = (ym: string) => allMyJobs.filter((p) => p.startDate.slice(0, 7) === ym).length;
  const monthName = (ym: string) => new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, 1).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
  const nextOfCursor = shiftMonth(monthCursor, 1);
  const tileLabel = (ym: string) => (ym === thisMonth ? 'เดือนนี้' : ym === shiftMonth(thisMonth, 1) ? 'เดือนหน้า' : ym === shiftMonth(thisMonth, -1) ? 'เดือนที่แล้ว' : '');

  const upcoming = myJobs.filter((x) => x.period.startDate > realToday);
  // กรุ๊ปงานถัดไป = กรุ๊ปที่จะออกเดินทางใกล้สุด (ยังไม่ออกเดินทาง)
  const nextJob = upcoming[0];
  const daysToGo = nextJob
    ? Math.round((new Date(`${nextJob.period.startDate}T00:00:00`).getTime() - new Date(`${realToday}T00:00:00`).getTime()) / 86_400_000)
    : 0;

  /* ---------------- ซองเงิน ---------------- */
  // ซองที่ถึงมือแล้วรอกดยืนยันรับ / ซองที่เจ้าหน้าที่ส่งกรุ๊ปยังถืออยู่ระหว่างทาง
  const envToAck = envelopes.filter((e) => leaderEnvelopeState(e, leaderId) === 'to_ack');
  const envInTransit = envelopes.filter((e) => leaderEnvelopeState(e, leaderId) === 'in_transit');
  // กรุ๊ปที่มีซองส่งถึงคุณและยังไม่ได้ยืนยันรับ — แสดงการ์ดซองเงินแทนสรุปการเงิน (ยังรอรับก่อน ค่อยดูสรุป)
  // รวมซองที่แจ้งไม่ได้รับไว้ด้วย — ยังค้างอยู่จนกว่าการเงินจะตามได้ / ได้รับภายหลัง
  const envReported = envelopes.filter((e) => leaderEnvelopeState(e, leaderId) === 'not_received');
  // ซองที่ยังอยู่การเงิน (เจ้าหน้าที่ยังไม่รับ) — แสดงให้รู้ว่ามีซองกำลังมา แต่ยังกดอะไรไม่ได้
  const envAtFinance = envelopes.filter((e) => leaderEnvelopeState(e, leaderId) === 'at_finance');
  const ackGroups = [...new Set([...envToAck, ...envInTransit, ...envReported, ...envAtFinance].map((e) => e.periodId))]
    .map((id) => periodById.get(id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const myReceipts = expenses.filter((e) => e.requesterId === leaderId && e.category === 'actual' && e.status !== 'cancelled');

  /* ---------------- สรุปการเงิน ---------------- */
  // ซองที่อยู่ในมือ = ยืนยันรับแล้ว ยังไม่ส่งต่อ และยังไม่ส่งให้แลนด์
  const holding = envelopes.filter((e) => e.leaderAck?.leaderId === leaderId && !e.leaderForward && !e.landPayments?.length);
  const holdingTotals = sumAmounts(holding.flatMap((e) => e.sealed?.faceTotals ?? []));
  const receiptCount = {
    waiting: myReceipts.filter((e) => e.status === 'draft' || e.status === 'submitted').length,
    approved: myReceipts.filter((e) => e.status === 'approved' || e.status === 'awaiting_payment' || e.status === 'paid').length,
    problem: myReceipts.filter((e) => e.status === 'revise' || e.status === 'rejected').length,
  };

  return (
    <div className="space-y-4">
      {/* ไม่มีคำทักทาย/รหัส — ชื่อผู้ใช้อยู่แถบบนแล้ว · หัวข้อไว้ให้โปรแกรมอ่านหน้าจอเท่านั้น */}
      <h1 className="sr-only">หน้าหลัก</h1>

      {!leader && (
        <Card className="bg-amber-50 ring-1 ring-amber-200">
          <p className="text-sm zego-text-warning">
            ยังไม่พบข้อมูลหัวหน้าทัวร์ที่ผูกกับบัญชีนี้ในชุดข้อมูลปัจจุบัน — ทางลัดด้านล่างยังใช้งานได้ตามปกติ
          </p>
        </Card>
      )}

      {/* เอกสารต้องตาม — แจ้งเตือนเฉพาะเอกสาร แยกจากงาน/ค่าใช้จ่าย */}
      {docAlerts.length > 0 && (
        <Link href="/guide/profile/documents" className="block">
          <Callout
            tone={expiredDocs.length > 0 ? 'red' : 'amber'}
            title={`เอกสารต้องตาม ${docAlerts.length} รายการ`}
          >
            {expiredDocs.length > 0 && `หมดอายุแล้ว: ${expiredDocs.map((a) => a.name).join(', ')}`}
            {expiredDocs.length > 0 && soonDocs.length > 0 && ' · '}
            {soonDocs.length > 0 && `ใกล้หมดอายุ: ${soonDocs.map((a) => a.name).join(', ')}`}
          </Callout>
        </Link>
      )}

      {/* 1) จำนวนงาน — จำนวนงานรายเดือน: เดือนที่เลือก + เดือนถัดไป · ‹ › เลื่อนดูย้อนหลัง/ล่วงหน้า */}
      <Card padded={false}>
        <div className="zego-divider-bottom flex items-center justify-between gap-2 px-2 py-1.5">
          <p className="pl-2 text-sm font-semibold zego-text">จำนวนงาน</p>
          <div className="flex items-center">
            {monthCursor !== thisMonth && (
              <button type="button" onClick={() => setMonthCursor(thisMonth)} className="mr-1 rounded-md px-2 py-1 text-[11px] font-medium zego-text-success hover:bg-emerald-50">
                เดือนนี้
              </button>
            )}
            <button type="button" onClick={() => setMonthCursor((c) => shiftMonth(c, -1))} aria-label="ดูเดือนก่อนหน้า" className="rounded-lg p-1.5 zego-hover-surface">
              <Icon name="chevronLeft" className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => setMonthCursor((c) => shiftMonth(c, 1))} aria-label="ดูเดือนถัดไป" className="rounded-lg p-1.5 zego-hover-surface">
              <Icon name="chevronRight" className="h-4 w-4" />
            </button>
          </div>
        </div>
        {/* กดแต่ละเดือน → ปฏิทินงานของฉันเปิดที่เดือนนั้น */}
        <div className="grid grid-cols-2 divide-x divide-[var(--zego-border-soft)] text-center">
          {[monthCursor, nextOfCursor].map((ym, i) => (
            <Link key={ym} href={`/guide/jobs?month=${ym}`} className="block px-2 py-3 zego-hover-surface">
              <p className="text-[11px] font-medium zego-text-tertiary">{tileLabel(ym) || '\u00a0'}</p>
              <p className={cx('text-2xl font-bold tabular-nums', jobsInMonth(ym) > 0 ? (i === 0 ? 'text-emerald-700' : 'text-sky-700') : 'zego-text-tertiary')}>
                {jobsInMonth(ym)}
                <span className="ml-1 text-xs font-medium zego-text-tertiary">งาน</span>
              </p>
              <p className="text-[11px] zego-text-secondary">{monthName(ym)}</p>
            </Link>
          ))}
        </div>
      </Card>

      {/* 2) กรุ๊ปงานถัดไป */}
      <Card padded={false}>
        <div className="zego-divider-bottom flex items-center justify-between px-4 py-2.5">
          <p className="text-sm font-semibold zego-text">กรุ๊ปงานถัดไป</p>
          {nextJob && (
            <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
              {daysToGo === 1 ? 'ออกเดินทางพรุ่งนี้' : `อีก ${daysToGo} วัน`}
            </span>
          )}
        </div>
        {!nextJob ? (
          <p className="px-4 py-5 text-center text-sm zego-text-tertiary">ยังไม่มีงานที่กำลังจะถึง</p>
        ) : (
          <Link href={`/guide/jobs/${nextJob.period.internalId}`} className="block px-4 py-3 zego-hover-surface">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold zego-text">{nextJob.period.groupCode} · {nextJob.period.displayName}</p>
                <p className="mt-0.5 text-xs zego-text-tertiary">
                  {nextJob.period.countryName} · {formatDateRange(nextJob.period.startDate, nextJob.period.endDate)}
                </p>
              </div>
              <StatusBadge meta={boardStatusMeta(nextJob.assignment.assignmentStatus)} size="sm" />
            </div>
          </Link>
        )}
      </Card>

      {/* ซองของกรุ๊ปอื่นที่ฝากคุณนำส่ง (ถ้ามี) — แยกจากซองของกรุ๊ปตัวเอง */}
      <CarrierLeaderSection />

      {/* 3) ซองเงินค้าง — แค่เตือน แล้วพาไปยืนยันที่แท็บก่อนเดินทาง (ที่เดียวที่ยืนยันรับซอง) */}
      {ackGroups.length > 0 && (
        <Link href="/guide/finance?tab=before" className="block">
          <Card padded={false} className="border-amber-200 hover:border-amber-300">
            <div className="zego-divider-bottom flex items-center justify-between gap-2 bg-amber-50 px-4 py-2.5">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-900">
                <Icon name="money" className="h-4 w-4" />
                ซองเงินรอคุณ · {ackGroups.length} กรุ๊ป
              </p>
              <span className="flex items-center gap-0.5 text-xs font-medium text-amber-900">
                ไปยืนยันรับ
                <Icon name="chevronRight" className="h-4 w-4" />
              </span>
            </div>
            <ul className="divide-y divide-[var(--zego-border-soft)]">
              {ackGroups.map((p) => {
                const n = (list: typeof envToAck) => list.filter((e) => e.periodId === p.internalId).length;
                const parts = [
                  n(envToAck) && `ถึงมือแล้ว ${n(envToAck)} ซอง`,
                  n(envInTransit) && `กำลังนำมาส่ง ${n(envInTransit)} ซอง`,
                  n(envAtFinance) && `ยังอยู่ที่การเงิน ${n(envAtFinance)} ซอง`,
                  n(envReported) && `แจ้งไม่ได้รับ ${n(envReported)} ซอง`,
                ].filter(Boolean);
                return (
                  <li key={p.internalId} className="px-4 py-2">
                    <p className="text-sm font-medium zego-text">{p.groupCode}</p>
                    <p className="text-xs zego-text-tertiary">ออก {formatDate(p.startDate)} · {parts.join(' · ')}</p>
                  </li>
                );
              })}
            </ul>
          </Card>
        </Link>
      )}

      {/* 4) สรุปการเงิน */}
      <Link href="/guide/finance" className="block">
        <Card padded={false} className="hover:border-emerald-300">
          <div className="zego-divider-bottom flex items-center justify-between px-4 py-2.5">
            <p className="text-sm font-semibold zego-text">สรุปการเงิน</p>
            <Icon name="chevronRight" className="h-4 w-4 zego-text-disabled" />
          </div>
          <div className="space-y-0.5 px-4 py-3">
            <p className="text-xs zego-text-tertiary">ซองเงินที่ถืออยู่ · {holding.length} ซอง</p>
            {holdingTotals.length > 0
              ? holdingTotals.map((t) => <p key={t.currency} className="text-lg font-bold tabular-nums zego-text">{formatCurrency(t.amount, t.currency)}</p>)
              : <p className="text-lg font-bold tabular-nums zego-text-tertiary">—</p>}
            {envInTransit.length > 0 && (
              <p className="pt-1 text-xs text-violet-700">
                กำลังส่งมาถึงคุณ {envInTransit.length} ซอง · {fmtTotals(sumAmounts(envInTransit.flatMap((e) => e.sealed?.faceTotals ?? [])))}
              </p>
            )}
          </div>
          <div className="grid grid-cols-3 divide-x divide-[var(--zego-border-soft)] zego-divider-top text-center">
            <Stat label="ใบเสร็จรอตรวจ" value={receiptCount.waiting} tone="text-sky-700" />
            <Stat label="อนุมัติแล้ว" value={receiptCount.approved} tone="text-emerald-700" />
            <Stat label="ต้องแก้/ไม่ผ่าน" value={receiptCount.problem} tone="text-rose-700" />
          </div>
        </Card>
      </Link>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="px-2 py-3">
      <p className={cx('text-xl font-bold tabular-nums', value > 0 ? tone : 'zego-text-tertiary')}>{value}</p>
      <p className="text-[11px] zego-text-tertiary">{label}</p>
    </div>
  );
}

const fmtTotals = (list: { amount: number; currency: string }[]) => list.map((t) => formatCurrency(t.amount, t.currency)).join(' · ');
