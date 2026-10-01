'use client';

/**
 * รายการงานไปส่งของเดือน — อ่านรายละเอียดของงานที่จัดไปแล้ว
 *
 * ตารางรายเดือนตอบได้แค่ "ใครว่างวันไหน" เพราะช่องวันกว้าง 55px ใส่ได้แค่เวลา
 * พอจัดไปหลายสิบกรุ๊ปแล้วจะไล่ดูว่าจัดอะไรไปบ้างไม่ได้เลย
 * มุมมองนี้จึงกางเป็นรายการ เรียงตามวันที่ต้องไปส่ง เห็นครบทั้งกรุ๊ป เที่ยวบิน คน และสถานะ
 */

import { useMemo, type ReactNode } from 'react';
import { Card, cx, EmptyState, StatusBadge } from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icon';
import { formatDate, parseDate, TH_WEEKDAYS_SHORT } from '@/lib/format';
import { BOARD_STATUS, flightSummary } from '@/lib/logic/guideBoard';
import { airportLabel } from '@/lib/logic/airportLabel';
import { jobArrival, jobIssue, jobOverlapWarning, jobStatus, type SendOffJob } from '@/lib/logic/sendOffJobs';
import { sendOffStaffName } from '@/lib/logic/sendOffStaff';

export function SendOffAgenda({ jobs, onOpen, singleStaff = false }: {
  /** งานทั้งเดือน (ทั้งที่จัดแล้วและยังไม่จัด) */
  jobs: SendOffJob[];
  /** กดแถวเพื่อเปิดรายละเอียด — ไม่ส่ง = แสดงอย่างเดียว (เช่นหน้าต่างสรุปรายบุคคล ที่รายการบอกครบอยู่แล้ว) */
  onOpen?: (job: SendOffJob) => void;
  /**
   * รายการของเจ้าหน้าที่คนเดียว (หน้าต่างสรุปรายบุคคล / แท็บตารางงาน) — ชื่อคนซ้ำทุกแถวไม่มีประโยชน์
   * จึงแสดง "สนามบินที่ต้องไปส่ง" ใต้เวลาเครื่องออกแทน (และไม่ซ้ำสนามบินในบรรทัดรหัสกรุ๊ป)
   */
  singleStaff?: boolean;
}) {
  /** เฉพาะงานที่จัดคนไปแล้ว — คำถามของมุมมองนี้คือ "จัดอะไรไปบ้าง" */
  const byDate = useMemo(() => {
    const m = new Map<string, SendOffJob[]>();
    for (const j of jobs) {
      if (!j.assignment) continue;
      m.set(j.dutyDate, [...(m.get(j.dutyDate) ?? []), j]);
    }
    return [...m.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, list]) => ({
        date,
        // ในวันเดียวกันเรียงตามเวลาที่ต้องไปถึง — ลำดับที่คนไปส่งใช้จริง
        list: [...list].sort((x, y) => (x.slot?.checkInMin ?? 0) - (y.slot?.checkInMin ?? 0)),
      }));
  }, [jobs]);

  const total = byDate.reduce((n, d) => n + d.list.length, 0);

  if (total === 0) {
    return (
      <EmptyState
        icon="checklist"
        title="เดือนนี้ยังไม่ได้จัดใครไปส่ง"
        description="สลับไปแท็บตาราง แล้วคลิกช่องวันของเจ้าหน้าที่เพื่อจัดกรุ๊ป"
      />
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs zego-text-tertiary">จัดไปแล้ว {total} งาน · เรียงตามวันที่ต้องไปส่ง</p>

      {byDate.map(({ date, list }) => {
        const d = parseDate(date);
        const weekend = d.getDay() === 0 || d.getDay() === 6;
        return (
          <Card key={date} padded={false}>
            <div className={cx(
              'zego-divider-bottom flex items-baseline gap-2 px-3 py-1.5 text-sm font-semibold',
              weekend ? 'bg-rose-50/60 zego-text-danger' : 'zego-surface-soft-bg zego-text-secondary',
            )}>
              {formatDate(date)}
              <span className="text-xs font-normal zego-text-tertiary">
                {TH_WEEKDAYS_SHORT[d.getDay()]} · {list.length} งาน
              </span>
              {/* วันหยุด = พนักงานจัดได้ทุกช่วงเวลาเท่าประจำ — บอกเฉพาะวันที่มีพนักงานถูกจัด (ประจำไปได้ทุกเวลาอยู่แล้ว ป้ายไม่มีความหมาย) */}
              {list[0]?.dayOff && list.some((j) => j.staff?.staffType === 'employee') && (
                <span className="zego-badge--violet rounded border px-1.5 py-0.5 text-[11px] font-medium">
                  {list[0].dayOff.label} · พนักงานจัดได้ทุกช่วงเวลา
                </span>
              )}
            </div>

            <ul className="divide-y divide-[var(--zego-border-soft)]">
              {list.map((j) => {
                const issue = jobIssue(j);
                const overlap = jobOverlapWarning(j);
                const status = jobStatus(j);
                const arrival = j.check ?? jobArrival(j.flightTime);
                /* ข้ามคืน = เครื่องออกหลังเที่ยงคืน ต้องไปถึงสนามบินตั้งแต่คืนก่อน (งานถูกจัดไว้ใต้วันที่ไปถึง) */
                const overnight = arrival.dayOffset === -1;
                return (
                  <li key={j.assignment!.assignmentId}>
                    <AgendaRow onClick={onOpen ? () => onOpen(j) : undefined}>
                      {/* เวลาที่ต้องไปถึงสนามบิน — ข้อมูลหลักของงานนี้ จึงอยู่ซ้ายสุดและตัวใหญ่สุด · กำกับว่าเป็นเวลาอะไร */}
                      <span className="w-20 shrink-0">
                        <span className="block text-base font-bold tabular-nums zego-text">
                          {arrival.arrivalTime ?? '—'}
                        </span>
                        <span className="block text-[11px] leading-tight zego-text-tertiary">
                          {/* ไม่ซ้ำวันที่ — หัวกลุ่มด้านบนคือวันที่ไปถึงอยู่แล้ว (ข้ามคืนบอกวันเครื่องออกไว้ฝั่งขวา) */}
                          ถึงสนามบิน
                        </span>
                        {overnight && (
                          <span className="zego-badge--violet mt-0.5 inline-block rounded border px-1 text-[10px] font-medium">ข้ามคืน</span>
                        )}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="font-mono text-sm font-bold zego-text">{j.period.groupCode}</span>
                          <StatusBadge meta={BOARD_STATUS[status === 'UNASSIGNED' ? 'UNASSIGNED' : status]} size="sm" />
                          {!singleStaff && <span className="text-xs zego-text-tertiary">{airportLabel(j.airport)}</span>}
                        </span>
                        <span className="block truncate text-xs zego-text-secondary" title={j.period.displayName}>
                          {j.period.countryName} · {j.period.displayName}
                        </span>
                        {j.period.sectors.length > 0 && (
                          <span className="flex items-center gap-1 text-[11px] zego-text-tertiary">
                            <Icon name="plane" className="h-3 w-3 shrink-0" />
                            <span className="truncate">{flightSummary(j.period)}</span>
                          </span>
                        )}
                        {issue ? (
                          <span className="block text-[11px] font-medium zego-text-danger">! {issue}</span>
                        ) : overlap && (
                          <span className="block text-[11px] font-medium zego-text-orange">⚠ {overlap}</span>
                        )}
                      </span>

                      {/* เวลาเครื่องออกเด่นกว่าชื่อคน — คนดูรายการนี้เช็คเวลาเป็นหลัก ชื่อคนเป็นข้อมูลรอง */}
                      <span className="shrink-0 text-right">
                        <span className="block text-sm font-semibold tabular-nums zego-text">
                          {j.flightTime
                            ? `เครื่องออก ${j.flightTime}${overnight ? ` · ${formatDate(j.period.startDate)}` : ''}`
                            : 'ยังไม่รู้เวลาบิน'}
                        </span>
                        <span className="block text-[11px] zego-text-tertiary">
                          {singleStaff ? (j.airport ? airportLabel(j.airport) : 'ยังไม่รู้สนามบิน') : j.staff ? sendOffStaffName(j.staff) : '—'}
                        </span>
                      </span>
                    </AgendaRow>
                  </li>
                );
              })}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}

/** แถวของรายการ — กดได้เมื่อมี onClick · ไม่มี = แถวธรรมดา ไม่มี hover/เคอร์เซอร์มือ (ไม่หลอกว่ากดได้) */
function AgendaRow({ onClick, children }: { onClick?: () => void; children: ReactNode }) {
  const layout = 'flex w-full flex-wrap items-start gap-x-3 gap-y-1 px-3 py-2 text-left';
  if (!onClick) return <div className={layout}>{children}</div>;
  return (
    <button type="button" onClick={onClick} className={cx(layout, 'hover:bg-[var(--zego-primary-50)]')}>
      {children}
    </button>
  );
}
