'use client';

/**
 * ปฏิทินเดือนของหัวหน้าทัวร์ (§3) — รวมงานที่มอบหมาย + วันลา/ไม่พร้อม/ติดงานบริษัท
 *
 * หลักการอ่านง่าย ไม่ทับซ้อน (ตามสเปกปรับปรุงปฏิทิน):
 *   • แถบหลายวันต่อเนื่อง = แถบเดียว ขอบมนเฉพาะวันเริ่ม/สิ้นสุด (§5) ไม่ซ้ำชื่อทุกวัน
 *   • จัด lane ตามช่วงวัน–เวลา — รายการที่ทับกันอยู่คนละ lane (§6/§7)
 *   • แต่ละวันแสดงสูงสุด MAX_LANES แถว ที่เหลือ = ปุ่ม "+N รายการ" กดเปิดรายละเอียดทั้งวัน (§3)
 *   • ทุกช่องในสัปดาห์เดียวกันสูงเท่ากัน (§4) · Desktop/Tablet = ตาราง · Mobile = Agenda (§10)
 *   • คลิกวัน/แถบ/ปุ่ม +N → Modal รายละเอียด (fixed overlay ไม่ถูก container ตัด §11)
 *
 * ตรวจความพร้อมจริงทำที่ service (leaderUnavailability/checkProgramAvailability) — ที่นี่แสดงผลอย่างเดียว
 */

import { useMemo, useState } from 'react';
import { addDays, diffDays, formatDate, formatDateRange, formatDateTime, parseDate, toISODate } from '@/lib/format';
import { Button, cx, StatusBadge } from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';
import { formatRecordSchedule, recordTypeLabel } from '@/lib/logic/availabilityStatus';
import { SCHEDULE_STATUS, scheduleStatus } from '@/lib/logic/scheduling';
import { BOARD_STATUS, BOARD_STATUS_ORDER, boardStatus, boardStatusMeta } from '@/lib/logic/guideBoard';
import type { LeaderAvailabilityRecord, TourJob } from '@/types';

const THAI_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const THAI_DOW = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

type EventKind = 'job' | 'leave' | 'company' | 'unavailable';

interface CalEvent {
  id: string;
  kind: EventKind;
  startDate: string;
  endDate: string;
  /** ทั้งวันหรือระบุช่วงเวลา (§7) */
  isAllDay: boolean;
  startTime?: string; // HH:mm
  endTime?: string;
  /** ชื่อย่อบนแถบ เช่น Tour Code หรือประเภทการลา */
  code?: string;
  /** ชื่อเต็ม/ประเภท */
  label: string;
  reason?: string;
  /** ข้อความช่วงเวลาแบบเต็มสำหรับรายละเอียด */
  scheduleText: string;
  job?: TourJob;
}

/**
 * สีของ "ความพร้อมรับงาน" (วันลา/ติดงานบริษัท/ไม่พร้อมรับงาน) — คนละชุดกับสถานะการจัด
 * ช่อง job ที่นี่ใช้เฉพาะ legend เท่านั้น · สีจริงของงานมาจาก BOARD_STATUS (ดู jobStyle)
 */
const KIND_STYLE: Record<EventKind, { chip: string; dot: string; legend: string }> = {
  job: { chip: 'zego-status-bar zego-status-bar--slate', dot: 'zego-dot--slate', legend: 'งานทัวร์ที่มอบหมาย' },
  leave: { chip: 'zego-status-bar zego-status-bar--warning', dot: 'zego-dot--warning', legend: 'วันลา' },
  company: { chip: 'zego-status-bar zego-status-bar--orange', dot: 'zego-dot--orange', legend: 'ติดงานบริษัท' },
  unavailable: { chip: 'zego-status-bar zego-status-bar--slate', dot: 'zego-dot--slate', legend: 'ไม่พร้อมรับงาน' },
};

/**
 * §10 สีของงานทัวร์ = "สถานะการจัดหัวหน้าทัวร์" จาก Mapping กลางชุดเดียวกับหน้า Schedule
 * เพื่อไม่ให้สถานะเดียวกันเป็นคนละสีคนละหน้า · งานที่ไม่ใช่ job ใช้สีความพร้อมตามเดิม
 */
function eventStyle(e: CalEvent): { chip: string; dot: string; legend: string } {
  if (e.kind !== 'job') return KIND_STYLE[e.kind];
  const meta = boardStatusMeta(e.job ? boardStatus(e.job) : undefined);
  return { chip: meta.bar, dot: meta.dot, legend: `งานทัวร์ · ${meta.label}` };
}

