'use client';

/**
 * หน้าต่างเลือกคนไปส่ง
 *
 * แยกออกมาเพราะใช้ทั้งจากตารางรายเดือนและจากมุมมองรายกรุ๊ป
 * กติกาการคัดคน (เวลางานประจำ · งานชนกัน) จึงเหมือนกันทุกที่โดยไม่ต้องเขียนซ้ำ
 */

import { useMemo, useState } from 'react';
import { Button, cx, EmptyState } from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';
import { SearchBox } from '@/components/ui/FormField';
import { formatDate } from '@/lib/format';
import { jobArrival, type SendOffJob } from '@/lib/logic/sendOffJobs';
import {
  canSendOffByStatus, checkSendOff, reachedMonthlyCapacity, sendOffStaffName,
  SEND_OFF_STAFF_TYPE, type SendOffCheck, type SendOffStaff,
} from '@/lib/logic/sendOffStaff';
import { DEFAULT_SEND_OFF_RULES, hardConflictWith, worstSendOffPair, type SendOffRules, type SendOffSlot } from '@/lib/logic/sendOffRules';

/** สีกล่องข้อความตามผลการตรวจเวลา */
export const CHECK_TONE: Record<SendOffCheck['kind'], string> = {
  ok: 'zego-badge--success',
  blocked: 'border-rose-300 bg-rose-50 zego-text-danger',
  unknown: 'border-amber-300 bg-amber-50 zego-text-warning',
};

/**
 * หน้าต่างเลือกคนไปส่ง
 *
 * แยกคนที่ไปได้กับไปไม่ได้ออกจากกัน และบอกเหตุผลของคนที่ไปไม่ได้ตรงนั้นเลย
 * ถ้าซ่อนคนที่ไปไม่ได้ทิ้ง ผู้จัดจะไม่รู้ว่าทำไมคนที่คิดไว้ถึงหายไป
 */
