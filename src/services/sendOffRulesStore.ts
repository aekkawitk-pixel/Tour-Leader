/**
 * เงื่อนไขการจัดเจ้าหน้าที่ส่งกรุ๊ป — ที่เก็บค่าตั้งค่าของผู้จัด
 *
 * เก็บใน localStorage เหมือน Store อื่นของ Demo · เปลี่ยนเป็น REST/DB ได้ที่ไฟล์นี้จุดเดียว
 * ค่าที่ยังไม่เคยตั้ง หรือค่าที่เสียหาย จะตกกลับเป็นค่าเริ่มต้นเสมอ ไม่ปล่อยให้ตรวจด้วยค่าว่าง
 */

import { DEFAULT_SEND_OFF_RULES, type SendOffRules } from '@/lib/logic/sendOffRules';
import { readJson, writeJson } from './browserStorage';

const KEY = 'sendOffRules';

/** เงื่อนไขปัจจุบัน — เติมค่าที่ขาดด้วยค่าเริ่มต้น (ข้อมูลเก่าอาจไม่มีฟิลด์ที่เพิ่มทีหลัง) */
export function loadSendOffRules(): SendOffRules {
  const parsed = readJson<Partial<SendOffRules> | null>(KEY, null);
  if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_SEND_OFF_RULES };
  return {
    leadHours: numberOr(parsed.leadHours, DEFAULT_SEND_OFF_RULES.leadHours),
    sameAirportGapHours: numberOr(parsed.sameAirportGapHours, DEFAULT_SEND_OFF_RULES.sameAirportGapHours),
    crossAirportGapHours: numberOr(parsed.crossAirportGapHours, DEFAULT_SEND_OFF_RULES.crossAirportGapHours),
    employeeWorkStart: timeOr(parsed.employeeWorkStart, DEFAULT_SEND_OFF_RULES.employeeWorkStart),
    employeeWorkEnd: timeOr(parsed.employeeWorkEnd, DEFAULT_SEND_OFF_RULES.employeeWorkEnd),
  };
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function timeOr(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : fallback;
}

export function saveSendOffRules(rules: SendOffRules): SendOffRules {
  writeJson(KEY, rules);
  return rules;
}

/** คืนค่าเริ่มต้นของระบบ — ใช้กับปุ่ม "คืนค่าเริ่มต้น" */
export function resetSendOffRules(): SendOffRules {
  return saveSendOffRules({ ...DEFAULT_SEND_OFF_RULES });
}
