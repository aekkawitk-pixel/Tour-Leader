'use client';

/**
 * หน้าต่างจัดกรุ๊ปให้เจ้าหน้าที่ส่งกรุ๊ป — ทรงเดียวกับหน้าต่างจัดงานของหัวหน้าทัวร์
 *
 * คลิกช่องวันของแถวใคร = เลือกคนนั้นไว้แล้ว แล้วมาเลือก "กรุ๊ป" ในหน้าต่างนี้
 * (ไม่ใช่กลับด้านให้เลือกกรุ๊ปก่อนแล้วค่อยหาคน — สองเมนูจะได้ใช้งานเหมือนกัน)
 *
 * วันที่ที่คลิกใช้เป็นค่าเริ่มต้นของช่วงค้นหาเท่านั้น ไม่ได้บังคับว่าต้องเป็นวันนั้น
 */

import { useEffect, useMemo, useState } from 'react';
import { Button, Card, cx } from '@/components/ui/Primitives';
import { Drawer } from '@/components/ui/Modal';
import { DateInputBase } from '@/components/ui/DateInput';
import { SearchBox } from '@/components/ui/FormField';
import { addDays, formatDate } from '@/lib/format';
import { countryLabel, departsWithin, matchesQuery } from '@/lib/logic/periodFilter';
import { TagMultiSelect } from '@/components/jobs/TagMultiSelect';
import { PeriodOptionCard } from '@/components/jobs/PeriodOptionCard';
import { getAssignablePeriods } from '@/services/tourPeriodMaster';
import { jobArrival, type SendOffJob } from '@/lib/logic/sendOffJobs';
import { checkSendOff, remainingMonthlyCapacity, sendOffStaffName, SEND_OFF_STAFF_TYPE, type SendOffStaff } from '@/lib/logic/sendOffStaff';
import {
  formatHours, hardConflictWith, sendOffSlot, worstSendOffPair,
  type SendOffPairCheck, type SendOffRules, type SendOffSlot,
} from '@/lib/logic/sendOffRules';
import { leaveCoversDate, type SendOffLeaveRecord } from '@/lib/logic/sendOffStaffLeave';
import type { TourPeriodMaster } from '@/data/schedule/masterTypes';

/**
 * จำนวนกรุ๊ปที่วาดต่อครั้ง — กดดูเพิ่มได้จนครบ
 *
 * เดือนหนึ่งมีได้ 200+ กรุ๊ป วาดครบทีเดียวจะหน่วง แต่ถ้าตัดตายตัวแล้วไม่ให้กดต่อ
 * เลือกทั้งเดือนจะเห็นแค่ต้นเดือน กรุ๊ปปลายเดือนจะจัดไม่ได้เลยทั้งที่มีอยู่
 */
const PAGE_SIZE = 80;

/** ผลตรวจของกรุ๊ปหนึ่งเทียบกับคนที่เลือกไว้ */
interface Candidate {
  p: TourPeriodMaster;
  flightTime: string | null;
  /** สนามบินขาไปที่รู้แล้ว (จริงหรือกรอกเอง) — null = ยังไม่รู้ ต้องให้กรอกเอง */
  airport: string | null;
  slot: SendOffSlot | null;
  /** ไปไม่ได้เพราะติดเวลางานประจำ */
  blockedByHours: string | null;
  /** ไปไม่ได้เพราะลาอยู่ในวันที่ต้องไปส่ง (วันลาที่คอนเฟิร์มแล้วเท่านั้น) */
  blockedByLeave: string | null;
  /** ผลตรวจกับงานอื่นของคนนี้ (ที่รับไว้แล้ว + ที่กำลังเลือกอยู่) — ใช้แสดงคำอธิบาย รวมทั้งทับซ้อนสนามบินเดียวกันที่จัดได้ */
  conflict: { check: SendOffPairCheck; withGroupCode: string } | null;
  /** จัดไม่ได้จริง (คนละสนามบิน ห่างไม่พอ) — null = ไปได้ปกติ แม้ conflict ข้างบนจะไม่ null ก็ตาม (แค่ทับซ้อนสนามบินเดียวกัน) */
  hardConflict: { check: SendOffPairCheck; withGroupCode: string } | null;
  /** ชื่อวันหยุดของวันที่ต้องไปส่ง — null = วันทำงานปกติ */
  dayOffLabel: string | null;
  /** เลือกกรุ๊ปนี้แล้วจะเกินเพดานกรุ๊ปต่อเดือนของคนนี้ (ยังไม่ได้เลือกอยู่ตอนนี้) — เลือกเพิ่มไม่ได้ */
  overCapacity: boolean;
}

