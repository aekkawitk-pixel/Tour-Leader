'use client';

/**
 * หน้าหลัก (Personal Workspace) ของพอร์ทัลหัวหน้าทัวร์ — /guide
 *
 * หน้าสรุป ไม่ใช่ทางลัดเมนู (เมนูอยู่แถบล่างแล้ว):
 *   1) สิ่งที่ต้องทำ — เฉพาะเรื่องที่รอหัวหน้าทัวร์ (คอนเฟิร์มงาน / ยืนยันรับซอง / แก้ใบเสร็จ / เคลียร์เงิน / นัดหมาย)
 *   2) สรุปงาน — กำลังเดินทาง · กำลังจะถึง · รอเคลียร์ + งานถัดไป
 *   3) สรุปการเงิน — ซองเงินที่ถืออยู่ · สถานะใบเสร็จที่บันทึก
 * ไม่มี checklist/attendance/customer-care ที่เพิ่มภาระรายวัน (ตัดออกแล้วตามที่คุยกัน)
 */

import Link from 'next/link';
import { useDemo } from '@/store/DemoStore';
import { ownLeaderScope } from '@/lib/permissions';
import { getTourPeriods } from '@/services/tourPeriodMaster';
import { loadActiveGuideAssignments } from '@/services/guideAssignmentStore';
import { boardStatusMeta } from '@/lib/logic/guideBoard';
import { leaderDisplayName } from '@/lib/logic/leaderExpertise';
import { useLeaderDocumentsView } from '@/lib/useLeaderDocuments';
import { listDocumentExpiryAlerts } from '@/lib/logic/documentExpiryAlerts';
import { formatCurrency, formatDate, formatDateRange } from '@/lib/format';
import { countPendingConfirmationJobs } from '@/lib/logic/pendingConfirmationAlerts';
import { envelopeStage, sumAmounts } from '@/lib/logic/cashEnvelope';
import { Card, Callout, StatusBadge, cx } from '@/components/ui/Primitives';
import { Icon, type IconName } from '@/components/ui/Icon';

interface Todo { key: string; href: string; icon: IconName; title: string; detail: string; tone: 'red' | 'amber' | 'violet' | 'blue' }
const TODO_TONE: Record<Todo['tone'], string> = {
  red: 'bg-rose-50 text-rose-700',
  amber: 'bg-amber-50 text-amber-700',
  violet: 'bg-violet-50 text-violet-700',
  blue: 'bg-sky-50 text-sky-700',
};

