'use client';

/**
 * ข้อมูลกลางของพอร์ทัลเจ้าหน้าที่ส่งกรุ๊ป — ตัวเจ้าหน้าที่ (ทะเบียน SOS) + ตารางงานของตัวเอง
 * อ่านจาก store เดียวกับหน้าจัดตารางฝั่งผู้จัด ข้อมูลจึงตรงกันเสมอ
 */

import { useMemo } from 'react';
import { useDemo } from '@/store/DemoStore';
import { toISODate } from '@/lib/format';
import { loadSendOffStaff } from '@/services/sendOffStaffStore';
import { loadSendOffAssignments } from '@/services/sendOffAssignmentStore';
import { loadManualFlightTimes } from '@/services/sendOffFlightTimeStore';
import { loadManualAirports } from '@/services/sendOffManualAirportStore';
import { loadSendOffRules } from '@/services/sendOffRulesStore';
import { getTourPeriodById } from '@/services/tourPeriodMaster';
import { periodTurnaround } from '@/lib/logic/guideBoard';
import { staffDuties, type DutyPeriod } from '@/lib/logic/staffPortal';
import { flightNoOf } from '@/lib/logic/airlines';

export function periodForDuty(periodId: string): DutyPeriod | null {
  const p = getTourPeriodById(periodId);
  if (!p) return null;
  const first = p.sectors?.[0];
  return {
    internalId: p.internalId,
    groupCode: p.groupCode,
    displayName: p.displayName,
    startDate: p.startDate,
    endDate: p.endDate,
    departureAirportCode: p.departureAirportCode,
    departureTime: periodTurnaround(p).departureTime ?? null,
    // ไม่ต่อรหัสสายการบินซ้ำเมื่อเลขเที่ยวบินมีรหัสอยู่แล้ว (เดิมขึ้น "NHNH806")
    flightNo: flightNoOf(first) || null,
  };
}

export function useStaffPortal() {
  const { currentUser } = useDemo();
  // วันที่จริง (ไม่ใช่วันอ้างอิงของ Demo) — ตารางงาน/สิทธิ์เบิกอิงวันที่ไปส่งจริง เหมือนซองเงินที่ใช้เวลาจริง
  const today = toISODate(new Date());
  const staffId = currentUser.sendOffStaffId ?? '';
  const staff = useMemo(() => loadSendOffStaff().find((s) => s.id === staffId) ?? null, [staffId]);
  const duties = useMemo(
    () =>
      staffId
        ? staffDuties({
          assignments: loadSendOffAssignments(),
          staffId,
          periodOf: periodForDuty,
          manualTimes: loadManualFlightTimes(),
          manualAirports: loadManualAirports(),
          leadHours: loadSendOffRules().leadHours,
        })
        : [],
    [staffId],
  );
  return { staffId, staff, duties, today };
}