export function AddSendOffPanel({
  staff, maxGroupsPerMonth, rules, dayOffOf, date, monthStart, monthEnd, monthLabel, jobs, manualTimes, manualAirports, leaves, onClose, onAssignMany, onSaveFlightTime, onSaveAirport,
}: {
  staff: SendOffStaff;
  /** เพดานกรุ๊ปของคนนี้ในเดือนที่กำลังจัด — null = ไม่จำกัด (เพดานเป็นแบบเฉพาะเดือน ไม่มีค่าเริ่มต้น) */
  maxGroupsPerMonth: number | null;
  /** เงื่อนไขการจัดที่ผู้จัดตั้งไว้ */
  rules: SendOffRules;
  /**
   * วันนั้นเป็นวันหยุดหรือไม่ — คืนชื่อวันหยุด หรือ null ถ้าเป็นวันทำงาน
   * วันหยุดพนักงานไม่ต้องเข้างานประจำ จึงจัดได้ทุกช่วงเวลาเท่าประเภทประจำ
   */
  dayOffOf: (iso: string) => string | null;
  /** วันที่ที่คลิก — ใช้เป็นค่าเริ่มต้นของช่วงค้นหาเท่านั้น */
  date: string;
  /** ขอบเขตวันที่ = เดือนที่กำลังเปิดอยู่ (เลือกข้ามเดือนไม่ได้ เหมือนของหัวหน้าทัวร์) */
  monthStart: string;
  monthEnd: string;
  monthLabel: string;
  /** งานทั้งเดือน — ใช้ดูว่ากรุ๊ปไหนมีคนแล้ว และคนนี้ติดงานช่วงไหนอยู่ */
  jobs: SendOffJob[];
  manualTimes: Record<string, string>;
  /** สนามบินขาไปที่กรอกเอง — คู่กับเวลาเครื่องออก ใช้เมื่อกรุ๊ปมาจาก CSV จึงไม่มีสนามบิน */
  manualAirports?: Record<string, string>;
  /** วันลาที่คอนเฟิร์มแล้วของคนนี้ — ใช้กันไม่ให้จัดกรุ๊ปซ้อนวันลา */
  leaves: SendOffLeaveRecord[];
  onClose: () => void;
  onAssignMany: (periods: TourPeriodMaster[]) => void;
  onSaveFlightTime: (periodId: string, time: string) => void;
  onSaveAirport?: (periodId: string, code: string) => void;
}) {
  const [from, setFrom] = useState(date);
  const [to, setTo] = useState(date);
  const [countries, setCountries] = useState<string[]>([]);
  /** กรุ๊ปที่เลือกไว้ — เก็บทั้งก้อน เพราะเปลี่ยนตัวกรองแล้วต้องยังนับและตรวจชนได้อยู่ */
  const [picked, setPicked] = useState<Map<string, TourPeriodMaster>>(new Map());
  const [page, setPage] = useState({ key: '', limit: PAGE_SIZE });
  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setQuery(queryInput.trim()), 350);
    return () => clearTimeout(t);
  }, [queryInput]);

  const pickedList = useMemo(() => [...picked.values()], [picked]);

  /**
   * สถานะกรุ๊ปที่กำลังดู — "ยังไม่จัด" (ค่าเริ่มต้น) กับ "จัดแล้ว" (กรุ๊ปใหญ่บางกรุ๊ปต้องใช้เจ้าหน้าที่มากกว่า 1 คน
   * จึงต้องกลับมาเพิ่มคนที่สองให้กรุ๊ปที่มีคนอยู่แล้วได้)
   */
  const [statusFilter, setStatusFilter] = useState<'unassigned' | 'assigned'>('unassigned');

  /** กรุ๊ปที่มีคนไปส่งแล้วอย่างน้อย 1 คน (ไม่ว่าใคร) */
  const takenIds = useMemo(() => new Set(
    jobs.filter((j) => j.assignment).map((j) => j.period.internalId),
  ), [jobs]);

  /** กรุ๊ปที่คนนี้ถูกจัดไปแล้ว — เลือกซ้ำไม่ได้อีกไม่ว่าจะอยู่โหมดไหน (จัดคนเดิมซ้ำไม่ใช่เพิ่มคนใหม่) */
  const assignedToThisStaffIds = useMemo(() => new Set(
    jobs.filter((j) => j.assignment?.staffId === staff.id).map((j) => j.period.internalId),
  ), [jobs, staff.id]);

  /** รายชื่อคนที่ถูกจัดไปส่งกรุ๊ปนี้แล้ว — ใช้บอกก่อนเพิ่มคนที่สองในโหมด "จัดแล้ว" */
  const assigneesByPeriod = useMemo(() => {
    const m = new Map<string, SendOffStaff[]>();
    for (const j of jobs) {
      if (!j.assignment || !j.staff) continue;
      const list = m.get(j.period.internalId) ?? [];
      list.push(j.staff);
      m.set(j.period.internalId, list);
    }
    return m;
  }, [jobs]);

  /** งานที่คนนี้รับไว้แล้วในเดือนนี้ — ใช้เทียบเงื่อนไขกับกรุ๊ปที่กำลังจะเลือก */
  const busySlots = useMemo(() => jobs
    .filter((j) => j.assignment?.staffId === staff.id && j.slot)
    .map((j) => j.slot!), [jobs, staff.id]);

  /**
   * จำนวนกรุ๊ปที่ "คอนเฟิร์มแล้ว" ของคนนี้ในเดือนนี้ — ใช้เทียบเพดานต่อเดือนเท่านั้น
   * งานที่ยังรอคอนเฟิร์มไม่กินโควตา (ผู้จัดยังไม่ได้คุยกับเจ้าหน้าที่จนตกลงกันจริง)
   */
  const assignedThisMonth = useMemo(
    () => jobs.filter((j) => j.assignment?.staffId === staff.id && j.assignment.status === 'CONFIRMED').length,
    [jobs, staff.id],
  );
  /** เหลือรับได้อีกกี่กรุ๊ปเดือนนี้ — null = ไม่จำกัด (ไม่ได้ตั้งเพดานไว้) */
  const remainingCapacity = remainingMonthlyCapacity(maxGroupsPerMonth, assignedThisMonth);

  /** เวลาเครื่องออกของกรุ๊ป — เวลาจริงจาก Sector ชนะค่าที่กรอกเองเสมอ */
  const flightTimeOf = (p: TourPeriodMaster): string | null => {
    const real = jobs.find((j) => j.period.internalId === p.internalId)?.flightSource === 'flight'
      ? jobs.find((j) => j.period.internalId === p.internalId)?.flightTime ?? null
      : null;
    return real ?? manualTimes[p.internalId] ?? null;
  };

  /** สนามบินขาไปของกรุ๊ป — สนามบินจริงจาก Sector ชนะค่าที่กรอกเองเสมอ เหมือนเวลาเครื่องออก */
  const airportOf = (p: TourPeriodMaster): string | null => p.departureAirportCode ?? manualAirports?.[p.internalId] ?? null;

  const rangeError = !from || !to
    ? 'กรุณาเลือกช่วงวันที่ให้ครบ'
    : from < monthStart || to > monthEnd
      ? `กรุณาเลือกช่วงวันที่ภายในเดือน${monthLabel}`
      : to < from
        ? 'วันที่สิ้นสุดต้องไม่น้อยกว่าวันที่เริ่มต้น'
        : null;

  /**
   * "แสดงทั้งเดือน" — คิดจากค่าช่วงวันที่ปัจจุบัน ไม่เก็บเป็น state แยก
   * แก้วันที่เองแล้วติ๊กหลุดเองโดยอัตโนมัติ จึงไม่มีทางค้างสถานะที่ไม่ตรงกับช่องวันที่
   */
  const wholeMonth = from === monthStart && to === monthEnd;
  const toggleWholeMonth = () => {
    if (wholeMonth) { setFrom(date); setTo(date); }
    else { setFrom(monthStart); setTo(monthEnd); }
  };

  /**
   * จำนวนกรุ๊ปของแต่ละสถานะ — ใช้บนป้ายตัวเลือกโหมด นับเฉพาะกรุ๊ปที่ออกเดินทางในเดือนที่กำลังจัดอยู่
   * (ไม่ผูกกับตัวกรองประเทศ/ช่วงวันที่ย่อย/คำค้น เหมือนป้าย "ประจำ (9)" บนตารางหลัก แต่ต้องจำกัดแค่เดือนนี้เดือนเดียว
   * ไม่งั้นจะนับรวมกรุ๊ปทุกเดือนในทั้งระบบ ขณะที่ takenIds รู้จักแค่กรุ๊ปในเดือนนี้เดือนเดียว — ตัวเลขจะไม่ตรงกับที่กรองเห็นจริง)
   */
  const modeCounts = useMemo(() => {
    const eligible = getAssignablePeriods()
      .filter((p) => !assignedToThisStaffIds.has(p.internalId))
      .filter((p) => departsWithin(p, monthStart, monthEnd));
    return {
      unassigned: eligible.filter((p) => !takenIds.has(p.internalId)).length,
      assigned: eligible.filter((p) => takenIds.has(p.internalId)).length,
    };
  }, [takenIds, assignedToThisStaffIds, monthStart, monthEnd]);

  /**
   * กองงานตั้งต้น — ตามสถานะที่เลือก (ยังไม่จัด/จัดแล้ว) · อยู่ในช่วงวันที่ · ตรงคำค้น
   * ทั้งสองโหมดกันคนเดิมไม่ให้เลือกกรุ๊ปที่ตัวเองถูกจัดไปแล้วซ้ำ (โหมด "ยังไม่จัด" ไม่มีทางชนอยู่แล้วเพราะ
   * takenIds คัดออกหมด แต่ใส่เงื่อนไขนี้ไว้ตรงกลางเผื่ออนาคตเปลี่ยนกติกา ไม่ต้องมาแก้สองที่)
   */
  const basePool = useMemo(() => {
    if (rangeError) return [];
    return getAssignablePeriods()
      .filter((p) => (statusFilter === 'unassigned' ? !takenIds.has(p.internalId) : takenIds.has(p.internalId)))
      .filter((p) => !assignedToThisStaffIds.has(p.internalId))
      .filter((p) => departsWithin(p, from, to))
      .filter((p) => matchesQuery(p, query));
  }, [takenIds, assignedToThisStaffIds, statusFilter, from, to, query, rangeError]);

  const countryOptions = useMemo(
    () => [...new Set(getAssignablePeriods().map((p) => p.countryName).filter(Boolean))].sort(),
    [],
  );

  const countryCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of basePool) if (p.countryName) m.set(p.countryName, (m.get(p.countryName) ?? 0) + 1);
    // ประเทศที่ไม่มีงานต้องขึ้นเลข 0 ให้เห็น ไม่ใช่ปล่อยว่างจนอ่านไม่ออกว่ามีหรือไม่มี
    for (const c of countryOptions) if (!m.has(c)) m.set(c, 0);
    return m;
  }, [basePool, countryOptions]);

  /**
   * กรุ๊ปที่เลือกได้ พร้อมผลตรวจของคนคนนี้
   * ตรวจ 2 ชั้น — เวลางานประจำของประเภทพนักงาน และงานที่ชนกับที่รับไว้แล้ว/ที่กำลังเลือกอยู่
   */
  const candidates = useMemo<Candidate[]>(() => {
    if (rangeError) return [];
    const pick = new Set(countries);
    const slotOf = (p: TourPeriodMaster) => sendOffSlot({
      groupCode: p.groupCode,
      departDate: p.startDate,
      flightTime: flightTimeOf(p),
      airport: airportOf(p),
    }, rules);
    const pickedSlots = pickedList
      .map((p) => ({ id: p.internalId, slot: slotOf(p) }))
      .filter((x): x is { id: string; slot: SendOffSlot } => x.slot !== null);

    return basePool
      .filter((p) => pick.size === 0 || pick.has(p.countryName))
      .map((p) => {
        const flightTime = flightTimeOf(p);
        const slot = slotOf(p);
        /* วันหยุดต้องดูที่วันไปส่งจริง — เที่ยวบินดึกทำให้ต้องไปตั้งแต่คืนก่อน */
        const arrival = jobArrival(flightTime, rules);
        const dutyDate = arrival.dayOffset === -1 ? addDays(p.startDate, -1) : p.startDate;
        const dayOffLabel = dayOffOf(dutyDate);
        const check = checkSendOff(staff.staffType, flightTime, {
          leadHours: rules.leadHours,
          workStart: rules.employeeWorkStart,
          workEnd: rules.employeeWorkEnd,
          isDayOff: dayOffLabel !== null,
          dayOffLabel: dayOffLabel ?? undefined,
        });
        const others = [...busySlots, ...pickedSlots.filter((x) => x.id !== p.internalId).map((x) => x.slot)];
        const worst = worstSendOffPair(slot, others, rules);
        const hard = hardConflictWith(slot, others, rules);
        const leaveHit = leaves.find((r) => leaveCoversDate(r, dutyDate));
        // เพดานเดือนนี้เต็มแล้ว (นับของเดิม + ที่เลือกไว้แล้ว) — กรุ๊ปที่ยังไม่ได้เลือกจะเลือกเพิ่มไม่ได้อีก
        const overCapacity = !picked.has(p.internalId) && remainingCapacity !== null && pickedList.length >= remainingCapacity;
        return {
          p, flightTime, airport: airportOf(p), slot, dayOffLabel, overCapacity,
          blockedByHours: check.kind === 'blocked' ? check.reason : null,
          blockedByLeave: leaveHit ? `ลาอยู่วันที่ ${formatDate(dutyDate)} — จัดไม่ได้จนกว่าจะยกเลิกวันลานี้` : null,
          conflict: worst ? { check: worst.check, withGroupCode: worst.with.groupCode } : null,
          hardConflict: hard ? { check: hard.check, withGroupCode: hard.with.groupCode } : null,
        };
      })
      .sort((a, b) => a.p.startDate.localeCompare(b.p.startDate) || a.p.groupCode.localeCompare(b.p.groupCode));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basePool, countries, rangeError, staff.staffType, busySlots, pickedList, picked, remainingCapacity, manualTimes, manualAirports, jobs, rules, dayOffOf, leaves]);

  /*
    จำนวนที่กางไว้ ผูกกับตัวกรองชุดที่กางมัน — เปลี่ยนช่วงวันที่/ประเทศ/คำค้น
    แล้วกลับไปเริ่มใหม่เองโดยไม่ต้องรีเซ็ตใน effect
    ตัดตอนวาดเท่านั้น จำนวนที่รายงานต้องเป็นของจริง
  */
  const filterKey = `${from}|${to}|${countries.join(',')}|${query}`;
  const limit = page.key === filterKey ? page.limit : PAGE_SIZE;
  const shownCandidates = candidates.slice(0, limit);

  /** กรุ๊ปที่เลือกไว้แล้วแต่ยังมีเรื่องต้องดู — ใช้สรุปก่อนยืนยัน */
  const pickedIssues = useMemo(
    () => candidates.filter((c) => picked.has(c.p.internalId) && (!c.flightTime || c.conflict?.check.airportPending)),
    [candidates, picked],
  );
  /** เวลานัดทับซ้อนกับงานอื่น (สนามบินเดียวกัน) — จัดได้ตามนโยบาย แต่ต้องบอกให้ผู้จัดรู้ไว้เตรียมตัว */
  const pickedOverlaps = useMemo(
    () => candidates.filter((c) => picked.has(c.p.internalId) && c.conflict?.check.ok === false && !c.hardConflict),
    [candidates, picked],
  );
  /** กรุ๊ปที่เลือกไว้ซึ่งมีเจ้าหน้าที่ส่งกรุ๊ปคนอื่นอยู่แล้ว — เตือนก่อนกดจัดว่ากำลังเพิ่มคนที่สอง/สาม ไม่ใช่คนแรก */
  const pickedAlreadyAssigned = useMemo(
    () => pickedList
      .filter((p) => assigneesByPeriod.has(p.internalId))
      .map((p) => ({ p, assignees: assigneesByPeriod.get(p.internalId)! })),
    [pickedList, assigneesByPeriod],
  );
  // จัดไม่ได้จริงเฉพาะคนละสนามบิน (hardConflict) — ทับซ้อนสนามบินเดียวกันจัดได้ ไม่บล็อกปุ่มจัดอีกต่อไป
  const hasConflict = candidates.some((c) => picked.has(c.p.internalId) && c.hardConflict !== null);
  const overCapacity = remainingCapacity !== null && picked.size > remainingCapacity;

  const togglePick = (p: TourPeriodMaster) => {
    setPicked((prev) => {
      const next = new Map(prev);
      if (next.has(p.internalId)) { next.delete(p.internalId); return next; }
      // ครบเพดานเดือนนี้แล้ว — เลือกเพิ่มไม่ได้อีก (บล็อกจริง)
      if (remainingCapacity !== null && prev.size >= remainingCapacity) return prev;
      next.set(p.internalId, p);
      return next;
    });
  };

  const rangeLabel = from === to ? formatDate(from) : `${formatDate(from)} – ${formatDate(to)}`;

  return (
    <Drawer
      open
      onClose={onClose}
      size="xl"
      title={`จัดกรุ๊ปให้ ${sendOffStaffName(staff)}`}
      description="เลือกกรุ๊ปจาก Tour Period Master · วันที่ที่คลิกใช้สำหรับค้นหาเท่านั้น"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs zego-text-tertiary">
            {picked.size > 0 ? `เลือกไว้ ${picked.size} กรุ๊ป` : 'ยังไม่ได้เลือกกรุ๊ป'}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>ยกเลิก</Button>
            <Button
              variant="primary"
              disabled={picked.size === 0 || hasConflict || overCapacity}
              onClick={() => onAssignMany(pickedList)}
            >
              จัด {picked.size > 0 ? `${picked.size} กรุ๊ป` : ''}
            </Button>
          </div>
        </div>
      }
    >
      {/* เจ้าหน้าที่ถูกเลือกไว้แล้วจากแถวที่คลิก — เปลี่ยนคนที่นี่ไม่ได้ (ปิดแล้วคลิกแถวอื่น) */}
      <dl className="zego-border-color mb-3 rounded-xl border zego-surface-soft-bg px-3 py-2 text-sm">
        <div className="flex gap-2">
          <dt className="w-28 shrink-0 zego-text-tertiary">เจ้าหน้าที่</dt>
          <dd className="min-w-0 flex-1 font-medium zego-text">
            {sendOffStaffName(staff)}
            <span className="ml-2 text-xs font-normal zego-text-tertiary">
              {SEND_OFF_STAFF_TYPE[staff.staffType].label} · {SEND_OFF_STAFF_TYPE[staff.staffType].note}
            </span>
            {maxGroupsPerMonth != null && (
              <span className={cx(
                'ml-2 rounded border px-1.5 py-0.5 text-[11px] font-medium',
                remainingCapacity === 0 ? 'zego-badge--danger' : 'zego-badge--slate',
              )}>
                โควตาเดือนนี้ {assignedThisMonth + picked.size}/{maxGroupsPerMonth} กรุ๊ป
              </span>
            )}
          </dd>
        </div>
      </dl>

      {/* สถานะกรุ๊ป — "ยังไม่จัด" เลือกได้ปกติ · "จัดแล้ว" ใช้เพิ่มคนที่สอง/สามให้กรุ๊ปใหญ่ที่มีคนอยู่แล้ว */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {(['unassigned', 'assigned'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            aria-pressed={statusFilter === mode}
            onClick={() => setStatusFilter(mode)}
            className={cx(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              statusFilter === mode ? 'zego-badge--info' : 'zego-surface-bg zego-border-color zego-text-secondary zego-hover-surface',
            )}
          >
            {mode === 'unassigned' ? `ยังไม่จัด (${modeCounts.unassigned})` : `จัดแล้ว (${modeCounts.assigned})`}
          </button>
        ))}
      </div>

      {/* แถวตัวกรอง — ประเทศ / ช่วงวันที่ ทรงเดียวกับหน้าต่างของหัวหน้าทัวร์ */}
      <div className="mb-3 grid items-start gap-4 md:grid-cols-[42%_1fr]">
        <div>
          <span className="mb-1 flex h-5 items-center text-xs font-medium zego-text-tertiary">ประเทศ</span>
          <TagMultiSelect
            ariaLabel="ประเทศ"
            summary={countryLabel(countries)}
            searchPlaceholder="ค้นหาประเทศ…"
            emptyText="ไม่พบประเทศที่ค้นหา"
            options={countryOptions}
            counts={countryCounts}
            selected={countries}
            onChange={setCountries}
          />
        </div>
        <div>
          <span className="mb-1 flex h-5 items-center text-xs font-medium zego-text-tertiary">ช่วงวันออกเดินทาง</span>
          <div className="flex flex-wrap items-center gap-2">
            <DateInputBase value={from} min={monthStart} max={monthEnd} onChange={setFrom} className="h-[38px]" aria-label="วันที่เริ่มต้น" />
            <span className="zego-text-tertiary">–</span>
            <DateInputBase value={to} min={monthStart} max={monthEnd} onChange={setTo} className="h-[38px]" aria-label="วันที่สิ้นสุด" />
            <label className="flex items-center gap-1.5 text-xs zego-text-secondary">
              <input type="checkbox" checked={wholeMonth} onChange={toggleWholeMonth} className="zego-checkbox-empty h-4 w-4 rounded" />
              แสดงทั้งเดือน
            </label>
          </div>
          {rangeError && <p className="mt-1 text-xs zego-text-danger">{rangeError}</p>}
        </div>
      </div>

      <SearchBox
        value={queryInput}
        onChange={setQueryInput}
        label="ค้นหากรุ๊ป"
        placeholder="ค้นหารหัสกรุ๊ปหรือชื่อโปรแกรม"
        className="mb-3"
        onClear={() => { setQueryInput(''); setQuery(''); }}
        onKeyDown={(e) => { if (e.key === 'Enter') setQuery(queryInput.trim()); }}
      />

      {/* สรุปสิ่งที่ต้องดูก่อนกดจัด — ไม่ปล่อยให้เจอตอนกดแล้วเด้ง error */}
      {hasConflict && (
        <div className="zego-badge--danger mb-2 rounded-lg border px-3 py-2 text-xs">
          กรุ๊ปที่เลือกไว้ต้องไปคนละสนามบินในเวลาที่ห่างกันไม่พอ — เอาออกอย่างน้อยหนึ่งกรุ๊ปก่อนจึงจะจัดได้
        </div>
      )}
      {pickedOverlaps.length > 0 && (
        <div className="zego-badge--orange mb-2 rounded-lg border px-3 py-2 text-xs">
          ⚠ {pickedOverlaps.length} กรุ๊ปที่เลือกไว้เวลานัดทับซ้อนกับงานอื่นของคนนี้ (สนามบินเดียวกัน) — จัดได้ตามนโยบาย แต่แจ้งเจ้าหน้าที่ให้เตรียมตัวด้วย
        </div>
      )}
      {pickedAlreadyAssigned.length > 0 && (
        <div className="zego-badge--info mb-2 rounded-lg border px-3 py-2 text-xs">
          {pickedAlreadyAssigned.map(({ p, assignees }) => (
            <p key={p.internalId}>
              {p.groupCode} มีเจ้าหน้าที่ส่งกรุ๊ปแล้ว {assignees.length} คน ({assignees.map((s) => sendOffStaffName(s)).join(', ')}) — {sendOffStaffName(staff)} จะเป็นคนที่ {assignees.length + 1}
            </p>
          ))}
        </div>
      )}
      {!hasConflict && pickedIssues.length > 0 && (
        <div className="zego-badge--warning mb-2 rounded-lg border px-3 py-2 text-xs">
          มี {pickedIssues.length} กรุ๊ปที่เลือกไว้ยังตรวจไม่ครบ (ยังไม่รู้เวลาบินหรือสนามบิน) — จัดได้ แต่ต้องกลับมาดู
        </div>
      )}
      {remainingCapacity === 0 && (
        <div className="zego-badge--danger mb-2 rounded-lg border px-3 py-2 text-xs">
          {sendOffStaffName(staff)} ครบเพดาน {maxGroupsPerMonth} กรุ๊ปของเดือนนี้แล้ว — เลือกเพิ่มไม่ได้อีก
        </div>
      )}

      <p className="mb-1 text-xs zego-text-tertiary">
        {rangeLabel} · พบ {candidates.length} กรุ๊ปที่{statusFilter === 'unassigned' ? 'ยังไม่มีคนไปส่ง' : 'จัดคนไปส่งแล้ว'}
        {candidates.length > limit && ` · แสดง ${limit} รายการแรก (เรียงตามวันออกเดินทาง)`}
        {' · '}เวลาที่แสดง = เวลาที่ต้องถึงสนามบิน (เครื่องออก − {formatHours(rules.leadHours)})
      </p>

      {candidates.length === 0 ? (
        <Card>
          <p className="py-6 text-center text-sm zego-text-tertiary">
            {rangeError
              ? 'แก้ช่วงวันที่ก่อน'
              : statusFilter === 'unassigned'
                ? 'ไม่มีกรุ๊ปที่ยังไม่มีคนไปส่งในช่วงนี้ — ลองขยายช่วงวันที่หรือล้างตัวกรอง'
                : 'ไม่มีกรุ๊ปที่จัดคนไปส่งแล้วในช่วงนี้ — ลองขยายช่วงวันที่หรือล้างตัวกรอง'}
          </p>
        </Card>
      ) : (
        <ul className="space-y-2">
          {shownCandidates.map((c) => {
            const on = picked.has(c.p.internalId);
            // จัดไม่ได้จริงเฉพาะติดเวลางาน/ลา/ชนข้ามสนามบิน/ครบเพดานเดือนนี้ — ทับซ้อนสนามบินเดียวกันจัดได้ (แค่เตือน ดู overlap ด้านล่าง)
            const blocked = c.blockedByHours !== null || c.blockedByLeave !== null || c.hardConflict !== null || c.overCapacity;
            const overlap = !blocked && c.conflict?.check.ok === false;
            const arrival = jobArrival(c.flightTime, rules);
            return (
              <li key={c.p.internalId}>
                <PeriodOptionCard
                  period={c.p}
                  picked={on}
                  disabled={blocked}
                  badge={
                    blocked ? { label: 'จัดไม่ได้', tone: 'blocked' }
                      : overlap ? { label: 'ทับซ้อน', tone: 'overlap' }
                        : !c.flightTime || c.conflict?.check.airportPending ? { label: 'ควรตรวจสอบ', tone: 'warn' }
                          : { label: 'จัดได้', tone: 'ok' }
                  }
                  /* งานนี้สนใจ "เวลาที่ต้องไปถึงสนามบิน" — คนละอย่างกับเวลาเครื่องออกที่อยู่บรรทัดเที่ยวบิน */
                  tailLine={
                    <>
                      {c.flightTime
                        ? `ถึงสนามบิน ${arrival.arrivalTime}${arrival.dayOffset === -1 ? ' (คืนก่อน)' : ''}`
                        : 'ยังไม่รู้เวลาบิน'}
                      {/* วันหยุด = พนักงานไม่ติดงานประจำ จึงจัดได้ทุกช่วงเวลา — ต้องเห็นว่าทำไมถึงจัดได้ */}
                      {c.dayOffLabel && (
                        <span className="zego-badge--violet ml-1 rounded border px-1 py-0.5 text-[10px] font-medium">
                          {c.dayOffLabel}
                        </span>
                      )}
                    </>
                  }
                  onToggle={() => togglePick(c.p)}
                  notes={
                    <>
                      {/* โหมด "จัดแล้ว" — บอกก่อนว่ากรุ๊ปนี้มีใครไปส่งอยู่แล้วบ้าง จะได้รู้ว่ากำลังเพิ่มคนที่สอง ไม่ใช่คนแรก */}
                      {assigneesByPeriod.has(c.p.internalId) && (
                        <p className="mt-0.5 text-[11px] font-medium zego-text-info">
                          มีเจ้าหน้าที่ส่งกรุ๊ปแล้ว {assigneesByPeriod.get(c.p.internalId)!.length} คน: {assigneesByPeriod.get(c.p.internalId)!.map((s) => sendOffStaffName(s)).join(', ')}
                        </p>
                      )}
                      {c.blockedByLeave && <p className="mt-0.5 text-[11px] font-medium zego-text-danger">{c.blockedByLeave}</p>}
                      {c.blockedByHours && <p className="mt-0.5 text-[11px] font-medium zego-text-danger">{c.blockedByHours}</p>}
                      {c.overCapacity && (
                        <p className="mt-0.5 text-[11px] font-medium zego-text-danger">
                          เลือกไว้ครบเพดาน {maxGroupsPerMonth} กรุ๊ปของเดือนนี้แล้ว — เลือกเพิ่มไม่ได้อีก
                        </p>
                      )}
                      {c.hardConflict && (
                        <p className="mt-0.5 text-[11px] font-medium zego-text-danger">
                          กับ {c.hardConflict.withGroupCode}: {c.hardConflict.check.reason}
                        </p>
                      )}
                      {overlap && c.conflict && (
                        <p className="mt-0.5 text-[11px] font-medium zego-text-orange">
                          ⚠ เวลานัดทับซ้อนกับ {c.conflict.withGroupCode}: {c.conflict.check.reason}
                        </p>
                      )}
                      {!blocked && c.conflict?.check.airportPending && (
                        <p className="mt-0.5 text-[11px] zego-text-warning">
                          {c.airport
                            ? `ยังไม่รู้สนามบินของ ${c.conflict.withGroupCode} — ใช้เกณฑ์สนามบินเดียวกันไปก่อน`
                            : 'ยังไม่รู้สนามบินของกรุ๊ปนี้เอง — ใช้เกณฑ์สนามบินเดียวกันไปก่อน'}
                        </p>
                      )}
                      {/*
                        เวลาบินจริงมีเฉพาะกรุ๊ปที่นำเข้าจาก Zego — กรุ๊ปจาก CSV จึงตรวจกฎ 3 ชั่วโมงไม่ได้
                        เปิดให้กรอกตรงนี้เลย ไม่ต้องออกไปแก้ที่อื่นแล้วกลับเข้ามาใหม่
                      */}
                      {!c.flightTime && (
                        <span
                          className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] zego-text-tertiary"
                          onClick={(e) => e.stopPropagation()}
                        >
                          เวลาเครื่องออก
                          <input
                            type="time"
                            className="zego-border-color rounded border px-1.5 py-0.5 text-[11px]"
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => { if (e.target.value) onSaveFlightTime(c.p.internalId, e.target.value); }}
                          />
                          <span className="zego-text-tertiary">กรอกเองไว้ก่อนได้จนกว่าข้อมูลเที่ยวบินจริงจะเข้ามา</span>
                        </span>
                      )}
                      {/* สนามบินขาไป — คู่กับเวลาเครื่องออก กรุ๊ปจาก CSV ไม่มี Sector จึงไม่รู้สนามบินแม้กรอกเวลาแล้วก็ตาม */}
                      {!c.airport && onSaveAirport && (
                        <span
                          className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] zego-text-tertiary"
                          onClick={(e) => e.stopPropagation()}
                        >
                          สนามบินขาไป
                          <input
                            type="text"
                            placeholder="เช่น BKK"
                            maxLength={3}
                            className="zego-border-color w-16 rounded border px-1.5 py-0.5 text-[11px] uppercase"
                            onClick={(e) => e.stopPropagation()}
                            onBlur={(e) => { if (e.target.value.trim().length === 3) onSaveAirport(c.p.internalId, e.target.value); }}
                          />
                          <span className="zego-text-tertiary">กรอกเองไว้ก่อนได้ถ้ากรุ๊ปนี้ไม่มีข้อมูลเที่ยวบินจริง</span>
                        </span>
                      )}
                    </>
                  }
                />
              </li>
            );
          })}
        </ul>
      )}

      {candidates.length > limit && (
        <div className="zego-border-color mt-2 flex items-center justify-between gap-3 rounded-lg border zego-surface-soft-bg px-3 py-2 text-xs zego-text-tertiary">
          <span>แสดง {limit} จาก {candidates.length} กรุ๊ป — ที่เหลือเป็นกรุ๊ปวันหลังจากนี้</span>
          <Button size="sm" variant="secondary" onClick={() => setPage({ key: filterKey, limit: limit + PAGE_SIZE })}>
            แสดงเพิ่มอีก {Math.min(PAGE_SIZE, candidates.length - limit)}
          </Button>
        </div>
      )}
    </Drawer>
  );
}