export default function GuideHomePage() {
  const { currentUser, leaders, today, envelopes, expenses, settlements, appointments } = useDemo();

  // GuideShell กันบัญชีที่ไม่ใช่บทบาทหัวหน้าทัวร์ไว้แล้วที่ชั้นบนสุด — หน้านี้เข้าถึงได้แปลว่าเป็นหัวหน้าทัวร์แน่นอน
  const leaderId = ownLeaderScope(currentUser);
  const leader = leaders.find((l) => l.id === leaderId);

  // เอกสารต้องตาม (หมดอายุแล้ว/ใกล้หมดอายุ) — ดูของตัวเองได้เสมอ ไม่ต้องเช็คสิทธิ์เพิ่ม
  const documents = useLeaderDocumentsView(leader, true);
  const docAlerts = listDocumentExpiryAlerts(documents, today);
  const expiredDocs = docAlerts.filter((a) => a.severity === 'expired');
  const soonDocs = docAlerts.filter((a) => a.severity === 'soon');

  // ดึงจาก Tour Period Master + guideAssignmentStore — แหล่งเดียวกับที่หน้า "การจัดสเก็ต" ฝั่งผู้จัดใช้จริง
  const periodById = new Map(getTourPeriods().map((p) => [p.internalId, p]));
  const myJobs = (leaderId ? loadActiveGuideAssignments().filter((a) => a.tourLeaderId === leaderId) : [])
    .map((assignment) => ({ assignment, period: periodById.get(assignment.periodId) }))
    .filter((x): x is { assignment: typeof x.assignment; period: NonNullable<typeof x.period> } => Boolean(x.period))
    .filter((x) => x.assignment.assignmentStatus !== 'DECLINED' && x.period.endDate >= today)
    .sort((a, b) => a.period.startDate.localeCompare(b.period.startDate));
  const ongoing = myJobs.filter((x) => x.period.startDate <= today);
  const upcoming = myJobs.filter((x) => x.period.startDate > today);
  // งานถัดไป = กำลังเดินทางอยู่ก่อน ไม่มีค่อยเป็นงานที่ใกล้สุด
  const nextJob = ongoing[0] ?? upcoming[0];

  /* ---------------- สิ่งที่ต้องทำ ---------------- */
  const pendingJobs = countPendingConfirmationJobs(leaderId, today);
  // ซองที่ส่งมอบถึงตัวเองแล้ว แต่ยังไม่กดยืนยันรับ (ไม่นับซองที่เจ้าหน้าที่ส่งคืนการเงินไปแล้ว)
  const envToAck = envelopes.filter((e) => envelopeStage(e) === 'handed_over' && e.handover?.receiverId === leaderId && !e.staffReturn);
  const myReceipts = expenses.filter((e) => e.requesterId === leaderId && e.category === 'actual' && e.status !== 'cancelled');
  const toRevise = myReceipts.filter((e) => e.status === 'revise');
  const mySettlements = settlements.filter((s) => s.leaderId === leaderId && s.status !== 'settled' && s.status !== 'closed');
  const needBooking = mySettlements.filter((s) => !s.appointmentId);
  const nextAppt = appointments
    .filter((a) => a.leaderId === leaderId && a.date >= today && (a.status === 'pending' || a.status === 'confirmed' || a.status === 'rescheduled'))
    .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))[0];

  const todos: Todo[] = [
    pendingJobs > 0 && { key: 'jobs', href: '/guide/jobs', icon: 'bell', title: `งานรอคอนเฟิร์ม ${pendingJobs} งาน`, detail: 'กดคอนเฟิร์มรับงานที่งานของฉัน', tone: 'amber' },
    envToAck.length > 0 && {
      key: 'env', href: '/guide/finance?tab=before', icon: 'money', title: `ซองเงินรอยืนยันรับ ${envToAck.length} ซอง`,
      detail: fmtTotals(sumAmounts(envToAck.flatMap((e) => e.sealed?.faceTotals ?? []))), tone: 'violet',
    },
    toRevise.length > 0 && { key: 'revise', href: '/guide/expenses/by-group', icon: 'warning', title: `ใบเสร็จต้องแก้ไข ${toRevise.length} ใบ`, detail: 'บัญชีส่งกลับให้แก้ไข', tone: 'red' },
    needBooking.length > 0 && { key: 'settle', href: '/guide/settlement/appointments', icon: 'receipt', title: `รอเคลียร์เงิน ${needBooking.length} กรุ๊ป`, detail: 'ยังไม่ได้จองคิวนัดหมายกับฝ่ายบัญชี', tone: 'amber' },
    nextAppt && { key: 'appt', href: '/guide/settlement/appointments', icon: 'calendar', title: `นัดเคลียร์เงิน ${formatDate(nextAppt.date)} ${nextAppt.time}`, detail: nextAppt.location, tone: 'blue' },
  ].filter(Boolean) as Todo[];

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
      <div>
        <h1 className="text-lg font-bold zego-text">
          สวัสดี{leader ? `, ${leaderDisplayName(leader)}` : ''}
        </h1>
        <p className="text-sm zego-text-tertiary">{leader ? leader.id : currentUser.position}</p>
      </div>

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

      {/* 1) สิ่งที่ต้องทำ — เฉพาะเรื่องที่รอหัวหน้าทัวร์ */}
      <Card padded={false}>
        <div className="zego-divider-bottom flex items-center justify-between px-4 py-2.5">
          <p className="text-sm font-semibold zego-text">สิ่งที่ต้องทำ</p>
          {todos.length > 0 && <span className="zego-count-badge flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold">{todos.length}</span>}
        </div>
        {todos.length === 0 ? (
          <div className="flex items-center justify-center gap-2 px-4 py-5 text-sm zego-text-success">
            <Icon name="check" className="h-4 w-4" />
            ไม่มีเรื่องค้าง
          </div>
        ) : (
          <ul className="divide-y divide-[var(--zego-border-soft)]">
            {todos.map((t) => (
              <li key={t.key}>
                <Link href={t.href} className="flex items-center gap-3 px-4 py-2.5 zego-hover-surface">
                  <span className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', TODO_TONE[t.tone])}>
                    <Icon name={t.icon} className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium zego-text">{t.title}</span>
                    <span className="block truncate text-xs zego-text-tertiary">{t.detail}</span>
                  </span>
                  <Icon name="chevronRight" className="h-4 w-4 shrink-0 zego-text-disabled" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* 2) สรุปงาน */}
      <Card padded={false}>
        <div className="zego-divider-bottom px-4 py-2.5">
          <p className="text-sm font-semibold zego-text">สรุปงาน</p>
        </div>
        <div className="grid grid-cols-3 divide-x divide-[var(--zego-border-soft)] text-center">
          <Stat label="กำลังเดินทาง" value={ongoing.length} tone="text-emerald-700" />
          <Stat label="กำลังจะถึง" value={upcoming.length} tone="text-sky-700" />
          <Stat label="รอเคลียร์เงิน" value={mySettlements.length} tone="text-amber-700" />
        </div>
        {nextJob && (
          <Link href={`/guide/jobs/${nextJob.period.internalId}`} className="block zego-divider-top px-4 py-3 zego-hover-surface">
            <p className="mb-1 text-[11px] font-medium zego-text-tertiary">{nextJob.period.startDate <= today ? 'กำลังเดินทาง' : 'งานถัดไป'}</p>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold zego-text">{nextJob.period.groupCode} · {nextJob.period.displayName}</p>
                <p className="mt-0.5 text-xs zego-text-tertiary">
                  {nextJob.period.countryName} · {formatDateRange(nextJob.period.startDate, nextJob.period.endDate)}
                </p>
              </div>
              <StatusBadge meta={boardStatusMeta(nextJob.assignment.assignmentStatus)} size="sm" />
            </div>
          </Link>
        )}
      </Card>

      {/* 3) สรุปการเงิน */}
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
