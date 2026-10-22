'use client';

/**
 * งานของฉัน — /guide/jobs
 *
 * ⚠️ แก้ไขสำคัญ: เดิมอ่านจาก useDemo().jobs (TourJob) ซึ่งเป็นชุดข้อมูลเก่า/เล็กมาก (~10 รายการ
 * ไม่มีจริงสำหรับหัวหน้าทัวร์ส่วนใหญ่) ตัวระบบจัดหัวหน้าทัวร์จริงที่ใช้งานอยู่ (หน้า "การจัดสเก็ต")
 * ผูกกับ Tour Period Master ผ่าน guideAssignmentStore ต่างหาก — เปลี่ยนมาอ่านจากที่นั่นแทน
 * เพื่อให้เห็นงานที่ถูกจัดจริงตรงกับที่ผู้จัดเห็น (ดู src/services/guideAssignmentStore.ts)
 *
 * ดูได้ 2 แบบ: ปฏิทิน (ค่าเริ่มต้น — ตารางเดือน แถบสีตามช่วงเดินทางของแต่ละงาน) / รายการ (แบ่งรายเดือน)
 * แบบที่เลือกจำไว้ในเครื่อง (localStorage) — เปิดครั้งหน้าได้แบบเดิม
 *
 * หน้าตาตามธีม v3: ชื่อหน้าตัวใหญ่เขียวป่า · ปุ่มสลับมุมมองแบบ segmented หมอกเขียว
 * · แถบปฏิทินใช้สีสถานะของธีม (เขียวปุ่ม/ทอง/แดง/เทา) · แถวงานมีธงปลายทาง รหัสกรุ๊ปตัว display และป้ายทรงเม็ด
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { ownLeaderScope } from '@/lib/permissions';
import { getTourPeriods } from '@/services/tourPeriodMaster';
import { loadActiveGuideAssignments } from '@/services/guideAssignmentStore';
import { boardStatusMeta } from '@/lib/logic/guideBoard';
import { formatDate, formatDateRange, toISODate } from '@/lib/format';
import { tripEnded, tripStarted } from '@/lib/logic/tripPhase';
import { activeLeaderClaim } from '@/lib/logic/leaderClaims';
import { afterTripProgress } from '@/lib/logic/afterTripProgress';
import { jobNextStep, type NextStepTone } from '@/lib/logic/guideJobNextStep';
import { loadGroupClears } from '@/services/groupClearStore';
import type { TourPeriodMaster } from '@/data/schedule/masterTypes';
import { Card, EmptyState, cx } from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icon';
import { MonthHeader, MonthYearSelect, useMonthGroups } from '@/components/ui/MonthFilter';
import { resolveDestination } from '@/lib/logic/destinations';
import { FlagTile } from '../GuideUi';
import { isGroupAdvanceDoc } from '@/lib/logic/groupBudget';
import { groupEnvelopeStatus, groupLines, leaderEnvelopeState, type EnvelopeTone } from '@/lib/logic/cashEnvelope';

type View = 'list' | 'calendar';
const VIEW_KEY = 'guideJobsView';

export default function GuideJobsPage() {
  const { currentUser } = useDemo();
  const leaderId = ownLeaderScope(currentUser);

  const periodById = new Map(getTourPeriods().map((p) => [p.internalId, p]));
  // ไม่แสดงงานสถานะปฏิเสธ (ข้อมูลเก่า — ปัจจุบันมอบหมาย = คอนเฟิร์มทันที) · เกณฑ์เดียวกับหน้าหลัก
  const myJobs = (leaderId ? loadActiveGuideAssignments().filter((a) => a.tourLeaderId === leaderId && a.assignmentStatus !== 'DECLINED') : [])
    .map((assignment) => ({ assignment, period: periodById.get(assignment.periodId) }))
    .filter((x): x is { assignment: typeof x.assignment; period: NonNullable<typeof x.period> } => Boolean(x.period))
    .sort((a, b) => b.period.startDate.localeCompare(a.period.startDate));

  // แบ่งรายปี/รายเดือนตามวันออกเดินทาง (ใหม่สุดก่อนเหมือนเดิม) — ค่าเริ่มต้นเป็นปีปัจจุบัน ชุดเดียวกับพอร์ทัลเจ้าหน้าที่ส่งกรุ๊ป
  const monthGroups = useMonthGroups(myJobs, (j) => j.period.startDate, toISODate(new Date()));

  const [view, setView] = useState<View>('calendar');
  /** เปิดจากสรุปงานในหน้าหลัก (?month=YYYY-MM) — เปิดปฏิทินที่เดือนนั้น */
  const [startMonth, setStartMonth] = useState<string | null>(null);
  // อ่านแบบที่จำไว้ / เดือนจาก URL หลัง mount (หน้านี้ถูก prerender) — ค่าเริ่มต้น/อ่านไม่ได้ = ปฏิทิน
  useEffect(() => {
    const month = new URLSearchParams(window.location.search).get('month');
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      // มาจากการกดเดือนที่ต้องการ — แสดงปฏิทินเดือนนั้นเสมอ (ไม่เปลี่ยนแบบที่จำไว้)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- ซิงก์จาก URL ครั้งเดียวตอน mount
      setStartMonth(month);
      return;
    }
    try {
      if (window.localStorage.getItem(VIEW_KEY) === 'list') setView('list');
    } catch { /* ไม่มี storage */ }
  }, []);
  const pickView = (v: View) => {
    setView(v);
    try { window.localStorage.setItem(VIEW_KEY, v); } catch { /* แค่ไม่จำ */ }
  };

  return (
    <div className="space-y-4">
      {/* ชื่อหน้า + ปุ่มสลับมุมมองแถวเดียวกัน · คำอธิบายเต็มบรรทัดด้านล่าง (ไม่บีบจนตัดคำ) */}
      <div>
        <div className="flex items-center justify-between gap-3">
          <h1 className="zego-guide-title">งานของฉัน</h1>
          <div className="zego-guide-seg w-[168px] shrink-0" role="group" aria-label="รูปแบบการแสดง">
            {([
              { key: 'calendar', icon: 'calendar', label: 'ปฏิทิน' },
              { key: 'list', icon: 'list', label: 'รายการ' },
            ] as const).map((o) => (
              <button
                key={o.key}
                type="button"
                aria-pressed={view === o.key}
                title={o.label}
                onClick={() => pickView(o.key)}
                className="flex items-center justify-center gap-1"
              >
                <Icon name={o.icon} className="h-4 w-4 shrink-0" />
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-0.5 text-sm zego-text-secondary">งานทัวร์ทั้งหมดที่ได้รับมอบหมาย</p>
      </div>

      {myJobs.length === 0 ? (
        <Card padded={false}>
          <EmptyState icon="briefcase" title="ยังไม่มีงานในระบบ" />
        </Card>
      ) : view === 'calendar' ? (
        <JobsCalendar key={startMonth ?? 'auto'} jobs={myJobs} startMonth={startMonth} />
      ) : (
        <>
          <MonthYearSelect groups={monthGroups} />
          <div className="space-y-5">
            {monthGroups.shown.map((m) => (
              <section key={m.key} aria-label={m.label} className="space-y-2">
                <MonthHeader label={m.label} />
                <ul className="zego-guide-list">
                  {m.items.map((job) => <JobRow key={job.assignment.assignmentId} job={job} />)}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

type Job = {
  assignment: ReturnType<typeof loadActiveGuideAssignments>[number];
  period: NonNullable<ReturnType<typeof getTourPeriods>[number]>;
};

/**
 * สีแถบในปฏิทินตามสถานะการจัด (โทนเดียวกับป้ายสถานะ) — ตัวอักษรสีขาวทุกสี
 * ธีม v3: คอนเฟิร์มแล้ว = เขียวปุ่ม · รอ/ต้องเปลี่ยนคน = ทอง · ปฏิเสธ = แดง · อื่น ๆ = เทาอมเขียว
 */
const STATUS_BAR: Record<string, string> = {
  green: 'zego-guide-bar--green',
  amber: 'zego-guide-bar--gold',
  red: 'zego-guide-bar--red',
  slate: 'zego-guide-bar--neutral',
};
const barColor = (status: unknown) => ({ bar: STATUS_BAR[boardStatusMeta(status).tone] ?? STATUS_BAR.slate });

/** ป้ายสถานะการจัดทรงเม็ด — สีเดียวกับแถบในปฏิทิน */
const STATUS_CHIP: Record<string, string> = {
  green: 'zego-chip--green',
  amber: 'zego-chip--gold',
  red: 'zego-chip--red',
  slate: 'zego-chip--neutral',
};

/**
 * แถวงานหนึ่งกรุ๊ป (ใช้ทั้งมุมมองรายการ และรายการใต้ปฏิทิน)
 * ธงปลายทาง · รหัสกรุ๊ป + สถานะ · ชื่อโปรแกรม (ไม่เกิน 2 บรรทัด) · ประเทศ · วันที่ · ขั้นต่อไป + ซองเงิน
 * มือถือ: ไม่วางป้ายยาวไว้ขวามือ — ป้ายยาวบีบชื่อโปรแกรมจนตัดหลายบรรทัด
 */
function JobRow({ job: { assignment, period } }: { job: Job }) {
  const meta = boardStatusMeta(assignment.assignmentStatus);
  const dest = resolveDestination(period.countryName, period.groupCode);
  return (
    <li>
      <Link href={`/guide/jobs/${period.internalId}`} className="zego-guide-row zego-guide-row--tall zego-guide-row--top">
        <FlagTile alpha2={dest.alpha2} fallback={dest.label.slice(0, 2).toUpperCase()} label={dest.label} />
        <span className="min-w-0 flex-1 space-y-1">
          {/* รหัสกรุ๊ปไม่ถูกตัด — ป้ายสถานะยาว (เช่น เปลี่ยนหัวหน้าทัวร์) ขึ้นบรรทัดใหม่แทน */}
          <span className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <span className="zego-guide-code whitespace-nowrap zego-text">{period.groupCode}</span>
            <span className={cx('zego-chip shrink-0', STATUS_CHIP[meta.tone] ?? STATUS_CHIP.slate)}>{meta.label}</span>
          </span>
          <span className="line-clamp-2 block text-[13px] zego-text-secondary" title={period.displayName}>{period.displayName}</span>
          <span className="block text-xs zego-text-tertiary">{dest.label} · {formatDateRange(period.startDate, period.endDate)}</span>
          {/* ขั้นต่อไป — บอกว่ากรุ๊ปนี้ต้องทำอะไรต่อ · ซองเงินของกรุ๊ป */}
          <span className="flex flex-wrap items-center gap-1.5">
            {assignment.financeSwap && (
              <span className="zego-chip zego-chip--gold text-[11px] font-semibold" title="ฝั่งบัญชีเปลี่ยนตัวหัวหน้าทัวร์ของกรุ๊ปนี้">เปลี่ยนตัว</span>
            )}
            <NextStepChip period={period} />
            <EnvelopeChip periodId={period.internalId} />
          </span>
        </span>
        <Icon name="chevronRight" className="zego-guide-chev h-4 w-4 self-center" />
      </Link>
    </li>
  );
}
const WEEKDAYS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

const monthLabel = (y: number, m: number) => new Date(y, m, 1).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
const iso = (y: number, m: number, d: number) => toISODate(new Date(y, m, d));

/**
 * ปฏิทินรายเดือน — แต่ละสัปดาห์มีแถบสีของงานตามช่วงเดินทาง · รหัสกรุ๊ปเต็ม 1 บรรทัด วางบนแถบ ยาวได้ตลอดช่วงวันของแถบในสัปดาห์นั้น
 * งานทับกันแยกเลน (แถวสูงขึ้นตามจำนวนเลน) · ใต้ปฏิทินเป็นรายการงานของเดือนนั้น กดเข้าไปดูรายละเอียดได้
 */
function JobsCalendar({ jobs, startMonth }: { jobs: Job[]; startMonth?: string | null }) {
  const today = toISODate(new Date());
  // เริ่มที่เดือนปัจจุบัน — ถ้าเดือนนี้ไม่มีงาน กระโดดไปเดือนของงานถัดไป (ไม่มีงานข้างหน้า = เดือนนี้)
  const [cursor, setCursor] = useState(() => {
    // ระบุเดือนมา (กดจากสรุปงานในหน้าหลัก) — เปิดเดือนนั้นตรง ๆ
    if (startMonth) return { y: Number(startMonth.slice(0, 4)), m: Number(startMonth.slice(5, 7)) - 1 };
    const now = new Date();
    const ym = today.slice(0, 7);
    const thisMonth = jobs.some((j) => j.period.startDate.slice(0, 7) <= ym && j.period.endDate.slice(0, 7) >= ym);
    const next = [...jobs].sort((a, b) => a.period.startDate.localeCompare(b.period.startDate)).find((j) => j.period.startDate >= today);
    if (!thisMonth && next) {
      const [y, m] = next.period.startDate.split('-').map(Number);
      return { y, m: m - 1 };
    }
    return { y: now.getFullYear(), m: now.getMonth() };
  });
  const move = (delta: number) => setCursor(({ y, m }) => {
    const d = new Date(y, m + delta, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  const { y, m } = cursor;
  const first = iso(y, m, 1);
  const last = iso(y, m + 1, 0);
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const lead = new Date(y, m, 1).getDay();

  // งานที่คาบเกี่ยวเดือนนี้ เรียงตามวันออกเดินทาง — ลำดับนี้กำหนดสี
  const inMonth = jobs
    .filter((j) => j.period.startDate <= last && j.period.endDate >= first)
    .sort((a, b) => a.period.startDate.localeCompare(b.period.startDate));
  const colorOf = new Map(inMonth.map((j) => [j.assignment.assignmentId, barColor(j.assignment.assignmentStatus)]));

  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => iso(y, m, i + 1))];
  while (cells.length % 7) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
  /*
    รหัสกรุ๊ปแสดงครั้งเดียวต่องาน — ที่แถบที่ยาวที่สุดของงานในเดือนนี้ (ยาวเท่ากันเลือกสัปดาห์แรก)
    งานที่เริ่มวันเสาร์มีแถบสัปดาห์แรกแค่ 1 ช่อง ถ้าวางชื่อตรงนั้นตัวอักษรจะถูกบีบจนอ่านไม่ออก
  */
  const labelWeek = new Map(inMonth.map((j) => {
    let best = -1;
    let bestDays = 0;
    weeks.forEach((w, wi) => {
      const days = w.filter((d) => d && j.period.startDate <= d && j.period.endDate >= d).length;
      if (days > bestDays) { best = wi; bestDays = days; }
    });
    return [j.assignment.assignmentId, best] as const;
  }));

  return (
    <div className="space-y-3">
      <Card padded={false}>
        <div className="flex items-center justify-between px-2 py-2">
          <button type="button" onClick={() => move(-1)} aria-label="เดือนก่อนหน้า" className="rounded-lg p-2 zego-hover-surface">
            <Icon name="chevronLeft" className="h-4 w-4" />
          </button>
          <p className="zego-guide-display text-base font-semibold text-[var(--zego-heading)]">{monthLabel(y, m)}</p>
          <button type="button" onClick={() => move(1)} aria-label="เดือนถัดไป" className="rounded-lg p-2 zego-hover-surface">
            <Icon name="chevronRight" className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-7 zego-divider-top text-center">
          {WEEKDAYS.map((w, i) => (
            <p key={w} className={cx('py-1.5 text-[11px] font-medium', i === 0 ? 'zego-guide-sunday' : 'zego-text-tertiary')}>{w}</p>
          ))}
        </div>
        {weeks.map((week, wi) => {
          // แถบของงานในสัปดาห์นี้ — 1 แถบต่อ 1 งาน ยาวตามจำนวนวันในสัปดาห์ แสดงรหัสกรุ๊ปเต็ม
          const segs = inMonth
            .map((j) => {
              const cols = week.map((d, ci) => (d && j.period.startDate <= d && j.period.endDate >= d ? ci : -1)).filter((ci) => ci >= 0);
              return cols.length ? { j, from: cols[0], to: cols[cols.length - 1] } : null;
            })
            .filter((x): x is { j: Job; from: number; to: number } => Boolean(x));
          // จัดเลน: แถบที่ช่วงวันไม่ทับกันใช้เลนเดียวกันได้
          const laneEnd: number[] = [];
          const placed = segs.map((sg) => {
            let lane = laneEnd.findIndex((e) => e < sg.from);
            if (lane < 0) lane = laneEnd.length;
            laneEnd[lane] = sg.to;
            return { ...sg, lane };
          });
          const lanes = laneEnd.length;
          return (
            <div key={wi} className="grid grid-cols-7 border-t border-[var(--zego-border-soft)]">
              {week.map((d, ci) => (
                <div key={ci} className={cx('min-h-16 min-w-0 pb-1 pt-1 [container-type:inline-size]', ci < 6 && 'border-r border-[var(--zego-border-soft)]')}>
                  {d && (
                    <p className={cx(
                      'mx-auto flex h-5 w-5 items-center justify-center rounded-full text-[11px] tabular-nums',
                      d === today ? 'zego-guide-today font-bold' : ci === 0 ? 'zego-guide-sunday' : 'zego-text-secondary',
                    )}>
                      {Number(d.slice(8))}
                    </p>
                  )}
                  {/* ทุกช่องมีเลนเท่ากันทั้งสัปดาห์ แถบของงานเดียวกันจึงอยู่แนวเดียวกัน */}
                  <div className="mt-0.5 space-y-0.5">
                    {Array.from({ length: lanes }, (_, lane) => {
                      const sg = placed.find((x) => x.lane === lane && x.from <= ci && x.to >= ci);
                      if (!sg) return <div key={lane} className="h-[18px]" />;
                      const c = colorOf.get(sg.j.assignment.assignmentId)!;
                      const head = sg.j.period.startDate === d;
                      const tail = sg.j.period.endDate === d;
                      // รหัสกรุ๊ปวางที่ช่องแรกของแถบในสัปดาห์นั้น ยาวได้ตลอดแถบของงานเดียวกัน (span ช่อง) — ไม่เกินแถบของงานตัวเอง
                      const label = ci === sg.from && labelWeek.get(sg.j.assignment.assignmentId) === wi;
                      const span = sg.to - sg.from + 1;
                      return (
                        <Link
                          key={lane}
                          href={`/guide/jobs/${sg.j.period.internalId}`}
                          title={`${sg.j.period.groupCode} · ${sg.j.period.displayName}`}
                          className={cx(
                            // แถบสีทึบตามสถานะ + ตัวขาวหนา · เว้นช่องเฉพาะหัว/ท้ายจริงของงาน (แยกงานที่ติดกัน)
                            // วันที่ไม่ใช่วันท้าย: ยื่นทับเส้นแบ่งช่องวัน (-mr-px) แถบจึงต่อเนื่องไม่มีรอยขาด
                            'relative block h-[18px] font-bold tracking-tight',
                            c.bar, head ? 'ml-0.5 rounded-l-md' : '', tail ? 'mr-0.5 rounded-r-md' : ci < 6 ? '-mr-px' : '',
                          )}
                        >
                          {label && (
                            // กว้าง = จำนวนช่องของแถบ × ความกว้างช่อง (cqw) · ขนาดตัวอักษรพอดี 1 บรรทัด สูงสุด 11px · อยู่เหนือแถบช่องถัดไป
                            <span
                              className="absolute inset-y-0 left-0 z-10 flex items-center justify-center overflow-hidden whitespace-nowrap"
                              style={{
                                // ตั้งสีขาวตรง ๆ — กันสไตล์ลิงก์ส่วนกลางทับสีตัวอักษร
                                color: '#ffffff',
                                width: `calc(${span} * 100cqw)`,
                                fontSize: `min(11px, calc(${span} * 100cqw / ${sg.j.period.groupCode.length * 0.6}))`,
                              }}
                            >
                              {sg.j.period.groupCode}
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </Card>

      {/* งานของเดือนนี้ — ป้ายสถานะสีเดียวกับแถบในปฏิทิน */}
      {inMonth.length === 0 ? (
        <p className="zego-guide-list px-4 py-5 text-center text-sm zego-text-tertiary">ไม่มีงานในเดือนนี้</p>
      ) : (
        <ul className="zego-guide-list">
          {inMonth.map((job) => <JobRow key={job.assignment.assignmentId} job={job} />)}
        </ul>
      )}
    </div>
  );
}

/**
 * สถานะซองเงินของกรุ๊ป (มุมมองหัวหน้าทัวร์) — แสดงใต้สถานะงาน · กรุ๊ปที่ไม่มีเอกสารเบิกไม่แสดง
 * ใช้ถ้อยคำของหัวหน้าทัวร์: ซองที่ส่งมาถึงตัวเองและรอกดรับ = "รอคุณยืนยันรับ"
 */
function EnvelopeChip({ periodId }: { periodId: string }) {
  const { expenses, envelopes, noEnvelopeMarks, currentUser } = useDemo();
  const docs = expenses.filter((e) => isGroupAdvanceDoc(e) && e.jobId === periodId && e.status !== 'cancelled' && e.status !== 'rejected');
  if (docs.length === 0) return null;
  const envs = envelopes.filter((e) => e.periodId === periodId);
  const status = groupEnvelopeStatus(groupLines(docs), envs, noEnvelopeMarks.find((m) => m.periodId === periodId));
  const leaderId = ownLeaderScope(currentUser);
  const waitingMe = envs.filter((e) => leaderEnvelopeState(e, leaderId) === 'to_ack' || leaderEnvelopeState(e, leaderId) === 'in_transit').length;

  let label: string;
  let tone: EnvelopeTone;
  if (status.mismatch) { label = status.label === 'แจ้งไม่ได้รับซอง' ? 'แจ้งไม่ได้รับซอง' : 'แจ้งยอดไม่ตรง'; tone = 'red'; }
  else if (status.stage === 'none') { label = 'ไม่มีซองเงิน'; tone = 'slate'; }
  else if (status.stage === 'packing') { label = 'การเงินกำลังจัดซอง'; tone = 'slate'; }
  else if (status.stage === 'sealed') { label = 'จัดซองแล้ว รอส่งมอบ'; tone = 'blue'; }
  else if (waitingMe > 0) { label = `รอคุณยืนยันรับ ${waitingMe} ซอง`; tone = 'violet'; }
  else if (status.stage === 'handed_over') { label = status.label; tone = 'violet'; }
  else { label = 'รับซองแล้ว'; tone = 'green'; }
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-[11px] zego-text-tertiary">ซองเงิน</span>
      <span className={cx('zego-chip text-[11px]', ENVELOPE_CHIP[tone])}>{label}</span>
    </span>
  );
}

/** สีป้ายซองเงินตามธีม v3 — รอคุณ/ส่งมอบแล้ว = ทอง (สถานะรอ) · ปัญหา = แดง · จัดซองแล้ว = ฟ้า · รับแล้ว = เขียว */
const ENVELOPE_CHIP: Record<EnvelopeTone, string> = {
  slate: 'zego-chip--neutral',
  amber: 'zego-chip--gold',
  blue: 'zego-chip--blue',
  violet: 'zego-chip--gold',
  green: 'zego-chip--green',
  red: 'zego-chip--red',
};

const NEXT_STEP_STYLE: Record<NextStepTone, string> = {
  action: 'zego-chip--gold',
  waiting: 'zego-chip--blue',
  done: 'zego-chip--green',
  idle: 'zego-chip--neutral',
};

/**
 * ป้าย "ขั้นต่อไป" ของกรุ๊ป — บอกว่าต้องทำอะไรต่อโดยไม่ต้องเปิดดูทีละกรุ๊ป (jobNextStep)
 * ทอง = คุณต้องทำ · ฟ้า = รอฝั่งการเงิน · เขียว = เรียบร้อย · เทา = ยังไม่ถึงเวลา
 */
function NextStepChip({ period }: { period: TourPeriodMaster }) {
  const { currentUser, envelopes, expenses, appointments } = useDemo();
  const leaderId = ownLeaderScope(currentUser);
  const today = toISODate(new Date());
  const pid = period.internalId;
  const ended = tripEnded(period, today);
  const clearApt = appointments
    .filter((a) => a.leaderId === leaderId && a.kind === 'clear' && a.jobId === pid && a.status !== 'cancelled')
    .sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`))[0] ?? null;
  const step = jobNextStep({
    started: tripStarted(period, today),
    ended,
    closed: !!loadGroupClears()[pid]?.closedAt,
    envelopesToAck: envelopes.filter((e) => e.periodId === pid && (leaderEnvelopeState(e, leaderId) === 'to_ack' || leaderEnvelopeState(e, leaderId) === 'in_transit')).length,
    afterTrip: ended
      ? afterTripProgress({
        periodId: pid,
        receipts: expenses.filter((e) => e.jobId === pid && e.category === 'actual' && e.requesterId === leaderId && e.status !== 'cancelled'),
        perDiem: leaderId ? activeLeaderClaim(expenses, pid, leaderId, 'per_diem') : null,
        clearAppointment: clearApt,
        formatWhen: (a) => `${formatDate(a.date)} ${a.time} น.`,
      })
      : null,
  });
  return (
    <span className={cx('zego-chip max-w-full gap-1 text-[11px] font-semibold', NEXT_STEP_STYLE[step.tone])}>
      <Icon name={step.tone === 'done' ? 'check' : step.tone === 'action' ? 'chevronRight' : 'clock'} className="h-3 w-3 shrink-0" />
      <span className="truncate">{step.tone === 'action' ? `ต้องทำ: ${step.label}` : step.label}</span>
    </span>
  );
}
