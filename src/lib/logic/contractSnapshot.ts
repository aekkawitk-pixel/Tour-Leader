/**
 * สร้าง "ภาพ ณ วันเซ็น" ของสัญญาจ้างรายกรุ๊ป
 *
 * ตรรกะบริสุทธิ์ (รับข้อมูลเป็นพารามิเตอร์) — contractStore จึงไม่ต้องรู้จัก documentStore
 * หรือ Tour Period Master เลย ผู้เรียกดึงข้อมูลมาแล้วส่งเข้ามาตอนกดเซ็น
 *
 * ทำไมต้องตรึงภาพไว้: หัวหน้าทัวร์ต่อหนังสือเดินทางเล่มใหม่ได้ · ข้อมูลกรุ๊ปถูกแก้จากระบบต้นทางได้
 * ถ้าสัญญาอ่านค่าปัจจุบันตลอด สัญญาที่เซ็นไปแล้วจะค่อย ๆ ไม่ตรงกับกระดาษจริง
 */

import { maskDocumentNumber } from '@/modules/tour-leaders/utils';
import type { AnyLeaderDocumentRecord } from '@/data/leaders/documentRecordTypes';
import type { ContractPartySnapshot, ContractPeriodSnapshot } from '@/data/contracts/contractTypes';
import type { TourLeader } from '@/types';

/** ตัดเวลาออกจาก ISO datetime ให้เหลือเฉพาะวันที่ (ค่าว่าง/null → null) */
function toDateOnly(value: string | null | undefined): string | null {
  const clean = value?.trim();
  return clean ? clean.slice(0, 10) : null;
}

/**
 * ข้อมูลคู่สัญญา ณ วันเซ็น
 * ชื่ออังกฤษยึดตามหน้าหนังสือเดินทางก่อนเสมอ — เป็นชื่อที่ใช้บนเอกสารเดินทางจริง
 * ถ้ายังไม่มีเล่มในระบบ จึงค่อยใช้ชื่อในระบบแทน
 */
export function buildPartySnapshot(
  leader: TourLeader,
  passport: AnyLeaderDocumentRecord | null,
): ContractPartySnapshot {
  const bookFirst = passport?.fields.firstName?.trim() ?? '';
  const bookLast = passport?.fields.lastName?.trim() ?? '';
  const bookName = `${bookFirst} ${bookLast}`.trim();
  const systemName = `${leader.firstNameEn ?? ''} ${leader.lastNameEn ?? ''}`.trim();

  return {
    leaderNameTh: `${leader.firstName} ${leader.lastName}`.trim(),
    leaderNameEn: bookName || systemName,
    passportDocId: passport?.docId ?? null,
    passportNoMasked: passport
      ? maskDocumentNumber('passport', passport.fields.passportNo ?? '')
      : '',
    passportExpiresAt: toDateOnly(passport?.fields.expiryDate),
  };
}

/** ข้อมูลพีเรียดที่ต้องใช้ทำ snapshot — รับเฉพาะช่องที่ใช้จริง ไม่ผูกกับทั้ง Master */
export interface PeriodSnapshotSource {
  groupCode: string;
  startDateTime: string | null;
  endDateTime: string | null;
  route: string | null;
}

/** ข้อมูลกรุ๊ป ณ วันเซ็น — ชื่อประเทศให้ผู้เรียกแปลงจาก Country Master มาแล้ว */
export function buildPeriodSnapshot(
  period: PeriodSnapshotSource,
  countryName: string,
): ContractPeriodSnapshot {
  return {
    groupCode: period.groupCode,
    startDate: toDateOnly(period.startDateTime),
    endDate: toDateOnly(period.endDateTime),
    countryName,
    route: period.route?.trim() || null,
  };
}

/**
 * ภาพในสัญญาต่างจากข้อมูลปัจจุบันตรงไหนบ้าง — ใช้เตือนตอนตรวจสอบย้อนหลัง
 * คืนรายการคำอธิบายที่แสดงต่อผู้ใช้ได้ทันที (ว่างเปล่า = ยังตรงกันทุกอย่าง)
 */
export function diffPartySnapshot(
  snapshot: ContractPartySnapshot,
  current: ContractPartySnapshot,
): string[] {
  const diffs: string[] = [];
  if (snapshot.passportDocId !== current.passportDocId) {
    diffs.push('หนังสือเดินทางที่ใช้ยืนยันตัวตนไม่ใช่เล่มเดิมกับตอนเซ็น');
  }
  if (snapshot.passportNoMasked !== current.passportNoMasked) {
    diffs.push(`เลขหนังสือเดินทางเปลี่ยน (ตอนเซ็น ${snapshot.passportNoMasked || '—'})`);
  }
  if (snapshot.leaderNameEn !== current.leaderNameEn) {
    diffs.push(`ชื่อภาษาอังกฤษเปลี่ยน (ตอนเซ็น ${snapshot.leaderNameEn || '—'})`);
  }
  return diffs;
}
