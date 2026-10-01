'use client';

/**
 * ปฏิทินวันลา/ช่วงไม่พร้อมของหัวหน้าทัวร์ — มุมมองเดือน / สัปดาห์ / วัน
 *   • คลิกวันที่ว่าง → เพิ่มรายการ (ทั้งวัน)
 *   • ลากครอบหลายวัน (มุมมองเดือน) → เพิ่มช่วง
 *   • คลิกชิปรายการเดิม → แก้ไข/ลบ
 * ใช้ข้อมูลชุดเดียวกับทั้งระบบ (ไม่คัดลอกแยก)
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { addDays, diffDays, parseDate, toISODate } from '@/lib/format';
import { AVAILABILITY_TYPE, formatRecordSchedule, recordTypeLabel } from '@/lib/logic/availabilityStatus';
import { Button, cx } from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icon';
import { TONE_ZEGO_BADGE } from '@/lib/tone-tokens';
import type { LeaderAvailabilityRecord } from '@/types';

type CalView = 'month' | 'week' | 'day';

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];
const THAI_DOW = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

function chipClass(r: LeaderAvailabilityRecord): string {
  return TONE_ZEGO_BADGE[AVAILABILITY_TYPE[r.type].tone] ?? TONE_ZEGO_BADGE.slate;
}
function coversDay(r: LeaderAvailabilityRecord, iso: string): boolean {
  return r.startDate <= iso && r.endDate >= iso && r.approval !== 'cancelled' && r.approval !== 'rejected';
}

/** ป้ายบนแถบ (§4): ระบุเวลาวันเดียว → "09:00–12:00 ลากิจ" · อื่น ๆ → ชื่อประเภท */
function barLabel(r: LeaderAvailabilityRecord): string {
  const t = recordTypeLabel(r);
  if (!r.isAllDay && r.startDate === r.endDate) return `${r.startTime}–${r.endTime} ${t}`;
  return t;
}
/** Tooltip เดียวทั้งช่วง (§7) */
function barTooltip(r: LeaderAvailabilityRecord): string {
  const lines = [recordTypeLabel(r), formatRecordSchedule(r)];
  if (r.reason) lines.push(`เหตุผล: ${r.reason}`);
  return lines.join('\n');
}

/**
 * จัด "lane" ให้แต่ละรายการ (§9) — รายการที่ช่วงวันซ้อนกันต้องอยู่คนละแถว
 * รายการเดียวได้ lane เดียวตลอดช่วง (ต่อเนื่องข้ามสัปดาห์อยู่แถวเดิม)
 */
export function assignLanes(records: LeaderAvailabilityRecord[]): Map<string, number> {
  const sorted = [...records].sort(
    (a, b) => a.startDate.localeCompare(b.startDate) || b.endDate.localeCompare(a.endDate),
  );
  const laneEnd: string[] = []; // วันสิ้นสุดล่าสุดที่ครอบครองในแต่ละ lane
  const map = new Map<string, number>();
  for (const r of sorted) {
    let lane = 0;
    while (lane < laneEnd.length && laneEnd[lane] >= r.startDate) lane += 1;
    laneEnd[lane] = r.endDate;
    map.set(r.id, lane);
  }
  return map;
}
function ymLabel(iso: string): string {
  const d = parseDate(iso);
  return `${THAI_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`;
}
function dayLabel(iso: string): string {
  const d = parseDate(iso);
  return `${THAI_DOW[d.getDay()]} ${d.getDate()} ${THAI_MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear() + 543}`;
}
function startOfWeek(iso: string): string {
  const d = parseDate(iso);
  return addDays(iso, -d.getDay());
}