const RECORD_KIND: Record<string, EventKind> = {
  sick_leave: 'leave',
  personal_leave: 'leave',
  company_work: 'company',
  unavailable: 'unavailable',
};

/** ป้ายบนแถบ (§2/§8): ระบุช่วงเวลาในวันเดียว → "08:00–12:00 ลากิจ" · หลายวัน/ทั้งวัน → code + ชื่อ */
function barLabel(e: CalEvent): string {
  if (!e.isAllDay && e.startDate === e.endDate && e.startTime) {
    return `${e.startTime}–${e.endTime ?? ''} ${e.label}`.trim();
  }
  return e.code ? `${e.code} ${e.label}` : e.label;
}

/** Tooltip เต็มบรรทัดเดียว (ตัวช่วยเร็ว — รายละเอียดครบดูใน Modal) */
/** §9 Tooltip — งานทัวร์แสดงสถานะการจัดด้วย label จาก Mapping ชุดเดียวกับสี */
function barTooltip(e: CalEvent): string {
  return [
    e.code ? `${e.code} · ${e.label}` : e.label,
    e.scheduleText,
    e.kind === 'job' ? `สถานะการจัด: ${boardStatusMeta(e.job ? boardStatus(e.job) : undefined).label}` : '',
    e.reason ? `หมายเหตุ: ${e.reason}` : '',
  ].filter(Boolean).join('\n');
}

/**
 * จัด lane ให้แต่ละ event (§6) — ช่วงที่ซ้อนกันต้องอยู่คนละแถว
 * ต่อเนื่องข้ามสัปดาห์ = lane เดียวตลอดช่วง · วันเดียวกันคนละเวลาก็แยก lane (ทับกันในระดับวัน)
 */
function assignLanes(events: CalEvent[]): Map<string, number> {
  const sorted = [...events].sort(
    (a, b) =>
      a.startDate.localeCompare(b.startDate) ||
      (a.startTime ?? '').localeCompare(b.startTime ?? '') ||
      b.endDate.localeCompare(a.endDate),
  );
  const laneEnd: string[] = [];
  const map = new Map<string, number>();
  for (const e of sorted) {
    let lane = 0;
    while (lane < laneEnd.length && laneEnd[lane] >= e.startDate) lane += 1;
    laneEnd[lane] = e.endDate;
    map.set(e.id, lane);
  }
  return map;
}

function covers(e: CalEvent, iso: string): boolean {
  return e.startDate <= iso && e.endDate >= iso;
}

/** เรียงรายการในหนึ่งวัน: ทั้งวัน/หลายวันก่อน แล้วตามเวลาเริ่ม (§8) */
function sortForDay(a: CalEvent, b: CalEvent): number {
  const am = a.isAllDay || a.startDate !== a.endDate;
  const bm = b.isAllDay || b.startDate !== b.endDate;
  if (am !== bm) return am ? -1 : 1;
  return (a.startTime ?? '').localeCompare(b.startTime ?? '');
}

