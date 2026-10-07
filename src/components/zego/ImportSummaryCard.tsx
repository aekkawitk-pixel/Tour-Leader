'use client';

/**
 * สรุปผลการดึงข้อมูล Zego รอบล่าสุด — ใหม่ / เปลี่ยน / ไม่พบในต้นทาง / กลับมา
 * เน้นกรุ๊ปที่ "มีคนรับงานอยู่แล้ว" (หัวหน้าทัวร์ / เจ้าหน้าที่ส่งกรุ๊ป) เพราะเป็นกรุ๊ปที่ต้องแจ้งหรือตรวจสอบต่อ
 *   เปลี่ยนวัน/เที่ยวบิน/สนามบิน → เวลานัด วันไปส่ง และการชนงานเปลี่ยนตาม
 *   ไม่พบในต้นทาง + ยังไม่ถึงวันกลับ → อาจถูกยกเลิก
 */

import { useMemo } from 'react';
import { Callout, Pill } from '@/components/ui/Primitives';
import { formatDateRange, formatDateTime, toISODate } from '@/lib/format';
import type { ZegoPeriod } from '@/data/zego/types';
import type { ZegoMergeSummary } from '@/lib/logic/zegoMerge';
import { loadActiveGuideAssignments } from '@/services/guideAssignmentStore';
import { loadSendOffAssignments } from '@/services/sendOffAssignmentStore';

const MAX_ROWS = 8;

export function ImportSummaryCard({ summary, periods }: { summary: ZegoMergeSummary; periods: ZegoPeriod[] }) {
  // วันที่จริงของเครื่อง (today ของ Demo ตรึงไว้ในอดีต — กรุ๊ปที่จบแล้วจะถูกนับว่ายังไม่เดินทาง)
  const today = toISODate(new Date());
  const byId = useMemo(() => new Map(periods.map((p) => [p.id, p])), [periods]);

  // งานที่มีคนรับไว้แล้ว — อ่านครั้งเดียวต่อสรุป (สรุปเปลี่ยนเฉพาะตอนดึงใหม่)
  const staffed = useMemo(() => {
    const guide = new Set(loadActiveGuideAssignments().map((a) => a.periodId));
    const sendOff = new Set(loadSendOffAssignments().map((a) => a.periodId));
    return { guide, sendOff };
  }, [summary]); // eslint-disable-line react-hooks/exhaustive-deps

  const tags = (id: string) => (
    <>
      {staffed.guide.has(id) && <Pill tone="blue">มีหัวหน้าทัวร์</Pill>}
      {staffed.sendOff.has(id) && <Pill tone="green">มีเจ้าหน้าที่ส่งกรุ๊ป</Pill>}
    </>
  );
  const isStaffed = (id: string) => staffed.guide.has(id) || staffed.sendOff.has(id);

  const changedStaffed = summary.changed.filter((c) => isStaffed(c.id));
  // ไม่พบในต้นทางรอบนี้ + ยังไม่ถึงวันกลับ = น่าจะถูกยกเลิก (เดินทางจบแล้วหลุดออกเป็นเรื่องปกติ ไม่ต้องเตือน)
  const missingUpcoming = summary.missing
    .map((id) => byId.get(id))
    .filter((p): p is ZegoPeriod => !!p && (!p.endDate || p.endDate >= today));
  const missingUpcomingStaffed = missingUpcoming.filter((p) => isStaffed(p.id));

  const attention = changedStaffed.length > 0 || missingUpcomingStaffed.length > 0;
  const stat = (label: string, n: number) => (
    <span><span className="font-semibold tabular-nums zego-text">{n.toLocaleString('th-TH')}</span> {label}</span>
  );

  return (
    <Callout tone={attention ? 'amber' : 'blue'} title={`ผลการดึงข้อมูลรอบล่าสุด · ${formatDateTime(summary.at)}`}>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs zego-text-secondary">
        {stat('พีเรียดที่ได้จาก Zego', summary.fetched)}
        {stat('ใหม่', summary.added.length)}
        {stat('ข้อมูลเปลี่ยน', summary.changed.length)}
        {stat('ไม่พบในต้นทาง (รอบนี้)', summary.missing.length)}
        {summary.restored.length > 0 && stat('กลับมาในต้นทาง', summary.restored.length)}
        {!summary.fullScope && stat('นอกขอบเขต คงไว้ตามเดิม', summary.keptOutOfScope)}
        {summary.reIdentified > 0 && stat('ผูกกลับกับกรุ๊ปเดิม (id เปลี่ยน)', summary.reIdentified)}
      </div>
      <p className="mt-1 text-[11px] zego-text-tertiary">
        กรุ๊ปที่ไม่พบในต้นทางยังเก็บไว้ (รวม {summary.missingTotal.toLocaleString('th-TH')} พีเรียด) — งานเดิม ซองเงิน ใบเสร็จ และเคลียร์เงินของกรุ๊ปเหล่านี้จึงยังแสดงได้ตามปกติ
        แต่จะไม่ขึ้นให้เลือกจัดงานใหม่
      </p>

      {changedStaffed.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-semibold zego-text">ข้อมูลเปลี่ยน — กรุ๊ปที่มีคนรับงานแล้ว ({changedStaffed.length}) · ตรวจเวลานัด/วันไปส่ง และแจ้งผู้รับงาน</p>
          <ul className="mt-1 space-y-1 text-xs">
            {changedStaffed.slice(0, MAX_ROWS).map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-1.5">
                <span className="font-mono font-semibold zego-text">{c.groupCode || c.id}</span>
                {tags(c.id)}
                <span className="zego-text-secondary">{c.details.join(' · ')}</span>
              </li>
            ))}
            {changedStaffed.length > MAX_ROWS && <li className="zego-text-tertiary">… และอีก {changedStaffed.length - MAX_ROWS} กรุ๊ป</li>}
          </ul>
        </div>
      )}

      {missingUpcoming.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-semibold zego-text">
            ไม่พบในต้นทาง และยังไม่ถึงวันกลับ ({missingUpcoming.length}) — อาจถูกยกเลิก ตรวจสอบกับฝ่ายขาย
          </p>
          <ul className="mt-1 space-y-1 text-xs">
            {[...missingUpcomingStaffed, ...missingUpcoming.filter((p) => !isStaffed(p.id))].slice(0, MAX_ROWS).map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-1.5">
                <span className="font-mono font-semibold zego-text">{p.groupCode || p.id}</span>
                {tags(p.id)}
                {p.startDate && p.endDate && <span className="zego-text-tertiary">{formatDateRange(p.startDate, p.endDate)}</span>}
              </li>
            ))}
            {missingUpcoming.length > MAX_ROWS && <li className="zego-text-tertiary">… และอีก {missingUpcoming.length - MAX_ROWS} กรุ๊ป</li>}
          </ul>
        </div>
      )}
    </Callout>
  );
}