export function AvailabilityCalendar({
  records,
  today,
  onAddRange,
  onEditRecord,
}: {
  records: LeaderAvailabilityRecord[];
  today: string;
  onAddRange: (start: string, end: string) => void;
  onEditRecord: (r: LeaderAvailabilityRecord) => void;
}) {
  const [view, setView] = useState<CalView>('month');
  const [cursor, setCursor] = useState(today);

  const step = (dir: -1 | 1) => {
    if (view === 'month') {
      const d = parseDate(cursor);
      d.setMonth(d.getMonth() + dir);
      setCursor(toISODate(d));
    } else if (view === 'week') setCursor(addDays(cursor, dir * 7));
    else setCursor(addDays(cursor, dir));
  };

  const header =
    view === 'month' ? ymLabel(cursor) : view === 'week' ? `สัปดาห์ของ ${dayLabel(startOfWeek(cursor))}` : dayLabel(cursor);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex items-center gap-1">
          <button type="button" onClick={() => step(-1)} aria-label="ก่อนหน้า" className="rounded-lg p-1.5 zego-text-tertiary zego-hover-surface">
            <Icon name="chevronLeft" className="h-4 w-4" />
          </button>
          <span className="min-w-[10rem] text-center text-sm font-semibold zego-text">{header}</span>
          <button type="button" onClick={() => step(1)} aria-label="ถัดไป" className="rounded-lg p-1.5 zego-text-tertiary zego-hover-surface">
            <Icon name="chevronRight" className="h-4 w-4" />
          </button>
          <Button variant="ghost" size="sm" onClick={() => setCursor(today)}>
            วันนี้
          </Button>
        </div>
        <div role="group" aria-label="มุมมองปฏิทิน" className="inline-flex rounded-lg border zego-border-color zego-surface-bg p-0.5">
          {(['month', 'week', 'day'] as CalView[]).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={cx(
                'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                view === v ? 'zego-badge--info' : 'zego-text-secondary zego-hover-surface',
              )}
            >
              {v === 'month' ? 'เดือน' : v === 'week' ? 'สัปดาห์' : 'วัน'}
            </button>
          ))}
        </div>
      </div>

      {view === 'month' && (
        <MonthGrid
          cursor={cursor}
          today={today}
          records={records}
          onAddRange={onAddRange}
          onEditRecord={onEditRecord}
          onShowDay={(iso) => {
            setCursor(iso);
            setView('day');
          }}
        />
      )}
      {view === 'week' && (
        <WeekView cursor={cursor} today={today} records={records} onAddRange={onAddRange} onEditRecord={onEditRecord} />
      )}
      {view === 'day' && (
        <DayView cursor={cursor} records={records} onAddRange={onAddRange} onEditRecord={onEditRecord} />
      )}

      <p className="text-xs zego-text-tertiary">
        คลิกวันเพื่อเพิ่มรายการ · ลากครอบหลายวัน (มุมมองเดือน) เพื่อกำหนดช่วง · คลิกชิปเพื่อแก้ไข/ลบ
      </p>
    </div>
  );
}

/* ------------------------------- มุมมองเดือน ------------------------------- */

