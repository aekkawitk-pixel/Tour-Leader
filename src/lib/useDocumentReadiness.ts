'use client';

/**
 * ตรวจความพร้อมเอกสารของหัวหน้าทัวร์ "หลายคนพร้อมกัน" สำหรับหน้าจอจัดงาน
 *
 * โหลดเอกสารทั้งระบบครั้งเดียวแล้วจัดกลุ่มไว้ — ดีกว่าเรียก store ทีละแถวในรายการยาว ๆ
 * รวมหนังสือเดินทางจากไฟล์นำเข้าต้นทางเข้ามาด้วย ไม่งั้นจะเตือนผิดว่า "ไม่มีหนังสือเดินทาง"
 * ทั้งที่ข้อมูลมีอยู่ (ดู masterPassportToRecord)
 *
 * รับ trip เป็นพารามิเตอร์ตอนเรียก ไม่ใช่ตอนสร้าง hook — หน้าจอที่แสดงหลายกรุ๊ปพร้อมกัน
 * (เช่น Drawer จัดหัวหน้าทัวร์) จึงใช้ตัวเดียวกันได้ทุกแถว โดยโหลดเอกสารรอบเดียว
 *
 * คืนธง hasData มาด้วย เพื่อให้ UI แยก "ตรวจแล้วไม่ผ่าน" ออกจาก "ยังไม่มีข้อมูลให้ตรวจ"
 * — สองอย่างนี้ความหมายต่างกันมาก ถ้าแสดงเหมือนกันคนจะเลิกเชื่อคำเตือน
 */

import { useCallback, useMemo } from 'react';
import { masterPassportToRecord } from '@/lib/logic/documentView';
import {
  checkDocumentReadiness,
  type ReadinessPolicy,
  type ReadinessResult,
  type TripWindow,
} from '@/lib/logic/documentReadiness';
import { getDocumentsByLeader } from '@/services/documentStore';
import { getPassportExpiry } from '@/services/tourLeaderMaster';
import type { AnyLeaderDocumentRecord } from '@/data/leaders/documentRecordTypes';

export interface LeaderReadiness {
  result: ReadinessResult;
  /** มีข้อมูลเอกสารให้ตรวจหรือไม่ — false = ยังไม่เคยบันทึกอะไรเลย */
  hasData: boolean;
}

export function useDocumentReadiness(
  policy: Partial<ReadinessPolicy> = {},
): (tourLeaderId: string, trip: TripWindow) => LeaderReadiness {
  const byLeader = useMemo(() => getDocumentsByLeader(), []);

  // แตกเป็นค่าพื้นฐาน เพื่อไม่ให้ callback สร้างใหม่ทุกครั้งที่ผู้เรียกส่ง object ใหม่
  const { passportMonthsAfterReturn, visaRequired, tourCardRequired, criminalRecordValidDays } = policy;

  return useCallback((tourLeaderId: string, trip: TripWindow): LeaderReadiness => {
    const stored = byLeader.get(tourLeaderId) ?? [];
    const master = masterPassportToRecord(tourLeaderId, getPassportExpiry(tourLeaderId));
    const records: AnyLeaderDocumentRecord[] = master ? [...stored, master] : stored;

    const result = checkDocumentReadiness(records, trip, {
      passportMonthsAfterReturn, visaRequired, tourCardRequired, criminalRecordValidDays,
    });

    return { result, hasData: records.length > 0 };
  }, [
    byLeader,
    passportMonthsAfterReturn, visaRequired, tourCardRequired, criminalRecordValidDays,
  ]);
}

/** แปลงงานทัวร์เป็นช่วงเดินทางที่ตัวตรวจใช้ — รวมการหา countryId ไว้ที่เดียว */
export function tripOfJob(
  job: { departDate: string; returnDate: string; country: string },
  countries: readonly { id: string; code: string; nameTh: string }[],
): TripWindow {
  return {
    departDate: job.departDate,
    returnDate: job.returnDate,
    countryId: countries.find((c) => c.nameTh === job.country || c.code === job.country)?.id,
    countryName: job.country,
  };
}