export function LeaderScheduleCalendar({
  leaderId,
  jobs,
  records,
  today,
  cursor,
  onCursorChange,
  onSelectJob,
}: {
  leaderId: string;
  jobs: TourJob[];
  records: LeaderAvailabilityRecord[];
  today: string;
  /** เดือนที่กำลังดู (ISO) — ควบคุมจากภายนอกเพื่อซิงก์กับแผงซ้าย */
  cursor: string;
  onCursorChange: (iso: string) => void;
  onSelectJob?: (job: TourJob) => void;
}) {
  const [dayModal, setDayModal] = useState<string | null>(null); // วันที่เปิดดูรายละเอียดทั้งวัน

  const events = useMemo<CalEvent[]>(() => {
    const jobEvents: CalEvent[] = jobs
      .filter((j) => j.leaderId === leaderId && j.status !== 'draft')
      .map((j) => ({
        id: `J-${j.id}`,
        kind: 'job',
        startDate: j.departDate,
        endDate: j.returnDate,
        isAllDay: true,
        code: j.id,
        label: j.title,
        scheduleText: formatDateRange(j.departDate, j.returnDate),
        job: j,
      }));
    const recEvents: CalEvent[] = records
      .filter((r) => r.leaderId === leaderId && r.approval === 'approved' && r.blocksAssignment !== false)
      .map((r) => ({
        id: `R-${r.id}`,
        kind: RECORD_KIND[r.type] ?? 'unavailable',
        startDate: r.startDate,
        endDate: r.endDate,
        isAllDay: r.isAllDay,
        startTime: r.isAllDay ? undefined : r.startTime,
        endTime: r.isAllDay ? undefined : r.endTime,
        label: recordTypeLabel(r),
        reason: r.reason,
        scheduleText: formatRecordSchedule(r),
      }));
    return [...jobEvents, ...recEvents];
  }, [jobs, records, leaderId]);

  const first = useMemo(() => {
    const d = parseDate(cursor);
    d.setDate(1);
    return toISODate(d);
  }, [cursor]);
  const monthIndex = parseDate(cursor).getMonth();
  const monthLabel = `${THAI_MONTHS[monthIndex]} ${parseDate(cursor).getFullYear() + 543}`;
  const gridStart = startOfWeek(first);
  const weeks = useMemo(
    () => Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, i) => addDays(gridStart, w * 7 + i))),
    [gridStart],
  );
  const laneMap = useMemo(() => assignLanes(events), [events]);

  const step = (dir: -1 | 1) => {
    const d = parseDate(cursor);
    d.setMonth(d.getMonth() + dir);
    onCursorChange(toISODate(d));
  };

  const dayEvents = (iso: string) => events.filter((e) => covers(e, iso)).sort(sortForDay);

  // §1/§4/§7 ค่าคงที่การจัดวาง — Date Header แยกจาก Event Area (แถบไม่มีทางทับเลขวันที่)
  const HEADER_H = 28; // §1 แถบเลขวันที่ด้านบน
  const EVENT_H = 24; // §7 ความสูงมาตรฐานของ event
  const EVENT_GAP = 3; // §4 ระยะห่างระหว่าง lane
  const TOP_PAD = 3; // ระยะจากขอบบน Event Area ถึงแถบแรก
  const BOTTOM_PAD = 6; // §4 ระยะด้านล่าง
  const OVERFLOW_H = 20; // §5 แถว "+N รายการ"
  const MIN_AREA = 72; // ความสูงขั้นต่ำของ Event Area (สัปดาห์ที่ว่างก็ยังเป็นช่องปฏิทิน)
  const MAX_LANES = 3; // §5 แสดงสูงสุด 3 lane ที่เหลือสรุปเป็น +N
  const laneTop = (lane: number) => TOP_PAD + lane * (EVENT_H + EVENT_GAP);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* §2/§3 หัวปฏิทินแบบกระชับ — เป็นเพียงหัวข้อแสดงผลของเดือนจัดสเก็ต (ไม่ใช่ Month Picker ชุดที่สอง)
            ลูกศรอัปเดต selectedScheduleMonth กลาง → แผงซ้าย/ขวาเปลี่ยนตามพร้อมกัน */}
        <div className="inline-flex items-center gap-0.5">
          <button type="button" onClick={() => step(-1)} aria-label="เดือนก่อนหน้า" className="zego-icon-btn zego-hover-surface rounded-md p-1">
            <Icon name="chevronLeft" className="h-3.5 w-3.5" />
          </button>
          <span className="min-w-[7rem] text-center text-xs font-medium zego-text-secondary">{monthLabel}</span>
          <button type="button" onClick={() => step(1)} aria-label="เดือนถัดไป" className="zego-icon-btn zego-hover-surface rounded-md p-1">
            <Icon name="chevronRight" className="h-3.5 w-3.5" />
          </button>
          <Button variant="ghost" size="sm" onClick={() => onCursorChange(today)}>เดือนปัจจุบัน</Button>
        </div>
        {/*
          Legend สี (§3) — ไม่สื่อด้วยสีอย่างเดียว มีข้อความกำกับ
          งานทัวร์ระบายสีตามสถานะการจัด จึงต้องแจกแจงทั้ง 5 สถานะ (สีเดียวจะไม่ตรงกับที่แสดงจริง)
          ชุดสีความพร้อม (วันลา/ติดงานบริษัท/ไม่พร้อมรับงาน) แยกออกจากกันชัดเจน
        */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] zego-text-tertiary">
          {/* ไม่แสดง “ปฏิเสธ” — สถานะนี้ไม่เกิดในขั้นตอนปัจจุบัน (จัดแล้วคอนเฟิร์มทันที) */}
          {BOARD_STATUS_ORDER.filter((s) => s !== 'DECLINED').map((s) => (
            <span key={s} className="inline-flex items-center gap-1">
              <span className={cx('h-2.5 w-2.5 rounded-sm', BOARD_STATUS[s].dot)} />
              {BOARD_STATUS[s].label}
            </span>
          ))}
          <span className="mx-0.5 h-3.5 w-px border-l zego-border-color" />
          {(['leave', 'company', 'unavailable'] as EventKind[]).map((k) => (
            <span key={k} className="inline-flex items-center gap-1">
              <span className={cx('h-2.5 w-2.5 rounded-sm', KIND_STYLE[k].dot)} />
              {KIND_STYLE[k].legend}
            </span>
          ))}
        </div>
      </div>

      {/* ---------- Desktop / Tablet: ตารางเดือน (§10) ---------- */}
      <div data-testid="cal-grid" className="hidden overflow-hidden rounded-xl border zego-border-color md:block">
        <div className="grid grid-cols-7 zego-divider-bottom zego-surface-soft-bg text-center text-xs font-medium zego-text-tertiary">
          {THAI_DOW.map((d) => (
            <div key={d} className="py-1.5">{d}</div>
          ))}
        </div>

        {weeks.map((week) => {
          const weekStart = week[0];
          const weekEnd = week[6];
          // §3/§6 ตัด event เป็น Segment ต่อสัปดาห์ (ยังเป็น event เดียวกัน · lane เดิมทั้งช่วง)
          const segments = events
            .filter((e) => e.startDate <= weekEnd && e.endDate >= weekStart)
            .map((e) => {
              const segStart = e.startDate > weekStart ? e.startDate : weekStart;
              const segEnd = e.endDate < weekEnd ? e.endDate : weekEnd;
              return {
                e,
                lane: laneMap.get(e.id) ?? 0,
                startCol: diffDays(weekStart, segStart),
                span: diffDays(segStart, segEnd) + 1,
                leftRound: e.startDate >= weekStart, // ต้นรายการอยู่ในสัปดาห์นี้ → มนซ้าย
                rightRound: e.endDate <= weekEnd, // ปลายรายการอยู่ในสัปดาห์นี้ → มนขวา
              };
            });
          const visible = segments.filter((s) => s.lane < MAX_LANES);
          const usedLanes = Math.min(MAX_LANES, segments.reduce((m, s) => Math.max(m, s.lane + 1), 0));
          const overflowByCol = week.map((iso) => segments.filter((s) => s.lane >= MAX_LANES && s.e.startDate <= iso && s.e.endDate >= iso).length);
          const hasOverflow = overflowByCol.some((n) => n > 0);
          const overflowTop = laneTop(usedLanes);
          // §4 rowHeight = header + (lane × H + gap) + แถว +N + padding — คำนวณจาก lane ที่ใช้จริง
          const eventAreaH = Math.max(
            MIN_AREA,
            overflowTop + (hasOverflow ? OVERFLOW_H : -EVENT_GAP) + BOTTOM_PAD,
          );

          return (
            <div key={weekStart} className="zego-divider-bottom last:border-b-0">
              {/* §1 Date Header — เลขวันที่อยู่แถวบนสุด แยกจากพื้นที่ event โดยสิ้นเชิง */}
              <div className="grid grid-cols-7" style={{ height: HEADER_H }}>
                {week.map((iso) => {
                  const d = parseDate(iso);
                  const isCurMonth = d.getMonth() === monthIndex;
                  const hasAny = events.some((e) => covers(e, iso));
                  return (
                    <button
                      key={iso}
                      type="button"
                      onClick={() => hasAny && setDayModal(iso)}
                      className={cx(
                        'flex items-center border-r zego-border-color px-1.5 last:border-r-0',
                        !isCurMonth && 'zego-surface-soft-bg',
                        hasAny ? 'cursor-pointer zego-hover-surface' : 'cursor-default',
                      )}
                    >
                      <span className={cx('inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs', iso === today ? 'zego-today-badge font-semibold' : isCurMonth ? 'zego-text-secondary' : 'zego-text-disabled')}>
                        {d.getDate()}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* §1 Event Area — พื้นที่แถบ event แยกต่างหาก (แถบวางได้เต็มที่ ไม่ชนเลขวันที่) */}
              <div className="relative" style={{ height: eventAreaH }}>
                {/* พื้นหลัง 7 คอลัมน์ (เส้นแบ่งวัน + คลิกเปิดรายละเอียดทั้งวัน) */}
                <div className="absolute inset-0 grid grid-cols-7">
                  {week.map((iso) => {
                    const isCurMonth = parseDate(iso).getMonth() === monthIndex;
                    const hasAny = events.some((e) => covers(e, iso));
                    return (
                      <button
                        key={iso}
                        type="button"
                        aria-label={`ดูรายการวันที่ ${formatDate(iso)}`}
                        onClick={() => hasAny && setDayModal(iso)}
                        className={cx('border-r zego-border-color last:border-r-0', !isCurMonth && 'zego-surface-soft-bg', hasAny ? 'cursor-pointer zego-hover-surface' : 'cursor-default')}
                      />
                    );
                  })}
                </div>

                {/* §3/§8 แถบ event หลายวันต่อเนื่อง — top จาก lane · left/width จากคอลัมน์ */}
                {visible.map((s) => {
                  const style = eventStyle(s.e);
                  return (
                    <button
                      key={`${s.e.id}-${weekStart}`}
                      type="button"
                      data-testid="cal-bar"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        if (s.e.kind === 'job' && onSelectJob) onSelectJob(s.e.job!);
                        else setDayModal(s.e.startDate > weekStart ? s.e.startDate : weekStart);
                      }}
                      title={barTooltip(s.e)}
                      style={{ left: `calc(${(s.startCol / 7) * 100}% + 3px)`, width: `calc(${(s.span / 7) * 100}% - 6px)`, top: laneTop(s.lane), height: EVENT_H }}
                      className={cx(
                        'absolute flex items-center overflow-hidden rounded-md text-left text-[11px] font-medium leading-5 ring-1 ring-inset transition hover:brightness-95',
                        style.chip,
                        s.leftRound ? 'rounded-l-md' : 'rounded-l-none',
                        s.rightRound ? 'rounded-r-md' : 'rounded-r-none',
                      )}
                    >
                      {!s.leftRound && <span className="pl-1 opacity-60">◂</span>}
                      <span className="min-w-0 truncate px-2">{barLabel(s.e)}</span>
                      {!s.rightRound && <span className="pr-1 opacity-60">▸</span>}
                    </button>
                  );
                })}

                {/* §5 ปุ่ม "+N รายการ" — วางตามคอลัมน์จริง ใต้ lane สุดท้าย ไม่ทับแถบ/วันข้างเคียง */}
                {week.map((iso, col) =>
                  overflowByCol[col] > 0 ? (
                    <button
                      key={`ov-${iso}`}
                      type="button"
                      data-testid="cal-overflow"
                      onClick={() => setDayModal(iso)}
                      style={{ left: `calc(${(col / 7) * 100}% + 3px)`, width: `calc(${(1 / 7) * 100}% - 6px)`, top: overflowTop, height: OVERFLOW_H }}
                      className="absolute flex items-center rounded-md px-1.5 text-[11px] font-medium zego-icon-btn zego-hover-surface"
                    >
                      +{overflowByCol[col]} รายการ
                    </button>
                  ) : null,
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ---------- Mobile: Agenda List เป็นค่าเริ่มต้น (§10) ---------- */}
      <AgendaList
        events={events}
        monthIndex={monthIndex}
        year={parseDate(cursor).getFullYear()}
        today={today}
        onOpenDay={setDayModal}
      />

      {/* ---------- รายละเอียดทั้งวัน (§11) — Modal fixed ไม่ถูก container ตัด ---------- */}
      <Modal
        open={dayModal !== null}
        onClose={() => setDayModal(null)}
        size="sm"
        title={dayModal ? `รายการวันที่ ${formatDate(dayModal)}` : ''}
        description={dayModal ? dayHeading(dayModal) : undefined}
      >
        {dayModal && (
          <ul className="space-y-2">
            {dayEvents(dayModal).map((e) => (
              <EventDetailRow
                key={e.id}
                e={e}
                onEditJob={
                  e.kind === 'job' && onSelectJob
                    ? () => {
                        onSelectJob(e.job!);
                        setDayModal(null);
                      }
                    : undefined
                }
              />
            ))}
            {dayEvents(dayModal).length === 0 && <li className="py-6 text-center text-sm zego-text-tertiary">ไม่มีรายการในวันนี้</li>}
          </ul>
        )}
      </Modal>
    </div>
  );
}

/* ------------------------------- รายละเอียด 1 รายการ ------------------------------- */

function EventDetailRow({ e, onEditJob }: { e: CalEvent; onEditJob?: () => void }) {
  const style = eventStyle(e);
  const timeText = e.isAllDay || e.startDate !== e.endDate
    ? e.scheduleText
    : e.startTime
      ? `${formatDate(e.startDate)} ${e.startTime}–${e.endTime ?? ''}`
      : e.scheduleText;
  return (
    <li className="rounded-xl border zego-border-color p-3">
      <div className="flex items-start gap-2">
        <span className={cx('mt-1 h-2.5 w-2.5 shrink-0 rounded-sm', style.dot)} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[11px] font-medium zego-text-tertiary">{style.legend}</span>
            {e.job && <StatusBadge meta={SCHEDULE_STATUS[scheduleStatus(e.job)]} size="sm" />}
          </div>
          <p className="mt-0.5 font-medium zego-text">{e.code ? `${e.code} · ${e.label}` : e.label}</p>
          <p className="text-xs zego-text-tertiary">{timeText}</p>
          {e.job && (
            <p className="mt-0.5 text-xs zego-text-tertiary">
              {e.job.country}{e.job.route ? ` · ${e.job.route}` : ''}
              {e.job.meetingDateTime ? ` · รายงานตัว ${formatDateTime(e.job.meetingDateTime)}` : ''}
            </p>
          )}
          {e.reason && <p className="mt-0.5 text-xs zego-text-tertiary">หมายเหตุ: {e.reason}</p>}
          {onEditJob && (
            <button type="button" onClick={onEditJob} className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium zego-text-info hover:underline">
              <Icon name="edit" className="h-3 w-3" /> ดูรายละเอียด/แก้ไข
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

/* ------------------------------- Agenda (Mobile) ------------------------------- */

function AgendaList({
  events,
  monthIndex,
  year,
  today,
  onOpenDay,
}: {
  events: CalEvent[];
  monthIndex: number;
  year: number;
  today: string;
  onOpenDay: (iso: string) => void;
}) {
  // จัดกลุ่มรายการตามวัน ภายในเดือนที่ดู (ไม่บีบตาราง 7 วันบนจอเล็ก §10/§12)
  const groups = useMemo(() => {
    const monthPrefix = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
    const days = Array.from({ length: 31 }, (_, i) => `${monthPrefix}-${String(i + 1).padStart(2, '0')}`).filter(
      (iso) => parseDate(iso).getMonth() === monthIndex,
    );
    return days
      .map((iso) => ({ iso, items: events.filter((e) => covers(e, iso)).sort(sortForDay) }))
      .filter((g) => g.items.length > 0);
  }, [events, monthIndex, year]);

  return (
    <div data-testid="cal-agenda" className="space-y-2 md:hidden">
      {groups.length === 0 ? (
        <p className="rounded-xl border border-dashed zego-border-color py-8 text-center text-sm zego-text-tertiary">ไม่มีรายการในเดือนนี้</p>
      ) : (
        groups.map((g) => (
          <button
            key={g.iso}
            type="button"
            onClick={() => onOpenDay(g.iso)}
            className={cx('flex w-full items-start gap-3 rounded-xl border p-3 text-left', g.iso === today ? 'zego-today-border zego-today-tint' : 'zego-border-color')}
          >
            <div className="w-14 shrink-0">
              <p className="text-xs zego-text-tertiary">{THAI_DOW[parseDate(g.iso).getDay()]}</p>
              <p className="text-sm font-semibold zego-text">{formatDate(g.iso)}</p>
            </div>
            <ul className="min-w-0 flex-1 space-y-1">
              {g.items.map((e) => (
                <li key={e.id} className={cx('flex items-center gap-1.5 truncate rounded px-2 py-1 text-xs font-medium ring-1 ring-inset', eventStyle(e).chip)}>
                  <span className="truncate">{barLabel(e)}</span>
                </li>
              ))}
            </ul>
          </button>
        ))
      )}
    </div>
  );
}

function startOfWeek(iso: string): string {
  const d = parseDate(iso);
  return addDays(iso, -d.getDay());
}

function dayHeading(iso: string): string {
  const d = parseDate(iso);
  return `${THAI_DOW[d.getDay()]} · ${THAI_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`;
}