function MonthGrid({
  cursor,
  today,
  records,
  onAddRange,
  onEditRecord,
  onShowDay,
}: {
  cursor: string;
  today: string;
  records: LeaderAvailabilityRecord[];
  onAddRange: (s: string, e: string) => void;
  onEditRecord: (r: LeaderAvailabilityRecord) => void;
  /** กด "+N รายการ" → เปิดมุมมองวันเพื่อดูรายการทั้งหมด (§3) */
  onShowDay: (iso: string) => void;
}) {
  const first = useMemo(() => {
    const d = parseDate(cursor);
    d.setDate(1);
    return toISODate(d);
  }, [cursor]);
  const monthIndex = parseDate(cursor).getMonth();
  const gridStart = startOfWeek(first);
  // 6 สัปดาห์ × 7 วัน
  const weeks = useMemo(
    () => Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, i) => addDays(gridStart, w * 7 + i))),
    [gridStart],
  );
  const laneMap = useMemo(() => assignLanes(records), [records]);

  const [anchor, setAnchor] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const anchorRef = useRef<string | null>(null);

  useEffect(() => {
    if (!anchor) return;
    const onUp = () => {
      const a = anchorRef.current;
      const h = hover ?? a;
      if (a) {
        const [s, e] = a <= (h as string) ? [a, h as string] : [h as string, a];
        onAddRange(s, e);
      }
      setAnchor(null);
      setHover(null);
      anchorRef.current = null;
    };
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
  }, [anchor, hover, onAddRange]);

  const inDragRange = (iso: string) => {
    if (!anchor || !hover) return false;
    const [s, e] = anchor <= hover ? [anchor, hover] : [hover, anchor];
    return iso >= s && iso <= e;
  };

  // §9 ค่าคงที่การจัดวางแถบ — Date Header แยกจาก Event Area (แถบไม่ทับเลขวันที่)
  const HEADER_H = 26;
  const EVENT_H = 22;
  const EVENT_GAP = 3;
  const TOP_PAD = 3;
  const BOTTOM_PAD = 6;
  const OVERFLOW_H = 18;
  const MIN_AREA = 70;
  const MAX_LANES = 3;
  const laneTop = (lane: number) => TOP_PAD + lane * (EVENT_H + EVENT_GAP);
  const beginDrag = (iso: string) => {
    setAnchor(iso);
    setHover(iso);
    anchorRef.current = iso;
  };

  return (
    <div className="overflow-hidden rounded-xl border zego-border-color">
      <div className="grid grid-cols-7 border-b zego-border-color zego-surface-soft-bg text-center text-xs font-medium zego-text-tertiary">
        {THAI_DOW.map((d) => (
          <div key={d} className="py-2">{d}</div>
        ))}
      </div>

      {weeks.map((week) => {
        const weekStart = week[0];
        const weekEnd = week[6];
        // รายการที่คาบสัปดาห์นี้ → segment (§9)
        const segments = records
          .filter((r) => coversDay(r, weekStart) || coversDay(r, weekEnd) || (r.startDate >= weekStart && r.startDate <= weekEnd))
          .filter((r) => r.startDate <= weekEnd && r.endDate >= weekStart && r.approval !== 'cancelled' && r.approval !== 'rejected')
          .map((r) => {
            const segStart = r.startDate > weekStart ? r.startDate : weekStart;
            const segEnd = r.endDate < weekEnd ? r.endDate : weekEnd;
            return {
              r,
              lane: laneMap.get(r.id) ?? 0,
              startCol: diffDays(weekStart, segStart),
              span: diffDays(segStart, segEnd) + 1,
              leftRound: r.startDate >= weekStart, // ต้นรายการอยู่ในสัปดาห์นี้
              rightRound: r.endDate <= weekEnd, // ปลายรายการอยู่ในสัปดาห์นี้
            };
          });
        const visible = segments.filter((s) => s.lane < MAX_LANES);
        const usedLanes = Math.min(MAX_LANES, segments.reduce((m, s) => Math.max(m, s.lane + 1), 0));
        // นับรายการที่เกิน MAX_LANES ต่อวัน → "+N รายการ"
        const overflowByCol = week.map(
          (iso) => segments.filter((s) => s.lane >= MAX_LANES && coversDay(s.r, iso)).length,
        );
        const hasOverflow = overflowByCol.some((n) => n > 0);
        const overflowTop = laneTop(usedLanes);
        const eventAreaH = Math.max(MIN_AREA, overflowTop + (hasOverflow ? OVERFLOW_H : -EVENT_GAP) + BOTTOM_PAD);

        return (
          <div key={weekStart} className="border-b zego-border-color last:border-b-0">
            {/* §1 Date Header — เลขวันที่อยู่แถวบน แยกจากพื้นที่ event */}
            <div className="grid grid-cols-7" style={{ height: HEADER_H }}>
              {week.map((iso) => {
                const d = parseDate(iso);
                const isCurMonth = d.getMonth() === monthIndex;
                return (
                  <div
                    key={iso}
                    onMouseDown={() => beginDrag(iso)}
                    onMouseEnter={() => anchor && setHover(iso)}
                    className={cx(
                      'flex cursor-pointer items-center border-r zego-border-color px-1.5 transition-colors last:border-r-0',
                      !isCurMonth && 'zego-surface-soft-bg',
                      inDragRange(iso) ? 'zego-today-tint' : 'zego-hover-surface',
                    )}
                  >
                    <span className={cx('inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs', iso === today ? 'zego-today-badge font-semibold' : isCurMonth ? 'zego-text-secondary' : 'zego-text-disabled')}>
                      {d.getDate()}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* §1 Event Area — พื้นที่แถบ event แยกต่างหาก */}
            <div className="relative" style={{ height: eventAreaH }}>
              {/* พื้นหลัง 7 คอลัมน์ (เส้นแบ่งวัน + คลิก/ลากเลือกช่วง) */}
              <div className="absolute inset-0 grid grid-cols-7">
                {week.map((iso) => {
                  const isCurMonth = parseDate(iso).getMonth() === monthIndex;
                  return (
                    <div
                      key={iso}
                      onMouseDown={() => beginDrag(iso)}
                      onMouseEnter={() => anchor && setHover(iso)}
                      className={cx(
                        'cursor-pointer border-r zego-border-color transition-colors last:border-r-0',
                        !isCurMonth && 'zego-surface-soft-bg',
                        inDragRange(iso) ? 'zego-today-tint' : 'zego-hover-surface',
                      )}
                    />
                  );
                })}
              </div>

              {/* ชั้นแถบ event (span หลายวันต่อเนื่อง) */}
              {visible.map((s) => (
                <button
                  key={`${s.r.id}-${weekStart}`}
                  type="button"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditRecord(s.r);
                  }}
                  title={barTooltip(s.r)}
                  style={{
                    left: `calc(${(s.startCol / 7) * 100}% + 3px)`,
                    width: `calc(${(s.span / 7) * 100}% - 6px)`,
                    top: laneTop(s.lane),
                    height: EVENT_H,
                  }}
                  className={cx(
                    'absolute flex items-center overflow-hidden rounded-md border text-left text-[11px] font-medium leading-4',
                    chipClass(s.r),
                    s.leftRound ? 'rounded-l-md' : 'rounded-l-none',
                    s.rightRound ? 'rounded-r-md' : 'rounded-r-none',
                    s.r.approval === 'pending' && 'opacity-70',
                  )}
                >
                  {!s.leftRound && <span className="pl-1 opacity-60">◂</span>}
                  <span className="min-w-0 truncate px-2">{barLabel(s.r)}</span>
                  {!s.rightRound && <span className="pr-1 opacity-60">▸</span>}
                </button>
              ))}

              {/* ปุ่ม "+N รายการ" — วางตามคอลัมน์จริง กดเปิดมุมมองวัน (§3) */}
              {week.map((iso, col) =>
                overflowByCol[col] > 0 ? (
                  <button
                    key={`ov-${iso}`}
                    type="button"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      onShowDay(iso);
                    }}
                    style={{ left: `calc(${(col / 7) * 100}% + 3px)`, width: `calc(${(1 / 7) * 100}% - 6px)`, top: overflowTop, height: OVERFLOW_H }}
                    className="absolute flex items-center rounded-md px-1.5 text-[11px] font-medium zego-text-tertiary zego-hover-surface"
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
  );
}

/* ------------------------------- มุมมองสัปดาห์ ------------------------------- */

function WeekView({
  cursor,
  today,
  records,
  onAddRange,
  onEditRecord,
}: {
  cursor: string;
  today: string;
  records: LeaderAvailabilityRecord[];
  onAddRange: (s: string, e: string) => void;
  onEditRecord: (r: LeaderAvailabilityRecord) => void;
}) {
  const start = startOfWeek(cursor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
      {days.map((iso) => {
        const d = parseDate(iso);
        const dayRecords = records.filter((r) => coversDay(r, iso));
        return (
          <div key={iso} className="min-h-[120px] rounded-xl border zego-border-color">
            <button
              type="button"
              onClick={() => onAddRange(iso, iso)}
              className={cx(
                'flex w-full items-center justify-between rounded-t-xl border-b zego-border-color px-2 py-1.5 text-left text-xs zego-hover-surface',
                iso === today && 'zego-today-tint',
              )}
            >
              <span className="font-medium zego-text-secondary">{THAI_DOW[d.getDay()]} {d.getDate()}</span>
              <Icon name="plus" className="h-3 w-3 zego-text-tertiary" />
            </button>
            <div className="space-y-1 p-1.5">
              {dayRecords.length === 0 ? (
                <p className="px-1 text-[10px] zego-text-disabled">—</p>
              ) : (
                dayRecords.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => onEditRecord(r)}
                    className={cx('block w-full truncate rounded border px-1.5 py-1 text-left text-[11px] font-medium', chipClass(r), r.approval === 'pending' && 'opacity-70')}
                  >
                    {r.isAllDay ? 'ทั้งวัน' : `${r.startTime}–${r.endTime}`} · {recordTypeLabel(r)}
                  </button>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* --------------------------------- มุมมองวัน --------------------------------- */

function DayView({
  cursor,
  records,
  onAddRange,
  onEditRecord,
}: {
  cursor: string;
  records: LeaderAvailabilityRecord[];
  onAddRange: (s: string, e: string) => void;
  onEditRecord: (r: LeaderAvailabilityRecord) => void;
}) {
  const dayRecords = records
    .filter((r) => coversDay(r, cursor))
    .sort((a, b) => (a.isAllDay === b.isAllDay ? (a.startTime || '').localeCompare(b.startTime || '') : a.isAllDay ? -1 : 1));

  return (
    <div className="rounded-xl border zego-border-color p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold zego-text-secondary">{dayLabel(cursor)}</p>
        <Button variant="secondary" size="sm" icon="plus" onClick={() => onAddRange(cursor, cursor)}>
          เพิ่มรายการวันนี้
        </Button>
      </div>
      {dayRecords.length === 0 ? (
        <p className="py-8 text-center text-sm zego-text-tertiary">ไม่มีรายการในวันนี้</p>
      ) : (
        <ul className="space-y-1.5">
          {dayRecords.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onEditRecord(r)}
                className={cx('flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-sm', chipClass(r), r.approval === 'pending' && 'opacity-70')}
              >
                <span className="w-28 shrink-0 tabular-nums text-xs">{r.isAllDay ? 'ทั้งวัน' : `${r.startTime}–${r.endTime}`}</span>
                <span className="min-w-0 flex-1 truncate">{recordTypeLabel(r)}{r.reason ? ` · ${r.reason}` : ''}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