export function SendOffStaffPicker({ job, staff, jobs, rules = DEFAULT_SEND_OFF_RULES, dayOffOf, capOf, canAssign, onClose, onPick, onSaveFlightTime, onSaveAirport }: {
  job: SendOffJob;
  staff: SendOffStaff[];
  /** งานทั้งเดือน — ใช้ดูว่าคนที่จะเลือกติดงานไปส่งกรุ๊ปอื่นอยู่หรือไม่ */
  jobs: SendOffJob[];
  /** เงื่อนไขการจัดที่ผู้จัดตั้งไว้ */
  rules?: SendOffRules;
  /** วันนั้นเป็นวันหยุดหรือไม่ — วันหยุดพนักงานจัดได้ทุกช่วงเวลาเท่าประเภทประจำ */
  dayOffOf?: (iso: string) => string | null;
  /** เพดานกรุ๊ปของคนนี้ในเดือนที่กำลังดู — null = ไม่จำกัด (เพดานเป็นแบบเฉพาะเดือน ไม่มีค่าเริ่มต้น) */
  capOf?: (staffId: string) => number | null;
  canAssign: boolean;
  onClose: () => void;
  onPick: (s: SendOffStaff) => void;
  onSaveFlightTime: (time: string) => void;
  /** บันทึกสนามบินขาไปที่กรอกเอง — ใช้เมื่อกรุ๊ปยังไม่รู้สนามบิน (กรุ๊ปจาก CSV ไม่มีสนามบินให้เลย ต่อให้กรอกเวลาแล้ว) */
  onSaveAirport?: (code: string) => void;
}) {
  const [q, setQ] = useState('');
  const [timeDraft, setTimeDraft] = useState(job.flightSource === 'manual' ? job.flightTime ?? '' : '');
  const [airportDraft, setAirportDraft] = useState(job.airport ?? '');

  /**
   * ช่วงเวลาที่แต่ละคนติดงานอยู่แล้ว (ไม่นับกรุ๊ปนี้เอง)
   * ใช้ตรวจว่าเลือกคนนี้แล้วจะไปสองที่พร้อมกันหรือเปล่า
   */
  const busyByStaff = useMemo(() => {
    const m = new Map<string, SendOffSlot[]>();
    for (const j of jobs) {
      if (!j.assignment || !j.slot) continue;
      if (j.period.internalId === job.period.internalId) continue;
      const list = m.get(j.assignment.staffId) ?? [];
      list.push(j.slot);
      m.set(j.assignment.staffId, list);
    }
    return m;
  }, [jobs, job.period.internalId]);

  /**
   * จำนวนกรุ๊ปที่ "คอนเฟิร์มแล้ว" ของคนนี้ในเดือนนี้ (ไม่นับกรุ๊ปนี้เอง) — ใช้เทียบเพดานต่อเดือนเท่านั้น
   * งานที่ยังรอคอนเฟิร์มไม่กินโควตา
   */
  const monthCountByStaff = useMemo(() => {
    const m = new Map<string, number>();
    for (const j of jobs) {
      if (!j.assignment || j.assignment.status !== 'CONFIRMED') continue;
      if (j.period.internalId === job.period.internalId) continue;
      m.set(j.assignment.staffId, (m.get(j.assignment.staffId) ?? 0) + 1);
    }
    return m;
  }, [jobs, job.period.internalId]);

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    return staff
      .filter((s) => canSendOffByStatus(s.status))
      .filter((s) => !query || `${sendOffStaffName(s)} ${s.nickname ?? ''}`.toLowerCase().includes(query))
      .map((s) => ({
        s,
        check: checkSendOff(s.staffType, job.flightTime, {
          leadHours: rules.leadHours,
          workStart: rules.employeeWorkStart,
          workEnd: rules.employeeWorkEnd,
          // วันหยุดดูที่วันไปส่งจริง ซึ่ง buildSendOffJobs คำนวณไว้ให้แล้ว
          isDayOff: dayOffOf ? dayOffOf(job.dutyDate) !== null : Boolean(job.dayOff),
          dayOffLabel: job.dayOff?.label,
        }),
        conflict: worstSendOffPair(job.slot, busyByStaff.get(s.id) ?? [], rules),
        hardConflict: hardConflictWith(job.slot, busyByStaff.get(s.id) ?? [], rules),
        maxGroupsPerMonth: capOf?.(s.id) ?? null,
        atCap: reachedMonthlyCapacity(capOf?.(s.id) ?? null, monthCountByStaff.get(s.id) ?? 0),
      }));
  }, [staff, q, job.flightTime, job.slot, job.dutyDate, job.dayOff, busyByStaff, rules, dayOffOf, monthCountByStaff, capOf]);

  // ไปไม่ได้จริง = ติดเวลางานประจำ, ต้องไปคนละสนามบินในเวลาที่ห่างกันไม่พอ, หรือครบเพดานกรุ๊ปต่อเดือนแล้ว
  // เวลานัดทับซ้อนกัน (สนามบินเดียวกัน) ไม่นับว่าไปไม่ได้อีกต่อไป — เลือกได้ตามปกติ แค่ต้องเห็นคำเตือน
  const ready = rows.filter((r) => r.check.kind !== 'blocked' && !r.hardConflict && !r.atCap);
  const blocked = rows.filter((r) => r.check.kind === 'blocked' || r.hardConflict || r.atCap);
  const arrival = jobArrival(job.flightTime);

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`เลือกคนไปส่ง ${job.period.groupCode}`}
      description={`${job.period.countryName} · ออกเดินทาง ${formatDate(job.period.startDate)}`}
      footer={<div className="flex justify-end"><Button variant="secondary" onClick={onClose}>ปิด</Button></div>}
    >
      <div className="space-y-3">
        <div className={cx('rounded-lg border px-3 py-2 text-xs', CHECK_TONE[arrival.kind])}>
          {job.flightTime
            ? `เครื่องออก ${job.flightTime}${job.flightSource === 'manual' ? ' (กรอกเอง)' : ''} → ต้องถึงสนามบิน ${arrival.arrivalTime}${arrival.dayOffset === -1 ? ' ของคืนก่อนวันเดินทาง' : ''}`
            : 'กรุ๊ปนี้ยังไม่มีเวลาเครื่องออกในระบบ — จัดคนไว้ก่อนได้ แต่ยังตรวจกฎเวลางานไม่ได้'}
        </div>

        {/*
          เวลาบินจริงมีเฉพาะกรุ๊ปที่นำเข้าจาก Zego — กรุ๊ปที่มาจาก CSV จึงคำนวณเวลาไปส่งไม่ได้เลย
          เปิดให้กรอกเองไปก่อน ไม่งั้นกฎ 3 ชั่วโมงจะใช้ไม่ได้กับกรุ๊ปส่วนใหญ่
          ค่าที่กรอกจะถูกแทนที่ทันทีเมื่อเวลาบินจริงเข้ามา
        */}
        {canAssign && job.flightSource !== 'flight' && (
          <div className="zego-border-color flex flex-wrap items-end gap-2 rounded-lg border zego-surface-soft-bg px-3 py-2">
            <label className="text-xs zego-text-secondary">
              <span className="mb-1 block font-medium">เวลาเครื่องออกจากไทย (กรอกเอง)</span>
              <input
                type="time"
                value={timeDraft}
                onChange={(e) => setTimeDraft(e.target.value)}
                className="zego-border-color rounded-lg border px-2 py-1.5 text-sm"
              />
            </label>
            <Button size="sm" variant="secondary" disabled={!timeDraft} onClick={() => onSaveFlightTime(timeDraft)}>บันทึกเวลา</Button>
            {job.flightSource === 'manual' && (
              <Button size="sm" variant="ghost" onClick={() => onSaveFlightTime('')}>ล้างเวลา</Button>
            )}
            <span className="text-[11px] zego-text-tertiary">ใช้ชั่วคราวจนกว่าข้อมูลเที่ยวบินจริงจะเข้ามา</span>
          </div>
        )}

        {/*
          สนามบินขาไป — คู่กับเวลาเครื่องออกด้านบน กรุ๊ปจาก CSV ไม่มีข้อมูล Sector เลย จึงไม่รู้สนามบิน
          ต่อให้กรอกเวลาเองแล้วก็ตาม (คนละฟิลด์กัน) ถ้าไม่เปิดให้กรอกเอง เกณฑ์สนามบินเดียวกัน/คนละสนามบิน
          กับงานอื่นของคนเดียวกันจะค้างเป็น "ยังไม่รู้สนามบิน" ตลอดไป เพราะ Zego ไม่มีข้อมูลกรุ๊ปนี้ตั้งแต่แรก
        */}
        {canAssign && onSaveAirport && !job.airport && (
          <div className="zego-border-color flex flex-wrap items-end gap-2 rounded-lg border zego-surface-soft-bg px-3 py-2">
            <label className="text-xs zego-text-secondary">
              <span className="mb-1 block font-medium">สนามบินขาไป (กรอกเอง)</span>
              <input
                type="text"
                value={airportDraft}
                onChange={(e) => setAirportDraft(e.target.value.toUpperCase())}
                placeholder="เช่น BKK"
                maxLength={3}
                className="zego-border-color w-24 rounded-lg border px-2 py-1.5 text-sm uppercase"
              />
            </label>
            <Button size="sm" variant="secondary" disabled={airportDraft.trim().length !== 3} onClick={() => onSaveAirport(airportDraft)}>บันทึกสนามบิน</Button>
            <span className="text-[11px] zego-text-tertiary">ใช้ตรวจกฎสนามบินเดียวกัน/คนละสนามบินกับงานอื่นของคนเดียวกัน</span>
          </div>
        )}

        <SearchBox value={q} onChange={setQ} label="ค้นหาเจ้าหน้าที่" placeholder="ค้นหาชื่อหรือชื่อเล่น" onClear={() => setQ('')} />

        {rows.length === 0 && (
          <EmptyState icon="users" title="ไม่พบเจ้าหน้าที่" description="ลองล้างคำค้น หรือเปิดใช้งานเจ้าหน้าที่เพิ่มที่เมนูเจ้าหน้าที่ส่งกรุ๊ป" />
        )}

        {ready.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-semibold zego-text-tertiary">ไปได้ ({ready.length})</p>
            {ready.map(({ s, check, conflict }) => {
              // เหลืออยู่ใน "ไปได้" แต่ conflict ไม่ผ่าน = ทับซ้อนสนามบินเดียวกัน (hardConflict ถูกคัดออกไปแล้ว) — จัดได้ แต่เตือนไว้
              const overlap = conflict && !conflict.check.ok;
              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={!canAssign}
                  onClick={() => onPick(s)}
                  className={cx(
                    'flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left',
                    !canAssign ? 'zego-border-color cursor-not-allowed opacity-60'
                      : overlap ? 'border-orange-300 bg-orange-50/50 hover:border-orange-400'
                        : 'zego-border-color zego-hover-selected',
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold zego-text">{sendOffStaffName(s)}</span>
                    <span className="block truncate text-xs zego-text-tertiary">{SEND_OFF_STAFF_TYPE[s.staffType].label} · {check.reason}</span>
                    {overlap && (
                      <span className="block truncate text-xs font-medium zego-text-orange">
                        ⚠ เวลานัดทับซ้อนกับ {conflict.with.groupCode} — {conflict.check.reason}
                      </span>
                    )}
                  </span>
                  {canAssign && <Icon name="chevronRight" className="shrink-0 zego-text-tertiary" />}
                </button>
              );
            })}
          </div>
        )}

        {blocked.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-semibold zego-text-tertiary">ไปไม่ได้ ({blocked.length})</p>
            {blocked.map(({ s, check, hardConflict, atCap, maxGroupsPerMonth }) => (
              <div key={s.id} className="zego-border-color rounded-lg border zego-surface-soft-bg px-3 py-2 opacity-70">
                <p className="truncate text-sm font-semibold zego-text-secondary">{sendOffStaffName(s)}</p>
                <p className="text-xs zego-text-danger">
                  {hardConflict
                    ? `ติดไปส่ง ${hardConflict.with.groupCode} — ${hardConflict.check.reason}`
                    : atCap
                      ? `ครบเพดาน ${maxGroupsPerMonth} กรุ๊ปของเดือนนี้แล้ว — จัดเพิ่มไม่ได้อีก`
                      : check.reason}
                </p>
              </div>
            ))}
          </div>
        )}

        {!canAssign && <p className="text-xs zego-text-tertiary">บทบาทของคุณดูได้อย่างเดียว — จัดคนไปส่งได้เฉพาะผู้จัดหัวหน้าทัวร์และผู้ดูแลระบบ</p>}
      </div>
    </Modal>
  );
}
